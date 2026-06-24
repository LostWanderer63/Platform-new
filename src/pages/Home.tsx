import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Flame,
  Sparkles,
  Dice5,
  Radio,
  Trophy,
  Gift,
  ChevronRight,
  Zap,
  Users,
  TrendingUp,
  Crown,
  Heart,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { SectionTitle } from "../components/common/SectionTitle";
import { Reveal } from "../components/common/Reveal";
import { FeaturedHero } from "../components/home/FeaturedHero";
import { GameRail } from "../components/common/GameRail";
import { GameImage } from "../components/game/GameArt";
import { ORIGINALS, SLOTS, LIVE, WINNERS } from "../data/mock";
import type { Game } from "../data/mock";
import { useToast } from "../lib/toast";
import { useFavorites } from "../lib/favorites";
import { useCountUp } from "../lib/useCountUp";
import { useDelayedReady } from "../lib/useDelayedReady";
import { GameRailSkeleton } from "../components/common/GameRailSkeleton";
import { useWallet } from "../lib/wallet";

const ALL = [...ORIGINALS, ...SLOTS, ...LIVE];

const CATS = [
  { icon: Flame, label: "Trending", to: "/casino" },
  { icon: Sparkles, label: "Originals", to: "/casino" },
  { icon: Dice5, label: "Slots", to: "/casino" },
  { icon: Radio, label: "Live", to: "/casino" },
  { icon: Trophy, label: "Sports", to: "/sports" },
  { icon: Gift, label: "Promos", to: "/home" },
];

/* ---------- Game of the Week Spotlight Card ---------- */
function GameOfTheWeek() {
  return (
    <Card className="relative overflow-hidden p-6 h-full flex flex-col justify-between group" hover>
      <div className="relative">
        <div className="flex items-center justify-between">
          <Badge tone="gold" dot className="animate-pulse">
            Game of the Week
          </Badge>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <span className="h-2 w-2 animate-ping rounded-full bg-success" />
            14.2k Active
          </div>
        </div>

        <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
          Aurora <span className="text-gradient">Crash</span>
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft max-w-xl">
          Predict the multiplier and cash out before the rocket crashes! Scale to infinite heights in this
          high-intensity original.
        </p>

        {/* Game Metrics */}
        <div className="mt-6 grid grid-cols-4 gap-2">
          <div className="rounded-md bg-glass/5 p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-ink-mut">RTP</p>
            <p className="font-stat text-sm font-bold text-accent">99.0%</p>
          </div>
          <div className="rounded-md bg-glass/5 p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-ink-mut">Max Win</p>
            <p className="font-stat text-sm font-bold text-gold">10,000x</p>
          </div>
          <div className="rounded-md bg-glass/5 p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-ink-mut">Volatility</p>
            <p className="font-stat text-sm font-bold text-accent-2">Extreme</p>
          </div>
          <div className="rounded-md bg-glass/5 p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-ink-mut">Type</p>
            <p className="font-stat text-sm font-bold text-ink-soft">Crash</p>
          </div>
        </div>
      </div>

      <div className="relative mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {["Nova_77", "Kairo", "Selene", "Orion"].map((name) => (
              <Avatar key={name} name={name} size="sm" className="ring-2 ring-elevated" />
            ))}
          </div>
          <span className="text-[10px] font-bold text-ink-soft">+1.2k today</span>
        </div>
        <Link to="/game/crash">
          <Button size="sm" iconRight={<ChevronRight className="h-4 w-4" />}>
            Play Crash
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/* ---------- Daily Lucky Fortune Spin Wheel ---------- */
const fmtCurrency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

function DailyLuckySpin() {
  const { deposit } = useWallet();
  const { push } = useToast();

  const segments = [
    { label: "Try Again", amount: 0, fill: "#1c1f2f", text: "#cbd5e1" },
    { label: "$1.50", amount: 1.5, fill: "#7c5cff", text: "#ffffff" },
    { label: "$5.00", amount: 5, fill: "#06b6d4", text: "#ffffff" },
    { label: "$0.50", amount: 0.5, fill: "#2c314a", text: "#ffffff" },
    { label: "$10.00", amount: 10, fill: "#10b981", text: "#ffffff" },
    { label: "Try Again", amount: 0, fill: "#1c1f2f", text: "#cbd5e1" },
    { label: "$25.00", amount: 25, fill: "#f59e0b", text: "#ffffff" },
    { label: "$50.00 Mega", amount: 50, fill: "#ec4899", text: "#ffffff" },
  ];

  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [cooldown, setCooldown] = useState<number>(() => {
    const saved = localStorage.getItem("aurora_spin_cooldown");
    if (!saved) return 0;
    const diff = Number(saved) - Date.now();
    return diff > 0 ? Math.ceil(diff / 1000) : 0;
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(t);
          localStorage.removeItem("aurora_spin_cooldown");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleSpin = () => {
    if (spinning || cooldown > 0) return;

    setSpinning(true);
    const sliceIndex = Math.floor(Math.random() * segments.length);
    const selected = segments[sliceIndex];

    const sliceDegrees = 360 / segments.length;
    const targetAngle = 1800 + (360 - (sliceIndex * sliceDegrees + sliceDegrees / 2));

    setRotation(targetAngle);

    setTimeout(() => {
      setSpinning(false);
      const expiry = Date.now() + 180 * 1000;
      localStorage.setItem("aurora_spin_cooldown", String(expiry));
      setCooldown(180);

      if (selected.amount > 0) {
        deposit(selected.amount);
        push(`🎉 Congratulations! You won ${fmtCurrency(selected.amount)}!`, "success");
      } else {
        push("Better luck next time! Check back in 3 minutes.", "info");
      }
    }, 4000);
  };

  const fmtTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <Card className="relative flex flex-col items-center justify-center p-6 text-center h-full">
      <div className="absolute top-3 left-3">
        <Badge tone="accent">Daily Wheel</Badge>
      </div>

      <h3 className="font-display text-[15px] font-bold text-ink mt-4">Lucky Fortune Spin</h3>
      <p className="text-[11px] text-ink-soft max-w-[200px] mb-4">Spin to win free wallet credits!</p>

      {/* SVG Fortune Wheel */}
      <div className="relative w-44 h-44 my-2">
        {/* Pointer */}
        <div className="absolute -top-2 left-[50%] -translate-x-[50%] z-raised w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[14px] border-t-accent filter drop-shadow-md" />

        {/* Wheel Body */}
        <div
          className="w-full h-full rounded-full border-[5px] border-line/20 bg-elevated shadow-e2 overflow-hidden transition-transform duration-[4000ms] ease-spring"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <svg viewBox="0 0 200 200" className="w-full h-full">
            {segments.map((seg, idx) => {
              const startAngle = (idx * 360) / 8;
              const endAngle = ((idx + 1) * 360) / 8;

              const rad1 = ((startAngle - 90) * Math.PI) / 180;
              const rad2 = ((endAngle - 90) * Math.PI) / 180;

              const cx = 100;
              const cy = 100;
              const r = 94;

              const x1 = cx + r * Math.cos(rad1);
              const y1 = cy + r * Math.sin(rad1);
              const x2 = cx + r * Math.cos(rad2);
              const y2 = cy + r * Math.sin(rad2);

              const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;

              const midAngle = startAngle + 22.5;
              const textRad = ((midAngle - 90) * Math.PI) / 180;
              const tx = cx + r * 0.65 * Math.cos(textRad);
              const ty = cy + r * 0.65 * Math.sin(textRad);

              // Rotate text to follow radius. To avoid upside down text on left side, we rotate by 180 when pointing left
              const flip = midAngle > 90 && midAngle < 270;
              const textRotation = flip ? midAngle + 180 : midAngle;

              return (
                <g key={idx}>
                  <path d={pathData} fill={seg.fill} stroke="rgba(6,7,13,0.3)" strokeWidth="1.5" />
                  <text
                    x={tx}
                    y={ty}
                    transform={`rotate(${textRotation}, ${tx}, ${ty})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: seg.text }}
                    className="font-sans text-[8.5px] font-extrabold tracking-tight"
                  >
                    {seg.label}
                  </text>
                </g>
              );
            })}

            {/* LED Bulbs along outer edge */}
            {Array.from({ length: 16 }).map((_, i) => {
              const angle = (i * 360) / 16;
              const rad = ((angle - 90) * Math.PI) / 180;
              const bx = 100 + 88 * Math.cos(rad);
              const by = 100 + 88 * Math.sin(rad);
              return (
                <circle
                  key={i}
                  cx={bx}
                  cy={by}
                  r="2"
                  fill="#ffffff"
                  className={`opacity-95 filter drop-shadow-[0_0_2px_rgba(255,255,255,0.8)] ${i % 2 === 0 ? "animate-pulse" : ""}`}
                  style={{ animationDelay: `${i * 100}ms`, animationDuration: "1s" }}
                />
              );
            })}

            {/* Inner Ring Area */}
            <circle
              cx="100"
              cy="100"
              r="33"
              fill="rgba(6,7,13,0.5)"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1"
            />
          </svg>
        </div>

        {/* Spin button */}
        <button
          disabled={spinning || cooldown > 0}
          onClick={handleSpin}
          className={`absolute inset-[33%] rounded-full z-raised flex flex-col items-center justify-center font-display font-extrabold text-[11px] shadow-md border border-line/10 transition-all ${
            cooldown > 0
              ? "bg-[#272a3a] text-ink-mut pointer-events-none"
              : spinning
                ? "bg-accent/40 text-ink scale-95"
                : "bg-gradient-to-br from-accent to-accent-2 text-white hover:scale-105 active:scale-95 shadow-lg"
          }`}
        >
          {cooldown > 0 ? (
            <span className="font-stat text-[10px]">{fmtTime(cooldown)}</span>
          ) : spinning ? (
            "..."
          ) : (
            "SPIN"
          )}
        </button>
      </div>
    </Card>
  );
}

export function Home() {
  const { ids } = useFavorites();
  const favGames = ALL.filter((g) => ids.includes(g.id));
  const ready = useDelayedReady(700);

  return (
    <div className="space-y-8">
      <FeaturedHero />
      <WinsTicker />
      <LiveStats />

      {/* Spotlight and Daily Spin */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GameOfTheWeek />
        </div>
        <div>
          <DailyLuckySpin />
        </div>
      </div>

      {/* quick categories */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {CATS.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="group flex flex-col items-center gap-2 rounded-lg glass p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow"
          >
            <c.icon className="h-6 w-6 text-accent transition-transform group-hover:scale-110" />
            <span className="text-xs font-semibold">{c.label}</span>
          </Link>
        ))}
      </div>

      {/* favorites (personalized) */}
      {favGames.length > 0 && (
        <section>
          <SectionTitle icon={<Heart className="h-5 w-5" />} title="Your favorites" />
          <GameRail games={favGames} />
        </section>
      )}

      {/* continue playing */}
      <Card hover>
        <div className="flex items-center gap-2 text-sm font-bold text-accent">
          <Zap className="h-4 w-4" /> Continue playing
        </div>
        <div className="mt-4">
          {ready ? <GameRail games={ORIGINALS.slice(0, 8)} /> : <GameRailSkeleton count={8} />}
        </div>
      </Card>

      {/* trending */}
      <section>
        <SectionTitle icon={<Flame className="h-5 w-5" />} title="Trending now" />
        {ready ? <GameRail games={[...ORIGINALS.slice(2), ...SLOTS.slice(0, 4)]} /> : <GameRailSkeleton />}
      </section>

      {/* recommended */}
      <section>
        <SectionTitle icon={<TrendingUp className="h-5 w-5" />} title="Recommended for you" />
        {ready ? <GameRail games={[...SLOTS.slice(2), ...LIVE.slice(0, 3)]} /> : <GameRailSkeleton />}
      </section>

      {/* originals grid */}
      <Reveal>
        <section>
          <SectionTitle icon={<Sparkles className="h-5 w-5" />} title="Aurora Originals" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {ORIGINALS.map((g) => (
              <GameCardCompact key={g.id} game={g} />
            ))}
          </div>
        </section>
      </Reveal>

      {/* winners + jackpot */}
      <div className="grid gap-4 lg:grid-cols-3">
        <TabbedActivity />
        <Jackpot />
      </div>

      {/* live casino */}
      <Reveal>
        <section>
          <SectionTitle icon={<Radio className="h-5 w-5" />} title="Live casino" />
          {ready ? <GameRail games={LIVE} /> : <GameRailSkeleton />}
        </section>
      </Reveal>
    </div>
  );
}

/* ---------- live wins ticker (marquee) ---------- */
function WinsTicker() {
  const items = [...WINNERS, ...WINNERS, ...WINNERS];
  return (
    <div className="group relative overflow-hidden rounded-xl glass py-2.5">
      <div className="flex w-max gap-3 animate-marquee group-hover:[animation-play-state:paused]">
        {[...items, ...items].map((w, i) => (
          <div
            key={i}
            className="flex shrink-0 items-center gap-2 rounded-full bg-glass/[0.04] px-3 py-1.5 text-xs"
          >
            <Avatar name={w.user} size="sm" />
            <span className="font-semibold">{w.user}</span>
            <span className="text-ink-mut">won</span>
            <span className="font-stat font-bold text-success">{w.amount}</span>
            <span className="text-ink-mut">on {w.game}</span>
          </div>
        ))}
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-base to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-base to-transparent" />
    </div>
  );
}

/* ---------- animated, live-ticking stats ---------- */
// stable drift fns (per 3s tick) — net upward, lightly randomized
const driftOnline = () => Math.round((Math.random() - 0.35) * 60);
const driftWager = () => Math.random() * 0.04;
const driftWin = () => (Math.random() < 0.25 ? Math.round(Math.random() * 4000) : 0);

function LiveStats() {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile
        icon={<Users className="h-5 w-5" />}
        target={38902}
        drift={driftOnline}
        fmt={(v) => Math.round(v).toLocaleString()}
        label="Online now"
      />
      <StatTile
        icon={<TrendingUp className="h-5 w-5" />}
        target={12.4}
        drift={driftWager}
        fmt={(v) => `$${v.toFixed(1)}M`}
        label="Wagered 24h"
      />
      <StatTile
        icon={<Crown className="h-5 w-5" />}
        target={104210}
        drift={driftWin}
        fmt={(v) => `$${Math.round(v).toLocaleString()}`}
        label="Biggest win today"
      />
    </div>
  );
}

function StatTile({
  icon,
  target,
  fmt,
  label,
  drift,
}: {
  icon: ReactNode;
  target: number;
  fmt: (v: number) => string;
  label: string;
  drift?: () => number;
}) {
  const [v, setV] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const startDrift = () => {
      if (!drift) return;
      timer = setInterval(() => setV((x) => Math.max(0, x + drift())), 3000);
    };
    if (reduce) {
      setV(target);
      startDrift();
    } else {
      const start = performance.now();
      const dur = 1200;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        setV(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
        else startDrift();
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
    };
  }, [target, drift]);

  return (
    <Card className="flex items-center gap-3" padded>
      <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-md bg-accent/15 text-accent sm:grid">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate font-stat text-lg font-extrabold tracking-tight text-ink tabular-nums sm:text-2xl">
          {fmt(v)}
        </p>
        <p className="truncate text-[11px] text-ink-mut sm:text-xs">{label}</p>
      </div>
    </Card>
  );
}

/* ---------- self-updating live winners feed ---------- */
const FEED_NAMES = [
  "Nova_77",
  "Kairo",
  "Selene",
  "Vexel",
  "Orion",
  "Lyra",
  "Zephyr",
  "Echo",
  "Riven",
  "Sable",
  "Pyra",
  "Onyx",
];
const FEED_GAMES = [
  "Crash",
  "Mines",
  "Plinko",
  "Dice",
  "Wheel",
  "Gates of Olympus",
  "Sweet Bonanza",
  "Roulette",
];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface Row {
  id: number;
  user: string;
  game: string;
  multiplier: string;
  amount: string;
}

const DAILY_LEADERBOARD = [
  { rank: 1, user: "Zenith_Player", points: 8490, win: "$124,800", hue: 45 },
  { rank: 2, user: "Nova_iGaming", points: 7210, win: "$94,300", hue: 265 },
  { rank: 3, user: "Eclipse_King", points: 6420, win: "$42,100", hue: 160 },
  { rank: 4, user: "Neon_Rider", points: 4180, win: "$21,400", hue: 190 },
  { rank: 5, user: "Zero_Bet", points: 3120, win: "$15,200", hue: 320 },
];

function TabbedActivity() {
  const [activeTab, setActiveTab] = useState<"all" | "high" | "race">("all");
  const [rows, setRows] = useState<Row[]>(() => WINNERS.map((w, i) => ({ id: i, ...w })));
  const [highRollers, setHighRollers] = useState<Row[]>(() =>
    WINNERS.filter((w) => parseFloat(w.amount.replace(/[^0-9.]/g, "")) > 100).map((w, i) => ({ id: i, ...w }))
  );

  const nextId = useRef(WINNERS.length);

  useEffect(() => {
    const t = setInterval(() => {
      const mult = Math.random() * 50 + 1;
      const amt = Math.round(Math.random() * 8000 + 10);
      const isWin = Math.random() > 0.3;
      const displayAmt = isWin ? `$${amt.toLocaleString()}` : "$0.00";

      const newRow: Row = {
        id: nextId.current++,
        user: pick(FEED_NAMES),
        game: pick(FEED_GAMES),
        multiplier: isWin ? `${mult.toFixed(2)}×` : "0.00×",
        amount: displayAmt,
      };

      setRows((r) => [newRow, ...r].slice(0, 6));

      if (isWin && amt > 1500) {
        setHighRollers((h) => [newRow, ...h].slice(0, 6));
      }
    }, 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <Card className="lg:col-span-2">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Community Activity
        </h3>

        {/* Navigation Tabs */}
        <div className="flex bg-glass/5 p-1 rounded-md">
          {[
            { id: "all", label: "All Bets" },
            { id: "high", label: "High Rollers" },
            { id: "race", label: "Daily Race" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === t.id
                  ? "bg-accent text-base font-bold shadow-glow text-white"
                  : "text-ink-soft hover:text-ink hover:bg-glass/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "all" && (
        <div className="space-y-1">
          <div className="hidden grid-cols-4 px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-ink-mut sm:grid">
            <span>Player</span>
            <span>Game</span>
            <span className="text-right">Multiplier</span>
            <span className="text-right">Payout</span>
          </div>
          <AnimatePresence initial={false}>
            {rows.map((w, idx) => (
              <motion.div
                key={w.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className={`grid grid-cols-2 items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-glass/[0.04] sm:grid-cols-4 ${
                  idx === 0 ? "bg-accent/[0.05]" : ""
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Avatar name={w.user} size="sm" />
                  <span className="truncate">{w.user}</span>
                </span>
                <span className="truncate text-ink-mut">{w.game}</span>
                <span className="text-right font-stat font-semibold text-accent">{w.multiplier}</span>
                <span
                  className={`text-right font-stat font-bold ${w.amount === "$0.00" ? "text-ink-mut" : "text-success"}`}
                >
                  {w.amount}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {activeTab === "high" && (
        <div className="space-y-1">
          <div className="hidden grid-cols-4 px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-ink-mut sm:grid">
            <span>Player</span>
            <span>Game</span>
            <span className="text-right">Multiplier</span>
            <span className="text-right">Payout</span>
          </div>
          {highRollers.length === 0 ? (
            <p className="text-center text-xs text-ink-mut py-8">Waiting for high roller wins...</p>
          ) : (
            <AnimatePresence initial={false}>
              {highRollers.map((w, idx) => (
                <motion.div
                  key={w.id}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className={`grid grid-cols-2 items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-glass/[0.04] sm:grid-cols-4 ${
                    idx === 0 ? "bg-gold/[0.05]" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold text-gold">
                    <Avatar name={w.user} size="sm" />
                    <span className="truncate">{w.user}</span>
                  </span>
                  <span className="truncate text-ink-mut">{w.game}</span>
                  <span className="text-right font-stat font-semibold text-gold">{w.multiplier}</span>
                  <span className="text-right font-stat font-bold text-success">{w.amount}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      )}

      {activeTab === "race" && (
        <div className="space-y-3 py-2">
          {DAILY_LEADERBOARD.map((item, idx) => {
            const maxPoints = DAILY_LEADERBOARD[0].points;
            const pct = (item.points / maxPoints) * 100;
            return (
              <div key={item.rank} className="flex items-center justify-between gap-4 text-sm px-1">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className={`w-5 font-stat font-extrabold text-center ${
                      idx === 0
                        ? "text-gold"
                        : idx === 1
                          ? "text-silver"
                          : idx === 2
                            ? "text-bronze"
                            : "text-ink-mut"
                    }`}
                  >
                    #{item.rank}
                  </span>
                  <Avatar name={item.user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold truncate">{item.user}</span>
                      <span className="font-stat text-ink-soft">{item.points} pts</span>
                    </div>
                    {/* Live Progress bar */}
                    <div className="h-1.5 w-full bg-glass/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, hsl(${item.hue} 90% 60%), hsl(${item.hue + 40} 90% 60%))`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-stat font-bold text-success text-xs sm:text-sm">{item.win}</span>
                  <p className="text-[9px] text-ink-mut uppercase">Total Payout</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------- jackpot ---------- */
function Jackpot() {
  const v = useCountUp(1284910, 1600);
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-3xl" />
      <p className="text-xs font-bold uppercase tracking-wider text-gold">Mega Jackpot</p>
      <p className="mt-2 font-stat text-4xl font-extrabold tracking-tight text-gradient">
        ${Math.round(v).toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-ink-mut">Drops within 4 hours</p>
      <div className="mt-5 space-y-2">
        {["Grand · $1.2M", "Major · $48k", "Minor · $2.4k"].map((j) => (
          <div
            key={j}
            className="flex items-center justify-between rounded-md bg-glass/[0.04] px-3 py-2 text-sm"
          >
            <span className="font-semibold">{j.split(" · ")[0]}</span>
            <span className="font-stat font-bold text-gold">{j.split(" · ")[1]}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- compact square original tile ---------- */
function GameCardCompact({ game }: { game: Game }) {
  return (
    <Link
      to={`/game/${game.id}`}
      className="group block overflow-hidden rounded-lg glass-hi shadow-e2 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow-lg"
    >
      <GameImage game={game} className="aspect-square" />
      <p className="truncate px-2.5 py-2 text-center font-display text-xs font-bold">{game.name}</p>
    </Link>
  );
}
