import { forwardRef } from "react";
import { cn } from "@/lib/cn";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = "md", className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid place-items-center rounded-md text-ink-soft transition-all duration-200",
        "hover:bg-glass/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent active:scale-90",
        active && "bg-accent/15 text-accent",
        size === "sm" ? "h-9 w-9" : "h-10 w-10",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
