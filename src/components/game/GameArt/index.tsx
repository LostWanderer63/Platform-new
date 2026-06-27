import { useState } from "react";
import type { Game } from "@/data/mock";

/* ============================================================
   GameArt — original illustrated cover art per game (SVG).
   GameImage — real themed photo from the internet (loremflickr),
   falls back to GameArt SVG if the image fails / offline.
   ============================================================ */

type Motif =
  | "crash"
  | "dice"
  | "mines"
  | "plinko"
  | "roulette"
  | "wheel"
  | "coin"
  | "cards"
  | "slots"
  | "live";

export function pickMotif(g: Game): Motif {
  const byId: Record<string, Motif> = {
    crash: "crash",
    dice: "dice",
    mines: "mines",
    plinko: "plinko",
    roulette: "roulette",
    wheel: "wheel",
    coinflip: "coin",
    blackjack: "cards",
  };
  if (byId[g.id]) return byId[g.id];
  if (g.category === "Live") return "live";
  if (g.category === "Table") return "cards";
  return "slots";
}

const A = "rgb(var(--c-accent))";
const A2 = "rgb(var(--c-accent-2))";
const G = "rgb(var(--c-gold))";

export function GameArt({ game, className = "" }: { game: Game; className?: string }) {
  const h = game.hue;
  const h2 = (h + 50) % 360;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* layered gradient backdrop */}
      <div
        className="absolute inset-0 transition-transform duration-500 ease-smooth group-hover:scale-110"
        style={{
          background: `radial-gradient(130% 110% at 25% 12%, hsl(${h} 88% 58% / 0.95), transparent 55%),
            radial-gradient(120% 130% at 100% 105%, hsl(${h2} 92% 52% / 0.8), transparent 55%),
            linear-gradient(160deg, hsl(${h} 45% 16%), rgb(var(--c-card)))`,
        }}
      />
      {/* soft top sheen */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-base/40" />
      {/* sparkle dots */}
      <div
        className="absolute inset-0 opacity-60 mix-blend-screen"
        style={{
          backgroundImage:
            "radial-gradient(1.2px 1.2px at 20% 30%, white, transparent), radial-gradient(1px 1px at 70% 20%, white, transparent), radial-gradient(1.4px 1.4px at 85% 60%, white, transparent), radial-gradient(1px 1px at 40% 75%, white, transparent)",
        }}
      />

      {/* motif */}
      <div className="absolute inset-0 grid place-items-center p-3 transition-transform duration-500 ease-smooth group-hover:scale-105">
        <svg viewBox="0 0 120 120" className="h-[62%] w-[62%] drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]">
          <Scene motif={pickMotif(game)} />
        </svg>
      </div>
    </div>
  );
}

/* Per-game PNG cover (public/games/<id>.png or licensed game.img),
   with graceful SVG fallback if the file is missing. */
export function GameImage({ game, className = "" }: { game: Game; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <GameArt game={game} className={className} />;

  const src = game.img || `/games/${game.id}.png`;

  return (
    <div className={`relative overflow-hidden bg-card ${className}`}>
      <img
        src={src}
        alt={game.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-smooth group-hover:scale-110"
      />
    </div>
  );
}

function Scene({ motif }: { motif: Motif }) {
  switch (motif) {
    case "crash":
      return (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 108 Q55 100 104 18" stroke={A2} strokeWidth="3" strokeDasharray="2 7" opacity="0.8" />
          <g transform="rotate(45 70 50)">
            <path d="M70 24 C82 36 82 56 70 70 C58 56 58 36 70 24 Z" fill="white" />
            <circle cx="70" cy="44" r="6" fill={A} />
            <path d="M58 64 L52 78 L66 70 Z" fill={A2} />
            <path d="M82 64 L88 78 L74 70 Z" fill={A2} />
            <path d="M64 70 Q70 86 76 70 Z" fill={G} />
          </g>
          <circle cx="24" cy="30" r="2" fill="white" />
          <circle cx="98" cy="84" r="2.5" fill={G} />
        </g>
      );
    case "dice":
      return (
        <g>
          <g transform="rotate(-12 44 60)">
            <rect x="20" y="40" width="44" height="44" rx="10" fill="white" />
            {[
              [32, 52],
              [52, 52],
              [42, 62],
              [32, 72],
              [52, 72],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4" fill={A} />
            ))}
          </g>
          <g transform="rotate(14 80 56)">
            <rect x="58" y="34" width="40" height="40" rx="9" fill={A} />
            {[
              [68, 44],
              [88, 44],
              [68, 64],
              [88, 64],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3.6" fill="white" />
            ))}
          </g>
        </g>
      );
    case "mines":
      return (
        <g>
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <rect
                key={`${r}${c}`}
                x={24 + c * 26}
                y={24 + r * 26}
                width="20"
                height="20"
                rx="5"
                fill="white"
                opacity={r === 1 && c === 1 ? 0 : 0.12}
              />
            ))
          )}
          <circle cx="60" cy="62" r="22" fill={A} />
          <circle cx="52" cy="54" r="6" fill="white" opacity="0.7" />
          <path
            d="M60 40 L60 30 M60 30 L70 24"
            stroke={G}
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="72" cy="22" r="4" fill={G} />
          <path
            d="M50 50 l4 4 M70 70 l-4 -4"
            stroke="rgb(var(--c-bg-base))"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      );
    case "plinko":
      return (
        <g>
          {[0, 1, 2, 3].map((row) =>
            Array.from({ length: row + 2 }).map((_, i) => {
              const span = (row + 1) * 12;
              const x = 60 - span / 2 + i * 12;
              const y = 28 + row * 16;
              return <circle key={`${row}${i}`} cx={x} cy={y} r="3.2" fill="white" opacity="0.85" />;
            })
          )}
          <circle cx="60" cy="18" r="6" fill={G} />
          {[-1, 0, 1].map((m, i) => (
            <rect
              key={i}
              x={48 + m * 16 - 6}
              y="96"
              width="12"
              height="14"
              rx="3"
              fill={i === 1 ? A : A2}
              opacity="0.9"
            />
          ))}
        </g>
      );
    case "roulette":
      return (
        <g>
          <circle cx="60" cy="60" r="40" fill="none" stroke="white" strokeWidth="3" opacity="0.5" />
          <circle cx="60" cy="60" r="40" fill={A} opacity="0.25" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const x1 = 60 + Math.cos(a) * 40,
              y1 = 60 + Math.sin(a) * 40,
              x2 = 60 + Math.cos(a) * 22,
              y2 = 60 + Math.sin(a) * 22;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 2 ? A2 : G} strokeWidth="3" />;
          })}
          <circle cx="60" cy="60" r="18" fill="rgb(var(--c-bg-base))" />
          <circle cx="60" cy="60" r="9" fill={A} />
          <circle cx="92" cy="44" r="4.5" fill="white" />
        </g>
      );
    case "wheel":
      return (
        <g>
          {Array.from({ length: 8 }).map((_, i) => {
            const a0 = (i / 8) * Math.PI * 2,
              a1 = ((i + 1) / 8) * Math.PI * 2;
            const x0 = 60 + Math.cos(a0) * 40,
              y0 = 60 + Math.sin(a0) * 40,
              x1 = 60 + Math.cos(a1) * 40,
              y1 = 60 + Math.sin(a1) * 40;
            return (
              <path
                key={i}
                d={`M60 60 L${x0} ${y0} A40 40 0 0 1 ${x1} ${y1} Z`}
                fill={i % 2 ? A : A2}
                opacity={0.55 + (i % 3) * 0.15}
              />
            );
          })}
          <circle cx="60" cy="60" r="40" fill="none" stroke="white" strokeWidth="2" opacity="0.5" />
          <circle cx="60" cy="60" r="8" fill="white" />
          <path d="M60 12 L53 26 L67 26 Z" fill={G} />
        </g>
      );
    case "coin":
      return (
        <g>
          <ellipse cx="60" cy="60" rx="34" ry="38" fill={G} />
          <ellipse
            cx="60"
            cy="60"
            rx="26"
            ry="30"
            fill="none"
            stroke="rgb(var(--c-bg-base))"
            strokeWidth="2"
            opacity="0.4"
          />
          <path
            d="M60 42 l5 12 13 1 -10 9 4 13 -12 -8 -12 8 4 -13 -10 -9 13 -1 Z"
            fill="rgb(var(--c-bg-base))"
            opacity="0.55"
          />
          <path
            d="M24 40 Q14 60 24 80"
            stroke={A2}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="2 6"
          />
        </g>
      );
    case "cards":
      return (
        <g>
          <g transform="rotate(-14 46 64)">
            <rect x="24" y="34" width="44" height="60" rx="7" fill="white" />
            <path d="M46 48 l8 14 -16 0 Z" fill={A} />
            <text x="30" y="50" fontSize="13" fontWeight="700" fill={A}>
              A
            </text>
          </g>
          <g transform="rotate(12 76 60)">
            <rect x="54" y="30" width="44" height="60" rx="7" fill={A} />
            <circle cx="76" cy="58" r="11" fill="white" />
            <text x="60" y="46" fontSize="13" fontWeight="700" fill="white">
              K
            </text>
          </g>
        </g>
      );
    case "live":
      return (
        <g>
          <path d="M16 96 Q60 60 104 96" fill={A} opacity="0.25" />
          <path d="M16 96 Q60 60 104 96" fill="none" stroke="white" strokeWidth="2.5" opacity="0.5" />
          <g transform="rotate(-10 50 60)">
            <rect x="34" y="44" width="30" height="42" rx="5" fill="white" />
            <path d="M49 56 l5 9 -10 0 Z" fill={A} />
          </g>
          <g transform="rotate(10 74 58)">
            <rect x="62" y="40" width="30" height="42" rx="5" fill={A2} />
          </g>
          <circle cx="40" cy="100" r="7" fill={G} />
          <circle cx="54" cy="102" r="7" fill={A} />
          <circle cx="68" cy="100" r="7" fill={A2} />
        </g>
      );
  }
}
