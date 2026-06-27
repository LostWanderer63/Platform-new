import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function SectionTitle({
  icon,
  title,
  href = "/casino",
}: {
  icon?: React.ReactNode;
  title: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
        {icon && <span className="text-accent">{icon}</span>}
        {title}
      </h2>
      <Link
        to={href}
        className="flex items-center gap-1 text-xs font-semibold text-ink-mut transition-colors hover:text-accent"
      >
        View all <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
