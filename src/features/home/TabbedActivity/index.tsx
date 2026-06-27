import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useWallet, type LiveWin } from "@/lib/wallet";

interface Row {
  id: string;
  user: string;
  game: string;
  multiplier: string;
  amount: string;
}

const toRow = (w: LiveWin, i: number): Row => ({
  id: `${w.at}-${w.username}-${i}`,
  user: w.username,
  game: w.game,
  multiplier: `${Number(w.multiplier).toFixed(2)}×`,
  amount: `$${w.amount}`,
});

type Tab = "all" | "high";

const ROW_ANIM = {
  layout: true,
  initial: { opacity: 0, y: -12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0 },
  transition: { type: "spring" as const, stiffness: 420, damping: 32 },
};

/** Live community activity — real recent wins (+ socket live feed) and a demo daily race. */
export function TabbedActivity() {
  const { liveWins } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [seed, setSeed] = useState<LiveWin[]>([]);

  useEffect(() => {
    api.get<LiveWin[]>("/games/recent-wins?limit=10").then(setSeed).catch(() => setSeed([]));
  }, []);

  const rows: Row[] = [...liveWins, ...seed].slice(0, 6).map(toRow);
  const highRollers = rows.filter((r) => parseFloat(r.amount.replace(/[^0-9.]/g, "")) > 1000);
  const list = activeTab === "all" ? rows : highRollers;

  return (
    <Card className="lg:col-span-2">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Community Activity
        </h3>
        <div className="flex rounded-md bg-glass/5 p-1">
          {([
            { id: "all", label: "All Bets" },
            { id: "high", label: "High Rollers" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                activeTab === t.id ? "bg-accent font-bold text-white shadow-glow" : "text-ink-soft hover:bg-glass/5 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {(activeTab === "all" || activeTab === "high") && (
        <div className="space-y-1">
          <div className="hidden grid-cols-4 px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-ink-mut sm:grid">
            <span>Player</span>
            <span>Game</span>
            <span className="text-right">Multiplier</span>
            <span className="text-right">Payout</span>
          </div>
          {list.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-mut">
              {activeTab === "high" ? "Waiting for high roller wins…" : "No wins yet — place a bet to get started!"}
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {list.map((w, idx) => (
                <motion.div
                  key={w.id}
                  {...ROW_ANIM}
                  className={`grid grid-cols-2 items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-glass/[0.04] sm:grid-cols-4 ${
                    idx === 0 ? (activeTab === "high" ? "bg-gold/[0.05]" : "bg-accent/[0.05]") : ""
                  }`}
                >
                  <span className={`flex items-center gap-2 font-semibold ${activeTab === "high" ? "text-gold" : ""}`}>
                    <Avatar name={w.user} size="sm" />
                    <span className="truncate">{w.user}</span>
                  </span>
                  <span className="truncate text-ink-mut">{w.game}</span>
                  <span className={`text-right font-stat font-semibold ${activeTab === "high" ? "text-gold" : "text-accent"}`}>
                    {w.multiplier}
                  </span>
                  <span className="text-right font-stat font-bold text-success">{w.amount}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      )}

    </Card>
  );
}
