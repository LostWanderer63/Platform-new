import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, TableWrap, StatusChip } from "@/components/ui";

interface Sub {
  id: string;
  name: string;
  code: string;
  status: string;
  commissionPct: string;
  balance: string;
  createdAt: string;
}

export function PortalSubs() {
  const [rows, setRows] = useState<Sub[]>([]);
  useEffect(() => {
    api.get<Sub[]>("/portal/subs").then(setRows).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Sub-distributors" subtitle="Distributors under you" />
      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Name</th>
            <th className="th">Code</th>
            <th className="th">Commission</th>
            <th className="th">Balance</th>
            <th className="th">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="td text-mut" colSpan={5}>No sub-distributors. Contact an admin to add one.</td></tr>
          )}
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-line/50">
              <td className="td font-semibold">{s.name}</td>
              <td className="td font-mono text-xs">{s.code}</td>
              <td className="td">{s.commissionPct}%</td>
              <td className="td font-bold">${s.balance}</td>
              <td className="td"><StatusChip value={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
