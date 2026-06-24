import { useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ChevronLeft,
  Maximize2,
  Volume2,
  Settings,
  ShieldCheck,
  Users,
  History,
  Lock,
  Compass,
  Loader2,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { GameImage } from "../components/game/GameArt";
import { ORIGINALS, SLOTS, LIVE, WINNERS } from "../data/mock";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { useWallet, fmt } from "../lib/wallet";

const ALL = [...ORIGINALS, ...SLOTS, ...LIVE];

export function GamePage() {
  const { id } = useParams();
  const { isAuthed } = useAuth();
  const { push } = useToast();
  const { placeBet, addWin } = useWallet();
  const game = ALL.find((g) => g.id === id) ?? ORIGINALS[0];

  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [loaded, setLoaded] = useState(false);
  const frameWrap = useRef<HTMLDivElement>(null);

  const goFullscreen = () => frameWrap.current?.requestFullscreen?.();

  const handleBet = () => {
    if (!placeBet(bet)) return push("Insufficient balance — deposit to keep playing", "danger");
    push(`Bet placed — ${fmt(bet)} on ${game.name}`);
    setTimeout(() => {
      if (Math.random() < 0.48) {
        const payout = bet * 2;
        addWin(payout);
        push(`You won ${fmt(payout)}! 🎉`, "success");
      } else {
        push("No win this round — try again", "info");
      }
    }, 1300);
  };

  return (
    <div className="space-y-4">
      {/* breadcrumb / title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/casino"
            className="grid h-9 w-9 place-items-center rounded-md glass text-ink-soft hover:text-ink"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">{game.name}</h1>
            <p className="text-xs text-ink-mut">
              {game.provider} · {game.players} playing
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="success" dot>
            Certified fair
          </Badge>
        </div>
      </div>

      {/* main: bet panel + canvas */}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* bet controls */}
        <Card padded className="order-2 h-fit lg:order-1">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-glass/[0.04] p-1">
            {(["manual", "auto"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-[7px] py-2 text-sm font-bold capitalize transition-colors ${
                  mode === m ? "bg-accent/15 text-ink shadow-glow" : "text-ink-mut"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <label className="mb-1.5 block text-xs font-semibold text-ink-soft">Bet amount</label>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center rounded-md border border-line/15 bg-glass/[0.04] px-3">
              <span className="text-sm font-bold text-gold">$</span>
              <input
                value={bet}
                onChange={(e) => setBet(Math.max(0, Number(e.target.value) || 0))}
                className="h-11 w-full bg-transparent px-2 font-stat text-sm text-ink focus:outline-none"
              />
            </div>
            <button
              onClick={() => setBet((b) => Math.max(1, b / 2))}
              className="h-11 rounded-md glass-hi px-3 text-xs font-bold"
            >
              ½
            </button>
            <button
              onClick={() => setBet((b) => b * 2)}
              className="h-11 rounded-md glass-hi px-3 text-xs font-bold"
            >
              2×
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-soft">Cashout at</label>
              <div className="flex h-11 items-center rounded-md border border-line/15 bg-glass/[0.04] px-3 font-stat text-sm">
                2.00×
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-soft">Profit on win</label>
              <div className="flex h-11 items-center rounded-md border border-line/15 bg-glass/[0.04] px-3 font-stat text-sm text-success">
                +${(bet * 1).toFixed(2)}
              </div>
            </div>
          </div>

          {isAuthed ? (
            <Button block size="lg" className="mt-4" onClick={handleBet}>
              Bet ${bet.toFixed(2)}
            </Button>
          ) : (
            <div className="mt-4 rounded-md border border-accent/30 bg-accent/[0.06] p-3 text-center">
              <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-ink-soft">
                <Compass className="h-3.5 w-3.5 text-accent" /> Explore mode — preview only
              </p>
              <Link to="/login" className="mt-2 block">
                <Button block size="lg" iconLeft={<Lock className="h-4 w-4" />}>
                  Sign in to play
                </Button>
              </Link>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-ink-mut">
            <button
              onClick={() => push("Certified fair — outcomes from an independently audited RNG", "info")}
              className="flex items-center gap-1.5 hover:text-ink"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Fairness
            </button>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {game.players} online
            </span>
          </div>

          {/* quick chips */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[1, 5, 25, 100].map((v) => (
              <button
                key={v}
                onClick={() => setBet(v)}
                className="rounded-md bg-glass/[0.04] py-2 text-xs font-bold text-ink-soft hover:bg-glass/10 hover:text-ink"
              >
                ${v}
              </button>
            ))}
          </div>
        </Card>

        {/* game frame — loaded via provider URL (iframe / webview) */}
        <div className="order-1 lg:order-2">
          <div
            ref={frameWrap}
            className="relative aspect-[16/10] overflow-hidden rounded-lg glass-hi bg-base shadow-e3 sm:aspect-[16/9]"
          >
            {isAuthed ? (
              <>
                {!loaded && (
                  <div className="absolute inset-0 z-raised grid place-items-center">
                    <div className="flex flex-col items-center gap-3 text-sm text-ink-mut">
                      <Loader2 className="h-6 w-6 animate-spin text-accent" />
                      Loading {game.name}…
                    </div>
                  </div>
                )}
                <iframe
                  title={game.name}
                  src={game.url}
                  onLoad={() => setLoaded(true)}
                  allow="autoplay; fullscreen; clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  className="absolute inset-0 h-full w-full border-0"
                />
                {/* frame toolbar */}
                <div className="absolute right-3 top-3 z-raised flex gap-1.5">
                  <button
                    aria-label="Sound"
                    onClick={() => push("Sound muted", "info")}
                    className="grid h-9 w-9 place-items-center rounded-md bg-base/60 text-ink-soft backdrop-blur hover:text-ink"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Settings"
                    onClick={() => push("Game settings", "info")}
                    className="grid h-9 w-9 place-items-center rounded-md bg-base/60 text-ink-soft backdrop-blur hover:text-ink"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Fullscreen"
                    onClick={goFullscreen}
                    className="grid h-9 w-9 place-items-center rounded-md bg-base/60 text-ink-soft backdrop-blur hover:text-ink"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              /* guest: locked preview (explore only) */
              <>
                <GameImage game={game} className="absolute inset-0 h-full w-full opacity-40 blur-[2px]" />
                <div className="absolute inset-0 grid place-items-center bg-base/40 p-6 text-center">
                  <div>
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-accent">
                      <Lock className="h-6 w-6" />
                    </span>
                    <p className="mt-4 font-display text-lg font-bold">Sign in to play {game.name}</p>
                    <p className="mt-1 text-sm text-ink-mut">Explore mode — preview only.</p>
                    <Link to="/login" state={{ from: `/game/${game.id}` }} className="mt-4 inline-block">
                      <Button iconLeft={<Compass className="h-4 w-4" />}>Log in to play</Button>
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* lower panels: live bets + stats + fairness */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <History className="h-4 w-4 text-accent" /> Live bets
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-4 px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-ink-mut">
              <span>Player</span>
              <span className="text-right">Bet</span>
              <span className="text-right">Mult</span>
              <span className="text-right">Payout</span>
            </div>
            {WINNERS.map((w) => (
              <div
                key={w.user}
                className="grid grid-cols-4 items-center rounded-md px-3 py-2 text-sm hover:bg-glass/[0.04]"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Avatar name={w.user} size="sm" />
                  {w.user}
                </span>
                <span className="text-right font-stat text-ink-soft">$50</span>
                <span className="text-right font-stat text-accent">{w.multiplier}</span>
                <span className="text-right font-stat font-bold text-success">{w.amount}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 font-display text-base font-bold">Session stats</h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                ["Wagered", "$1,240"],
                ["Profit", "+$312"],
                ["Wins", "18"],
                ["Best", "12.4×"],
              ].map(([l, v]) => (
                <div key={l} className="rounded-md bg-glass/[0.04] p-3">
                  <p className="font-stat text-lg font-bold text-ink">{v}</p>
                  <p className="text-xs text-ink-mut">{l}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 font-display text-base font-bold">
              <ShieldCheck className="h-4 w-4 text-success" /> Certified fair
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-mut">
              Every outcome is generated by an independently audited RNG, tested and certified by iTech Labs.
            </p>
            <Button
              variant="ghost"
              size="sm"
              block
              className="mt-3"
              onClick={() => push("RNG certificate verified ✓", "success")}
            >
              View certificate
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
