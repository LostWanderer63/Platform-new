import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, iconLeft, iconRight, className, id, ...rest },
  ref
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-ink-soft">
          {label}
        </label>
      )}
      <div className="relative">
        {iconLeft && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mut">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-err` : undefined}
          className={cn(
            "h-11 w-full rounded-md bg-glass/[0.04] text-sm text-ink placeholder:text-ink-mut",
            "border border-line/15 transition-all duration-200",
            "hover:border-line/25 focus:border-accent/60 focus:bg-glass/[0.07] focus:outline-none focus:ring-2 focus:ring-accent/30",
            iconLeft ? "pl-10" : "pl-3.5",
            iconRight ? "pr-10" : "pr-3.5",
            error && "border-danger/60 focus:border-danger focus:ring-danger/30",
            className
          )}
          {...rest}
        />
        {iconRight && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mut">{iconRight}</span>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-mut">{hint}</p>
      ) : null}
    </div>
  );
});
