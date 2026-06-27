import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card, TableWrap, StatusChip } from "@/components/ui";

interface Metrics {
  users: { total: number; active: number; online: number };
  ggrAllTime: string;
  ggr24h: string;
  bets: { total: number; last24h: number };
  wagered24h: string;
  deposits: string;
  withdrawals: string;
}
interface Risk {
  betId: string;
  user: string;
  game: string;
  amount: string;
  payout: string;
  multiplier: string;
  level: string;
}

export function Dashboard() {
  const [m, setM] = useState<Metrics | null>(null);
  const [risk, setRisk] = useState<Risk[]>([]);

  useEffect(() => {
    api.get<Metrics>("/admin/metrics").then(setM).catch(() => {});
    api.get<Risk[]>("/admin/risk").then(setRisk).catch(() => {});
  }, []);

  const kpis = m
    ? [
        ["GGR (24h)", `$${m.ggr24h}`],
        ["GGR all-time", `$${m.ggrAllTime}`],
        ["Wagered 24h", `$${m.wagered24h}`],
        ["Players", `${m.users.active}/${m.users.total}`],
        ["Online", `${m.users.online}`],
        ["Bets 24h", `${m.bets.last24h}`],
        ["Deposits", `$${m.deposits}`],
        ["Withdrawals", `$${m.withdrawals}`],
      ]
    : [];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live operations overview" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xl font-extrabold tracking-tight">{value}</p>
            <p className="mt-0.5 text-xs text-mut">{label}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">Risk queue · biggest wins (24h)</h2>
      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className="th">Player</th>
            <th className="th">Game</th>
            <th className="th">Bet</th>
            <th className="th">Payout</th>
            <th className="th">Mult</th>
            <th className="th">Risk</th>
          </tr>
        </thead>
        <tbody>
          {risk.length === 0 && (
            <tr>
              <td className="td text-mut" colSpan={6}>
                No flagged activity.
              </td>
            </tr>
          )}
          {risk.map((r) => (
            <tr key={r.betId} className="border-b border-line/50">
              <td className="td font-semibold">{r.user}</td>
              <td className="td text-mut">{r.game}</td>
              <td className="td">${r.amount}</td>
              <td className="td font-bold text-ok">${r.payout}</td>
              <td className="td text-accent2">{r.multiplier}x</td>
              <td className="td">
                <StatusChip value={r.level} />
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
