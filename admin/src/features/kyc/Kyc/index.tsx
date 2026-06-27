import { useEffect, useState } from "react";
import { ShieldCheck, ShieldX } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PageHeader, TableWrap, StatusChip } from "@/components/ui";

interface KycRow {
  id: string;
  username: string;
  email: string;
  kycStatus: string;
  balance: string;
  createdAt: string;
}

export function Kyc() {
  const { push } = useToast();
  const [rows, setRows] = useState<KycRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.get<KycRow[]>("/admin/kyc").then(setRows).catch((e) => push(e.message, "bad"));
  useEffect(() => { load(); }, []);

  const decide = async (r: KycRow, status: "VERIFIED" | "REJECTED") => {
    if (!confirm(`Mark ${r.username}'s KYC as ${status}?`)) return;
    setBusy(r.id);
    try {
      await api.post(`/admin/players/${r.id}/kyc`, { status });
      push(`${r.username} → KYC ${status}`);
      load();
    } catch (e) {
      push((e as ApiError).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="KYC Review" subtitle="Verify or reject identity submissions" />
      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Player</th>
            <th className="th">Current</th>
            <th className="th">Balance</th>
            <th className="th">Joined</th>
            <th className="th text-right">Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="td text-mut" colSpan={5}>No pending KYC reviews.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/50">
              <td className="td">
                <p className="font-semibold">{r.username}</p>
                <p className="text-xs text-mut">{r.email}</p>
              </td>
              <td className="td"><StatusChip value={r.kycStatus} /></td>
              <td className="td font-bold">${r.balance}</td>
              <td className="td text-xs text-mut">{new Date(r.createdAt).toLocaleDateString()}</td>
              <td className="td">
                <div className="flex justify-end gap-1">
                  <button title="Verify" disabled={busy === r.id} className="btn-primary px-2 py-1" onClick={() => decide(r, "VERIFIED")}><ShieldCheck className="h-4 w-4" /></button>
                  <button title="Reject" disabled={busy === r.id} className="btn-bad px-2 py-1" onClick={() => decide(r, "REJECTED")}><ShieldX className="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
