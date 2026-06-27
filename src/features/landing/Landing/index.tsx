import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Zap, Trophy, Gift, ChevronRight, Star } from "lucide-react";
import { Ambient } from "@/components/layout/Ambient";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { GameCard } from "@/components/game/GameCard";
import { useCatalog } from "@/lib/catalog";
import { api } from "@/lib/api";

interface Win {
  username: string;
  amount: string;
}
interface Stats {
  players: number;
  online: number;
  wagered24h: number;
  biggestWin24h: number;
}

export function Landing() {
  const { games } = useCatalog();
  const featured = games.slice(0, 6);
  const [wins, setWins] = useState<Win[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Win[]>("/games/recent-wins?limit=3").then(setWins).catch(() => setWins([]));
    api.get<Stats>("/stats").then(setStats).catch(() => {});
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Ambient />

      {/* nav */}
      <header className="relative z-nav mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-accent to-accent-2 shadow-glow">
            <span className="font-display text-lg font-extrabold text-base">A</span>
          </div>
          <span className="font-display text-lg font-extrabold tracking-tight">AURORA</span>
        </div>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-ink-soft md:flex">
          <Link to="/casino" className="hover:text-ink">
            Casino
          </Link>
          <Link to="/sports" className="hover:text-ink">
            Sports
          </Link>
          <Link to="/home" className="hover:text-ink">
            Promotions
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link to="/register">
            <Button size="sm">Sign up</Button>
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative z-raised mx-auto max-w-7xl px-5 pt-10 sm:px-8 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-fade-up">
            <Badge tone="accent" dot>
              New season live
            </Badge>
            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Play at the
              <br />
              <span className="text-gradient">speed of light.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
              The next-generation casino & sportsbook. Certified-fair originals, instant payouts, and rewards
              built into every spin.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register">
                <Button size="lg" iconRight={<ChevronRight className="h-5 w-5" />}>
                  Claim welcome bonus
                </Button>
              </Link>
              <Link to="/home">
                <Button size="lg" variant="secondary">
                  Explore lobby
                </Button>
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
              {[
                { icon: Shield, t: "Certified fair" },
                { icon: Zap, t: "Instant payouts" },
                { icon: Trophy, t: "Daily tournaments" },
                { icon: Gift, t: "Welcome bonus" },
              ].map((f) => (
                <div key={f.t} className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                  <f.icon className="h-4 w-4 text-accent" /> {f.t}
                </div>
              ))}
            </div>
          </div>

          {/* hero visual — floating live winners + cards */}
          <div className="relative animate-fade-up [animation-delay:120ms]">
            <div className="grid grid-cols-2 gap-4">
              <div className="animate-float space-y-4">
                {featured[0] && <GameCard game={featured[0]} />}
                {featured[2] && <GameCard game={featured[2]} />}
              </div>
              <div className="animate-float space-y-4 pt-10 [animation-delay:-3s]">
                {featured[3] && <GameCard game={featured[3]} />}
                <div className="rounded-lg glass-hi p-4 shadow-e3">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-mut">Live wins</p>
                  <div className="space-y-2.5">
                    {(wins.length ? wins : [{ username: "—", amount: "0.00" }]).map((w, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{w.username}</span>
                        <span className="font-stat font-bold text-success">${w.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* trust strip */}
        <div className="mt-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-2xl glass px-6 py-6 text-center">
          {[
            [stats ? stats.players.toLocaleString() : "—", "players", Trophy],
            [stats ? stats.online.toLocaleString() : "—", "online now", Zap],
            [stats ? `$${Math.round(stats.wagered24h).toLocaleString()}` : "—", "wagered 24h", Star],
            [stats ? `$${Math.round(stats.biggestWin24h).toLocaleString()}` : "—", "biggest win", Shield],
          ].map(([v, l]) => (
            <div key={l as string}>
              <p className="font-stat text-2xl font-bold text-gradient">{v as string}</p>
              <p className="text-xs text-ink-mut">{l as string}</p>
            </div>
          ))}
        </div>

        {/* featured games */}
        <div className="mt-20">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-3xl font-bold tracking-tight">Featured originals</h2>
            <Link to="/casino" className="text-sm font-semibold text-accent">
              Browse all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {featured.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="my-24 overflow-hidden rounded-2xl glass-hi p-10 text-center shadow-e3 sm:p-16">
          <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            Your next <span className="text-gradient">big win</span> is waiting.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-ink-soft">
            Sign up in 30 seconds. Deposit with card, bank, or e-wallet — instant payouts.
          </p>
          <Link to="/register" className="mt-8 inline-block">
            <Button size="lg">Create free account</Button>
          </Link>
        </div>
      </section>

      <footer className="relative z-raised border-t border-line/10 py-10 text-center text-xs text-ink-mut">
        Aurora is a fictional design concept. 18+ · Play responsibly · BeGambleAware
      </footer>
    </div>
  );
}
