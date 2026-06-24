import { useState } from "react";
import { Trophy, Flame, Clock, X, Radio } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../lib/toast";

const LEAGUES = [
  { id: "soccer", label: "Soccer", icon: <Trophy className="h-4 w-4" /> },
  { id: "basket", label: "Basketball" },
  { id: "tennis", label: "Tennis" },
  { id: "esports", label: "Esports" },
  { id: "mma", label: "MMA" },
];

interface Match {
  league: string;
  home: string;
  away: string;
  time: string;
  live?: boolean;
  odds: [string, string, string];
}
const MATCHES: Match[] = [
  {
    league: "Premier League",
    home: "Arsenal",
    away: "Chelsea",
    time: "LIVE 67'",
    live: true,
    odds: ["1.85", "3.40", "4.10"],
  },
  { league: "La Liga", home: "Real Madrid", away: "Sevilla", time: "20:45", odds: ["1.42", "4.80", "6.50"] },
  { league: "NBA", home: "Lakers", away: "Celtics", time: "22:00", odds: ["2.10", "—", "1.75"] },
  { league: "Champions Lg", home: "Bayern", away: "PSG", time: "Tomorrow", odds: ["2.05", "3.60", "3.30"] },
  { league: "CS2 Major", home: "NAVI", away: "FaZe", time: "LIVE", live: true, odds: ["1.66", "—", "2.20"] },
];

export function Sports() {
  const { push } = useToast();
  const [league, setLeague] = useState("soccer");
  const [slip, setSlip] = useState<{ key: string; label: string; odds: string }[]>([
    { key: "arsenal", label: "Arsenal to win", odds: "1.85" },
  ]);

  const add = (key: string, label: string, odds: string) =>
    setSlip((s) => (s.find((x) => x.key === key) ? s : [...s, { key, label, odds }]));

  const total = slip.reduce((acc, s) => acc * parseFloat(s.odds), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Sportsbook</h1>
        <p className="mt-1 text-sm text-ink-soft">Live odds · cash out anytime · 30+ sports</p>
      </div>

      <Tabs items={LEAGUES} active={league} onChange={setLeague} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* matches */}
        <div className="space-y-4">
          {/* featured */}
          <Card className="relative overflow-hidden" padded>
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
            <Badge tone="danger" dot>
              Live now
            </Badge>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-center">
                <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-accent/40 to-accent-2/40 font-display text-xl font-bold">
                  A
                </div>
                <p className="font-display font-bold">Arsenal</p>
              </div>
              <div className="text-center">
                <p className="font-stat text-3xl font-extrabold">2 — 1</p>
                <p className="text-xs text-danger">67'</p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-danger/40 to-warning/40 font-display text-xl font-bold">
                  C
                </div>
                <p className="font-display font-bold">Chelsea</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ["Arsenal", "1.85"],
                ["Draw", "3.40"],
                ["Chelsea", "4.10"],
              ].map(([l, o]) => (
                <button
                  key={l}
                  onClick={() => add(`f-${l}`, `${l} to win`, o)}
                  className="rounded-md glass-hi py-3 text-center transition-colors hover:bg-accent/10"
                >
                  <p className="text-xs text-ink-mut">{l}</p>
                  <p className="font-stat text-lg font-bold text-accent">{o}</p>
                </button>
              ))}
            </div>
          </Card>

          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <Flame className="h-5 w-5 text-accent" /> Popular matches
          </div>

          {MATCHES.map((m, i) => (
            <Card key={i} padded className="transition-colors hover:bg-glass/[0.06]">
              <div className="mb-3 flex items-center justify-between text-xs text-ink-mut">
                <span>{m.league}</span>
                <span className={`flex items-center gap-1 ${m.live ? "text-danger" : ""}`}>
                  {m.live ? <Radio className="h-3 w-3" /> : <Clock className="h-3 w-3" />} {m.time}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1 text-sm font-semibold">
                  <p className="truncate">{m.home}</p>
                  <p className="truncate text-ink-soft">{m.away}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {m.odds.map((o, j) => (
                    <button
                      key={j}
                      disabled={o === "—"}
                      onClick={() => add(`${i}-${j}`, `${[m.home, "Draw", m.away][j]}`, o)}
                      className="h-12 w-16 rounded-md glass-hi font-stat text-sm font-bold text-accent transition-colors hover:bg-accent/10 disabled:opacity-30"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* bet slip */}
        <div className="lg:sticky lg:top-20 lg:h-fit">
          <Card padded>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Bet Slip</h3>
              <Badge tone="accent">{slip.length}</Badge>
            </div>

            {slip.length === 0 ? (
              <div className="py-10 text-center">
                <Trophy className="mx-auto h-8 w-8 text-ink-mut" />
                <p className="mt-3 text-sm text-ink-mut">Tap odds to add selections.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {slip.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between rounded-md bg-glass/[0.04] p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{s.label}</p>
                        <p className="text-xs text-ink-mut">Match winner</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-stat text-sm font-bold text-accent">{s.odds}</span>
                        <button
                          onClick={() => setSlip((x) => x.filter((i) => i.key !== s.key))}
                          className="text-ink-mut hover:text-danger"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-2 border-t border-line/10 pt-4 text-sm">
                  <div className="flex justify-between text-ink-mut">
                    <span>Stake</span>
                    <span className="font-stat text-ink">$25.00</span>
                  </div>
                  <div className="flex justify-between text-ink-mut">
                    <span>Total odds</span>
                    <span className="font-stat text-accent">{total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Potential win</span>
                    <span className="font-stat text-success">${(25 * total).toFixed(2)}</span>
                  </div>
                </div>
                <Button
                  block
                  size="lg"
                  className="mt-4"
                  onClick={() => {
                    push(`Bet placed — $25.00 @ ${total.toFixed(2)} · win $${(25 * total).toFixed(2)}`);
                    setSlip([]);
                  }}
                >
                  Place bet
                </Button>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
