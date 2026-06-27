import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto rounded-full glass p-1.5", className)}>
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-pressed={active === t.id}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ease-smooth",
            active === t.id ? "bg-accent/15 text-ink shadow-glow" : "text-ink-mut hover:text-ink-soft"
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
