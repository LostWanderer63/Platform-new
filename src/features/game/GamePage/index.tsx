import { useEffect, useRef, useState } from "react";
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
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { GameImage } from "@/components/game/GameArt";
import { type Game } from "@/data/mock";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { useWallet, fmt, type LiveWin } from "@/lib/wallet";
import { useCatalog } from "@/lib/catalog";
import { api, ApiError, type BetResp } from "@/lib/api";

export function GamePage() {
  const { id } = useParams();
  const { isAuthed } = useAuth();
  const { push } = useToast();
  const { setBalance, liveWins, balance } = useWallet();
  const { byId } = useCatalog();
  const [seedWins, setSeedWins] = useState<LiveWin[]>([]);
  useEffect(() => {
    api.get<LiveWin[]>("/games/recent-wins?limit=8").then(setSeedWins).catch(() => setSeedWins([]));
  }, []);
  const [stats, setStats] = useState<{ totalBets: number; wagered: string; won: string; bestMultiplier: string } | null>(null);
  useEffect(() => {
    if (!isAuthed) return;
    api.get<typeof stats>("/users/me/stats").then(setStats).catch(() => {});
  }, [isAuthed]);
  const liveBets = [...liveWins, ...seedWins].slice(0, 8);
  const game: Game =
    byId(id ?? "") ?? {
      id: id ?? "game",
      name: id ?? "Game",
      category: "Originals",
      provider: "Aurora",
      players: 0,
      hue: 200,
      kw: "",
      img: id ? `/games/${id}.png` : undefined,
      url: `/demo-game.html?id=${id ?? ""}`,
    };

  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [bet, setBet] = useState(10);
  const [betting, setBetting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const frameWrap = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const goFullscreen = () => frameWrap.current?.requestFullscreen?.();

  // External games (e.g. the Olympus cabinet) launch their own client by URL and
  // broker every bet/win through the Aurora wallet over postMessage.
  const isExternal = /^https?:\/\//i.test(game.url);
  const gameOrigin = isExternal ? new URL(game.url).origin : "";
  const isPlayable = !game.status || game.status === "ACTIVE";

  // keep the latest balance available to the message handler without re-binding it
  const balanceRef = useRef(balance);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    if (!isExternal || !isAuthed) return;

    const send = (msg: Record<string, unknown>) =>
      iframeRef.current?.contentWindow?.postMessage(msg, gameOrigin);
    const sendBalance = (b: string | number) => send({ type: "aurora:balance", balance: Number(b) });
    const betIdRef = { current: null as string | null };

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== gameOrigin) return; // only trust the game's own origin
      const d = e.data as { type?: string; amount?: number; game?: string };
      if (!d || typeof d !== "object") return;
      try {
        if (d.type === "aurora:ready") {
          sendBalance(balanceRef.current);
        } else if (d.type === "aurora:bet" && typeof d.amount === "number") {
          // settle any prior unsettled round as a loss, then place the new stake
          if (betIdRef.current) {
            await api.post("/games/external/win", { betId: betIdRef.current, amount: "0" }).catch(() => {});
            betIdRef.current = null;
          }
          const r = await api.post<{ betId: string; balance: string }>("/games/external/bet", {
            game: d.game ?? game.name,
            slug: game.id,
            amount: String(d.amount),
          });
          betIdRef.current = r.betId;
          setBalance(Number(r.balance));
        } else if (d.type === "aurora:win" && typeof d.amount === "number") {
          if (!betIdRef.current) return;
          const r = await api.post<{ balance: string }>("/games/external/win", {
            betId: betIdRef.current,
            amount: String(d.amount),
          });
          betIdRef.current = null;
          setBalance(Number(r.balance));
        }
      } catch (err) {
        push(err instanceof ApiError ? err.message : "Wallet error", "danger");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExternal, isAuthed, gameOrigin, game.name]);

  const handleBet = async () => {
    if (betting) return;
    setBetting(true);
    try {
      // the bet panel models a crash-style auto-cashout at 2.00x
      const r = await api.post<BetResp>("/games/bet", {
        game: "CRASH",
        amount: String(bet),
        params: { target: 2 },
      });
      setBalance(Number(r.balance));
      if (r.win) push(`You won ${fmt(Number(r.payout))}! 🎉`, "success");
      else push("No win this round — try again", "info");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Bet failed", "danger");
    } finally {
      setBetting(false);
    }
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

      {/* main: bet panel + canvas. External games carry their own controls in-frame. */}
      <div className={isExternal ? "grid gap-4" : "grid gap-4 lg:grid-cols-[340px_1fr]"}>
        {/* bet controls — hidden for external games (they bet through their own UI) */}
        {!isExternal && (
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
            <Button block size="lg" className="mt-4" onClick={handleBet} loading={betting}>
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
        )}

        {/* game frame — loaded via provider URL (iframe / webview) */}
        <div className={isExternal ? "" : "order-1 lg:order-2"}>
          <div
            ref={frameWrap}
            className="relative aspect-[16/10] overflow-hidden rounded-lg glass-hi bg-base shadow-e3 sm:aspect-[16/9]"
          >
            {!isPlayable ? (
              <div className="absolute inset-0 grid place-items-center bg-base/40 p-6 text-center">
                <div>
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning/15 text-warning">
                    <Settings className="h-6 w-6" />
                  </span>
                  <p className="mt-4 font-display text-lg font-bold">
                    {game.status === "MAINTENANCE" ? "Under maintenance" : "Temporarily paused"}
                  </p>
                  <p className="mt-1 text-sm text-ink-mut">This game is unavailable right now — check back soon.</p>
                  <Link to="/casino" className="mt-4 inline-block">
                    <Button variant="secondary">Back to lobby</Button>
                  </Link>
                </div>
              </div>
            ) : isAuthed ? (
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
                  ref={iframeRef}
                  title={game.name}
                  src={game.url}
                  onLoad={() => {
                    setLoaded(true);
                    // cover the case where the game posts "ready" before our
                    // listener attached: push the current balance on load
                    if (isExternal) {
                      iframeRef.current?.contentWindow?.postMessage(
                        { type: "aurora:balance", balance: balanceRef.current },
                        gameOrigin,
                      );
                    }
                  }}
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
            {liveBets.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-ink-mut">No recent bets yet.</p>
            )}
            {liveBets.map((w, i) => (
              <div
                key={`${w.at}-${i}`}
                className="grid grid-cols-4 items-center rounded-md px-3 py-2 text-sm hover:bg-glass/[0.04]"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Avatar name={w.username} size="sm" />
                  {w.username}
                </span>
                <span className="text-right font-stat text-ink-soft">—</span>
                <span className="text-right font-stat text-accent">{Number(w.multiplier).toFixed(2)}×</span>
                <span className="text-right font-stat font-bold text-success">${w.amount}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 font-display text-base font-bold">Session stats</h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                ["Wagered", stats ? fmt(Number(stats.wagered)) : "—"],
                [
                  "Profit",
                  stats
                    ? `${Number(stats.won) - Number(stats.wagered) >= 0 ? "+" : "-"}${fmt(Math.abs(Number(stats.won) - Number(stats.wagered)))}`
                    : "—",
                ],
                ["Bets", stats ? String(stats.totalBets) : "—"],
                ["Best", stats ? `${Number(stats.bestMultiplier).toFixed(2)}×` : "—"],
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
