import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PageHeader, TableWrap } from "@/components/ui";

interface Withdrawal {
  id: string;
  user: string;
  amount: string;
  method: string;
  createdAt: string;
}

export function Withdrawals() {
  const { push } = useToast();
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.get<Withdrawal[]>("/admin/withdrawals/pending").then(setRows).catch((e) => push(e.message, "bad"));
  useEffect(() => { load(); }, []);

  const approve = async (w: Withdrawal) => {
    if (!confirm(`Approve $${w.amount} withdrawal for ${w.user}? Funds will be paid out.`)) return;
    setBusy(w.id);
    try {
      await api.post(`/admin/withdrawals/${w.id}/approve`, {});
      push(`Approved — $${w.amount} paid to ${w.user}`);
      load();
    } catch (e) {
      push((e as ApiError).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (w: Withdrawal) => {
    const reason = prompt(`Reject ${w.user}'s $${w.amount} withdrawal? Funds are returned.\nReason (optional):`);
    if (reason === null) return;
    setBusy(w.id);
    try {
      await api.post(`/admin/withdrawals/${w.id}/reject`, { reason });
      push(`Rejected — $${w.amount} returned to ${w.user}`);
      load();
    } catch (e) {
      push((e as ApiError).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Withdrawals" subtitle="Approve or reject pending payout requests" />
      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Player</th>
            <th className="th">Amount</th>
            <th className="th">Method</th>
            <th className="th">Requested</th>
            <th className="th text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="td text-mut" colSpan={5}>No pending withdrawals. 🎉</td></tr>
          )}
          {rows.map((w) => (
            <tr key={w.id} className="border-b border-line/50">
              <td className="td font-semibold">{w.user}</td>
              <td className="td font-bold">${w.amount}</td>
              <td className="td text-mut">{w.method}</td>
              <td className="td text-xs text-mut">{new Date(w.createdAt).toLocaleString()}</td>
              <td className="td">
                <div className="flex justify-end gap-1">
                  <button title="Approve" disabled={busy === w.id} className="btn-primary px-2 py-1" onClick={() => approve(w)}><Check className="h-4 w-4" /></button>
                  <button title="Reject" disabled={busy === w.id} className="btn-bad px-2 py-1" onClick={() => reject(w)}><X className="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
