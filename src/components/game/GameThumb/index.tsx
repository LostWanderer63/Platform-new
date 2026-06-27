/** Deterministic gradient thumbnail — replaces real art, theme-aware. */
export function GameThumb({ name, hue, className = "" }: { name: string; hue: number; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className="absolute inset-0 transition-transform duration-500 ease-smooth group-hover:scale-110"
        style={{
          background: `radial-gradient(120% 100% at 25% 0%, hsl(${hue} 85% 55% / 0.85), transparent 55%),
            radial-gradient(120% 120% at 100% 100%, hsl(${(hue + 60) % 360} 90% 50% / 0.7), transparent 55%),
            rgb(var(--c-card))`,
        }}
      />
      <div className="absolute inset-0 grid place-items-center px-2 text-center">
        <span className="font-display text-lg font-extrabold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
          {name}
        </span>
      </div>
    </div>
  );
}
