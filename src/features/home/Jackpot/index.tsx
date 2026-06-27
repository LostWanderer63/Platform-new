import { Card } from "@/components/ui/Card";
import { useCountUp } from "@/lib/useCountUp";

/** Animated mega-jackpot card with tier breakdown. */
export function Jackpot() {
  const v = useCountUp(1284910, 1600);
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-3xl" />
      <p className="text-xs font-bold uppercase tracking-wider text-gold">Mega Jackpot</p>
      <p className="mt-2 font-stat text-4xl font-extrabold tracking-tight text-gradient">
        ${Math.round(v).toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-ink-mut">Drops within 4 hours</p>
      <div className="mt-5 space-y-2">
        {["Grand · $1.2M", "Major · $48k", "Minor · $2.4k"].map((j) => (
          <div key={j} className="flex items-center justify-between rounded-md bg-glass/[0.04] px-3 py-2 text-sm">
            <span className="font-semibold">{j.split(" · ")[0]}</span>
            <span className="font-stat font-bold text-gold">{j.split(" · ")[1]}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
