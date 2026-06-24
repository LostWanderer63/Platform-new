import { cn } from "../../lib/cn";

export function ProgressBar({
  value,
  tone = "accent",
  className,
  showLabel,
}: {
  value: number;
  tone?: "accent" | "gold" | "success";
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill =
    tone === "gold"
      ? "from-gold to-bronze"
      : tone === "success"
        ? "from-success to-accent-2"
        : "from-accent to-accent-2";
  return (
    <div className={cn("w-full", className)}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-glass/10"
      >
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-smooth",
            fill
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <p className="mt-1 text-right font-stat text-xs text-ink-mut">{pct}%</p>}
    </div>
  );
}
