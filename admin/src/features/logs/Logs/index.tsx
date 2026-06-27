import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, TableWrap } from "@/components/ui";

interface Log {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: string;
}

export function Logs() {
  const [rows, setRows] = useState<Log[]>([]);
  useEffect(() => {
    api.get<Log[]>("/admin/logs?limit=200").then(setRows).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Every staff action, newest first" />
      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Actor</th>
            <th className="th">Action</th>
            <th className="th">Target</th>
            <th className="th">Detail</th>
            <th className="th">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="td text-mut" colSpan={5}>No log entries yet.</td></tr>
          )}
          {rows.map((l) => (
            <tr key={l.id} className="border-b border-line/50">
              <td className="td font-semibold">{l.actor}</td>
              <td className="td font-mono text-xs text-accent2">{l.action}</td>
              <td className="td font-mono text-xs text-mut">{l.target ?? "—"}</td>
              <td className="td text-xs text-mut">{l.meta ? JSON.stringify(l.meta) : "—"}</td>
              <td className="td text-xs text-mut">{new Date(l.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
