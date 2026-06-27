import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { Play, Users, ChevronLeft, ChevronRight, Info, Flame } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/lib/toast";
import { useCatalog } from "@/lib/catalog";

const TAGLINE: Record<string, string> = {
  Slots: "Spin the reels for big multipliers.",
  Originals: "Provably-fair originals, instant rounds.",
  Live: "Real-time tables, live action.",
  Crash: "Ride the multiplier and cash out in time.",
  Table: "Classic table games, your call.",
};

export function FeaturedHero() {
  const { push } = useToast();
  const { games } = useCatalog();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);

  // feature the first few real catalog games
  const slides = games.slice(0, 5);

  const [hovering, setHovering] = useState(false);

  // auto-advance (paused on hover)
  useEffect(() => {
    if (hovering || slides.length <= 1) return;
    const t = setInterval(() => setI((p) => (p + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [hovering, slides.length]);

  // parallax
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 120, damping: 18 });
  const sy = useSpring(my, { stiffness: 120, damping: 18 });
  const artX = useTransform(sx, [-0.5, 0.5], [22, -22]);
  const artY = useTransform(sy, [-0.5, 0.5], [22, -22]);
  const contentX = useTransform(sx, [-0.5, 0.5], [-10, 10]);

  const onMove = (e: React.MouseEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
    setHovering(false);
  };

  const go = (n: number) => setI((p) => (p + n + slides.length) % slides.length);

  if (slides.length === 0) return null;
  const f = slides[Math.min(i, slides.length - 1)];
  const tagline = TAGLINE[f.category] ?? "Play certified-fair games on Aurora.";

  return (
    <section
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={onLeave}
      className="relative h-[440px] overflow-hidden rounded-2xl shadow-e3 sm:h-[460px]"
    >
      {/* parallax art with crossfade */}
      <AnimatePresence>
        <motion.img
          key={f.id}
          src={f.img ?? `/games/${f.id}.png`}
          alt=""
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          style={{ x: artX, y: artY }}
          className="absolute inset-0 h-full w-full scale-[1.15] object-cover"
        />
      </AnimatePresence>

      {/* scrims for legibility */}
      <div className="absolute inset-0 bg-gradient-to-r from-base via-base/85 to-base/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-base via-base/30 to-transparent" />
      <div
        className="absolute -left-24 bottom-0 h-96 w-96 rounded-full blur-[120px] transition-all duration-700"
        style={{ background: `radial-gradient(circle, hsl(${f.hue} 90% 60% / 0.4), transparent 70%)` }}
      />

      {/* content */}
      <motion.div
        style={{ x: reduce ? 0 : contentX }}
        className="relative z-raised flex h-full max-w-2xl flex-col justify-end gap-4 p-6 sm:p-10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="danger" dot>
            Featured
          </Badge>
          <span className="flex items-center gap-1 rounded-full bg-base/50 px-2.5 py-1 text-[11px] font-semibold text-ink-soft backdrop-blur">
            <Flame className="h-3 w-3 text-accent" /> {f.category}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-soft">
            <Users className="h-3 w-3" /> {f.players.toLocaleString()} playing
          </span>
        </div>

        <AnimatePresence mode="wait">
          <motion.h1
            key={f.id}
            initial={{ opacity: 0, y: reduce ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -18 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl"
          >
            {f.name}
          </motion.h1>
        </AnimatePresence>

        <p className="max-w-md text-base text-ink-soft sm:text-lg">{tagline}</p>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link to={`/game/${f.id}`}>
            <Button size="lg" iconLeft={<Play className="h-5 w-5 fill-current" />}>
              Play now
            </Button>
          </Link>
          <Button
            size="lg"
            variant="secondary"
            iconLeft={<Info className="h-5 w-5" />}
            onClick={() => push(`${f.name} · ${f.provider}`, "info")}
          >
            Details
          </Button>
        </div>
      </motion.div>

      {/* controls */}
      {slides.length > 1 && (
        <div className="absolute top-6 right-6 z-raised flex items-center gap-2 sm:top-auto sm:bottom-6 sm:right-6">
          <div className="flex gap-1.5">
            {slides.map((_, n) => (
              <button
                key={n}
                aria-label={`Featured ${n + 1}`}
                onClick={() => setI(n)}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-7 bg-accent" : "w-1.5 bg-glass/40"}`}
              />
            ))}
          </div>
          <button
            aria-label="Previous"
            onClick={() => go(-1)}
            className="grid h-9 w-9 place-items-center rounded-full glass text-ink-soft hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Next"
            onClick={() => go(1)}
            className="grid h-9 w-9 place-items-center rounded-full glass text-ink-soft hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
