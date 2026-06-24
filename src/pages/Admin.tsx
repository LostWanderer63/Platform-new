import { useState } from "react";
import { Users, DollarSign, Activity, AlertTriangle, ArrowUpRight, MoreHorizontal } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Stat } from "../components/ui/Stat";
import { Avatar } from "../components/ui/Avatar";
import { useToast } from "../lib/toast";

const KPI = [
  { icon: DollarSign, label: "GGR (24h)", value: "$284,120", delta: { dir: "up" as const, text: "12.4%" } },
  { icon: Users, label: "Active players", value: "38,902", delta: { dir: "up" as const, text: "5.1%" } },
  { icon: Activity, label: "Bets / min", value: "4,210", delta: { dir: "up" as const, text: "2.8%" } },
  { icon: AlertTriangle, label: "Risk flags", value: "17", delta: { dir: "down" as const, text: "3.0%" } },
];

const BARS = [42, 58, 51, 70, 64, 88, 76, 95, 82, 71, 90, 84];
const TOP_GAMES = [
  { g: "Crash", ggr: "$48.2k", bets: "184k", share: 92 },
  { g: "Gates of Olympus", ggr: "$31.4k", bets: "98k", share: 68 },
  { g: "Mines", ggr: "$22.1k", bets: "142k", share: 54 },
  { g: "Plinko", ggr: "$18.7k", bets: "120k", share: 44 },
  { g: "Lightning Roulette", ggr: "$14.0k", bets: "61k", share: 33 },
];
const FLAGS = [
  { u: "ghost_9", r: "Velocity anomaly", lvl: "High" },
  { u: "kx_trade", r: "Bonus abuse pattern", lvl: "Med" },
  { u: "neo_777", r: "Multi-account link", lvl: "High" },
];

export function Admin() {
  const { push } = useToast();
  const [range, setRange] = useState("12h");
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-ink-soft">Realtime · last sync 12s ago</p>
        </div>
        <Badge tone="success" dot>
          Systems healthy
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPI.map((k) => (
          <Card key={k.label} padded>
            <div className="mb-3 flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-accent/15 text-accent">
                <k.icon className="h-5 w-5" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-ink-mut" />
            </div>
            <Stat value={k.value} label={k.label} delta={k.delta} />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* revenue chart */}
        <Card className="lg:col-span-2" padded>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Revenue — last {range}</h2>
            <div className="flex gap-1 rounded-md bg-glass/[0.04] p-1 text-xs font-semibold">
              {["12h", "24h", "7d"].map((t) => (
                <button
                  key={t}
                  onClick={() => setRange(t)}
                  className={`rounded-[6px] px-2.5 py-1 transition-colors ${range === t ? "bg-accent/15 text-ink" : "text-ink-mut hover:text-ink"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex h-48 items-end gap-2">
            {BARS.map((b, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-accent/40 to-accent-2 transition-all duration-300 group-hover:shadow-glow"
                  style={{ height: `${b}%` }}
                />
                <span className="text-[10px] text-ink-mut">{i * 2}h</span>
              </div>
            ))}
          </div>
        </Card>

        {/* risk flags */}
        <Card padded>
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
            <AlertTriangle className="h-5 w-5 text-warning" /> Risk queue
          </h2>
          <div className="space-y-2">
            {FLAGS.map((f) => (
              <div key={f.u} className="flex items-center gap-3 rounded-md bg-glass/[0.04] p-3">
                <Avatar name={f.u} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{f.u}</p>
                  <p className="truncate text-xs text-ink-mut">{f.r}</p>
                </div>
                <Badge tone={f.lvl === "High" ? "danger" : "warning"}>{f.lvl}</Badge>
              </div>
            ))}
          </div>
          <button
            onClick={() => push("Opening risk console…", "info")}
            className="mt-4 w-full rounded-md glass-hi py-2.5 text-sm font-semibold text-ink-soft hover:text-ink"
          >
            Open risk console
          </button>
        </Card>
      </div>

      {/* top games table */}
      <Card padded={false}>
        <div className="flex items-center justify-between p-4">
          <h2 className="font-display text-lg font-bold">Top games by GGR</h2>
          <button
            aria-label="More"
            onClick={() => push("Export · Configure · Refresh", "info")}
            className="text-ink-mut hover:text-ink"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-y border-line/10 text-left text-[11px] uppercase tracking-wider text-ink-mut">
                <th className="px-4 py-2.5 font-bold">Game</th>
                <th className="px-4 py-2.5 font-bold">GGR</th>
                <th className="px-4 py-2.5 font-bold">Bets</th>
                <th className="px-4 py-2.5 font-bold">Share</th>
              </tr>
            </thead>
            <tbody>
              {TOP_GAMES.map((t) => (
                <tr key={t.g} className="border-b border-line/5 hover:bg-glass/[0.03]">
                  <td className="px-4 py-3 font-semibold">{t.g}</td>
                  <td className="px-4 py-3 font-stat text-success">{t.ggr}</td>
                  <td className="px-4 py-3 font-stat text-ink-soft">{t.bets}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-glass/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                          style={{ width: `${t.share}%` }}
                        />
                      </div>
                      <span className="font-stat text-xs text-ink-mut">{t.share}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
