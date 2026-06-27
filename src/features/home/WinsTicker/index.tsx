import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useWallet, type LiveWin } from "@/lib/wallet";

/** Auto-scrolling marquee of recent wins — real data from /games/recent-wins,
 *  topped up live via the wallet socket feed. */
export function WinsTicker() {
  const { liveWins } = useWallet();
  const [seed, setSeed] = useState<LiveWin[]>([]);

  useEffect(() => {
    api.get<LiveWin[]>("/games/recent-wins?limit=15").then(setSeed).catch(() => setSeed([]));
  }, []);

  const wins = [...liveWins, ...seed].slice(0, 15);
  if (wins.length === 0) return null;

  const items = [...wins, ...wins, ...wins];
  return (
    <div className="group relative overflow-hidden rounded-xl glass py-2.5">
      <div className="flex w-max animate-marquee gap-3 group-hover:[animation-play-state:paused]">
        {[...items, ...items].map((w, i) => (
          <div key={i} className="flex shrink-0 items-center gap-2 rounded-full bg-glass/[0.04] px-3 py-1.5 text-xs">
            <Avatar name={w.username} size="sm" />
            <span className="font-semibold">{w.username}</span>
            <span className="text-ink-mut">won</span>
            <span className="font-stat font-bold text-success">${w.amount}</span>
            <span className="text-ink-mut">on {w.game}</span>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-base to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-base to-transparent" />
    </div>
  );
}
