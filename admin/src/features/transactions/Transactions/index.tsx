import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, TableWrap, StatusChip } from "@/components/ui";

interface Txn {
  id: string;
  user: string;
  type: string;
  status: string;
  method: string;
  amount: string;
  providerRef: string | null;
  createdAt: string;
}

export function Transactions() {
  const [rows, setRows] = useState<Txn[]>([]);
  const [type, setType] = useState("");

  const load = (t = "") =>
    api.get<Txn[]>(`/admin/transactions${t ? `?type=${t}` : ""}`).then(setRows).catch(() => {});
  useEffect(() => { load(type); }, [type]);

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="All deposits & withdrawals"
        action={
          <select className="input w-44" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="DEPOSIT">Deposits</option>
            <option value="WITHDRAWAL">Withdrawals</option>
          </select>
        }
      />
      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Player</th>
            <th className="th">Type</th>
            <th className="th">Method</th>
            <th className="th">Amount</th>
            <th className="th">Status</th>
            <th className="th">Ref</th>
            <th className="th">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-line/50">
              <td className="td font-semibold">{t.user}</td>
              <td className="td text-mut">{t.type}</td>
              <td className="td text-mut">{t.method}</td>
              <td className="td font-bold">${t.amount}</td>
              <td className="td"><StatusChip value={t.status} /></td>
              <td className="td font-mono text-xs text-mut">{t.providerRef ?? "—"}</td>
              <td className="td text-xs text-mut">{new Date(t.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
