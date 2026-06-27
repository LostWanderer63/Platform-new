import { useEffect, useState, type ReactNode } from "react";
import { Users, TrendingUp, Crown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

interface PublicStats {
  players: number;
  online: number;
  wagered24h: number;
  biggestWin24h: number;
}

/** Three animated headline stats — real numbers from /stats. */
export function LiveStats() {
  const [s, setS] = useState<PublicStats>({ players: 0, online: 0, wagered24h: 0, biggestWin24h: 0 });

  useEffect(() => {
    api.get<PublicStats>("/stats").then(setS).catch(() => {});
  }, []);

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile icon={<Users className="h-5 w-5" />} target={s.online} fmt={(v) => Math.round(v).toLocaleString()} label="Online now" />
      <StatTile icon={<TrendingUp className="h-5 w-5" />} target={s.wagered24h} fmt={(v) => `$${Math.round(v).toLocaleString()}`} label="Wagered 24h" />
      <StatTile icon={<Crown className="h-5 w-5" />} target={s.biggestWin24h} fmt={(v) => `$${Math.round(v).toLocaleString()}`} label="Biggest win today" />
    </div>
  );
}

function StatTile({ icon, target, fmt, label }: { icon: ReactNode; target: number; fmt: (v: number) => string; label: string }) {
  const [v, setV] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1000;
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setV(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <Card className="flex items-center gap-3" padded>
      <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-md bg-accent/15 text-accent sm:grid">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate font-stat text-lg font-extrabold tracking-tight tabular-nums text-ink sm:text-2xl">
          {fmt(v)}
        </p>
        <p className="truncate text-[11px] text-ink-mut sm:text-xs">{label}</p>
      </div>
    </Card>
  );
}
