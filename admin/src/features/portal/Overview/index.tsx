import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card, StatusChip } from "@/components/ui";

interface Overview {
  name: string;
  code: string;
  level: string;
  status: string;
  commissionPct: string;
  balance: string;
  counts: { players: number; subs: number; players24: number };
}

export function Overview() {
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => {
    api.get<Overview>("/portal/overview").then(setO).catch(() => {});
  }, []);

  if (!o) return <p className="text-mut">Loading…</p>;

  const kpis = [
    ["Balance", `$${o.balance}`],
    ["Commission", `${o.commissionPct}%`],
    ["Players", String(o.counts.players)],
    ["Sub-distributors", String(o.counts.subs)],
    ["New players (24h)", String(o.counts.players24)],
  ];

  return (
    <div>
      <PageHeader
        title={o.name}
        subtitle={`${o.level} · code ${o.code}`}
        action={<StatusChip value={o.status} />}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xl font-extrabold tracking-tight">{value}</p>
            <p className="mt-0.5 text-xs text-mut">{label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
