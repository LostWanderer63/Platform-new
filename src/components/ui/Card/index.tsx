import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  hover?: boolean;
  padded?: boolean;
}

export function Card({ glass = true, hover, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg",
        glass ? "glass" : "bg-surface border border-line/10",
        padded && "p-5",
        hover && "transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-glow",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="font-display text-lg font-bold tracking-tight">{title}</h3>
      {action}
    </div>
  );
}
