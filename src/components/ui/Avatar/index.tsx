import { cn } from "@/lib/cn";

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
};

export function Avatar({
  name,
  size = "md",
  ring,
  online,
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  ring?: boolean;
  online?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "grid place-items-center rounded-full bg-gradient-to-br from-accent/50 to-accent-2/50 font-bold text-ink",
          ring && "ring-2 ring-accent ring-offset-2 ring-offset-base",
          sizes[size]
        )}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-base bg-success" />
      )}
    </div>
  );
}
