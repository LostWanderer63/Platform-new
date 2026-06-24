import { cn } from "../../lib/cn";

export function Stat({
  value,
  label,
  delta,
  className,
}: {
  value: string;
  label: string;
  delta?: { dir: "up" | "down"; text: string };
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="font-stat text-2xl font-bold tracking-tight text-ink sm:text-3xl">{value}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <p className="text-xs text-ink-mut">{label}</p>
        {delta && (
          <span className={cn("text-xs font-semibold", delta.dir === "up" ? "text-success" : "text-danger")}>
            {delta.dir === "up" ? "▲" : "▼"} {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}
