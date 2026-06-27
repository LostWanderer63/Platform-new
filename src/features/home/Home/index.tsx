import { Link } from "react-router-dom";
import { Flame, Sparkles, Dice5, Radio, Trophy, Gift, Zap, TrendingUp, Heart } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/common/SectionTitle";
import { Reveal } from "@/components/common/Reveal";
import { GameRail } from "@/components/common/GameRail";
import { GameRailSkeleton } from "@/components/common/GameRailSkeleton";
import { useFavorites } from "@/lib/favorites";
import { useDelayedReady } from "@/lib/useDelayedReady";
import { useCatalog } from "@/lib/catalog";
import { FeaturedHero } from "@/features/home/FeaturedHero";
import { WinsTicker } from "@/features/home/WinsTicker";
import { LiveStats } from "@/features/home/LiveStats";
import { GameOfTheWeek } from "@/features/home/GameOfTheWeek";
import { TabbedActivity } from "@/features/home/TabbedActivity";
import { GameCardCompact } from "@/features/home/GameCardCompact";

const CATS = [
  { icon: Flame, label: "Trending", to: "/casino" },
  { icon: Sparkles, label: "Originals", to: "/casino" },
  { icon: Dice5, label: "Slots", to: "/casino" },
  { icon: Radio, label: "Live", to: "/casino" },
  { icon: Trophy, label: "Sports", to: "/sports" },
  { icon: Gift, label: "Promos", to: "/home" },
];

export function Home() {
  const { ids } = useFavorites();
  const { games: ALL, byCategory, loading } = useCatalog();
  const ORIGINALS = byCategory("Originals");
  const LIVE = byCategory("Live");
  const favGames = ALL.filter((g) => ids.includes(g.id));
  const ready = useDelayedReady(700) && !loading;

  return (
    <div className="space-y-8">
      <FeaturedHero />
      <WinsTicker />
      <LiveStats />

      {/* spotlight + daily spin */}
      <GameOfTheWeek />

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

      {favGames.length > 0 && (
        <section>
          <SectionTitle icon={<Heart className="h-5 w-5" />} title="Your favorites" />
          <GameRail games={favGames} />
        </section>
      )}

      <Card hover>
        <div className="flex items-center gap-2 text-sm font-bold text-accent">
          <Zap className="h-4 w-4" /> Continue playing
        </div>
        <div className="mt-4">
          {ready ? <GameRail games={ALL.slice(0, 8)} /> : <GameRailSkeleton count={8} />}
        </div>
      </Card>

      <section>
        <SectionTitle icon={<Flame className="h-5 w-5" />} title="Trending now" />
        {ready ? <GameRail games={ALL.slice(0, 10)} /> : <GameRailSkeleton />}
      </section>

      <section>
        <SectionTitle icon={<TrendingUp className="h-5 w-5" />} title="Recommended for you" />
        {ready ? <GameRail games={ALL.slice(8, 20)} /> : <GameRailSkeleton />}
      </section>

      {ORIGINALS.length > 0 && (
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
      )}

      <TabbedActivity />

      {LIVE.length > 0 && (
        <Reveal>
          <section>
            <SectionTitle icon={<Radio className="h-5 w-5" />} title="Live casino" />
            {ready ? <GameRail games={LIVE} /> : <GameRailSkeleton />}
          </section>
        </Reveal>
      )}
    </div>
  );
}
