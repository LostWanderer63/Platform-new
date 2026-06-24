import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const base =
  "relative inline-flex items-center justify-center gap-2 font-semibold rounded-md whitespace-nowrap " +
  "transition-all duration-200 ease-spring disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-accent to-accent-2 text-white shadow-glow hover:scale-[1.02] hover:shadow-glow-lg font-bold",
  secondary: "glass-hi text-ink hover:bg-glass/10",
  ghost: "border border-line/20 text-ink-soft hover:border-accent/50 hover:text-ink",
  danger: "bg-danger/90 text-white hover:bg-danger shadow-e2",
  gold: "bg-gradient-to-r from-gold to-bronze text-white font-bold shadow-e2 hover:scale-[1.02]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    block,
    iconLeft,
    iconRight,
    className,
    children,
    disabled,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], block && "w-full", className)}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {!loading && iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});
