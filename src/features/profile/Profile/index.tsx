import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Edit3, Share2, Settings, Heart } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { GameRail } from "@/components/common/GameRail";
import { useToast } from "@/lib/toast";
import { useFavorites } from "@/lib/favorites";
import { useCatalog } from "@/lib/catalog";
import { useAuth } from "@/lib/auth";
import { useWallet, fmt } from "@/lib/wallet";
import { api } from "@/lib/api";

const XP_PER_LEVEL = 10000;

interface Stats {
  totalBets: number;
  wagered: string;
  won: string;
  bestMultiplier: string;
}
interface BetRow {
  id: string;
  game: string;
  amount: string;
  payout: string;
  status: string;
  createdAt: string;
}

const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function Profile() {
  const { push } = useToast();
  const { ids } = useFavorites();
  const { games: ALL } = useCatalog();
  const { user } = useAuth();
  const { balance } = useWallet();
  const nav = useNavigate();

  const [stats, setStats] = useState<Stats>({ totalBets: 0, wagered: "0.00", won: "0.00", bestMultiplier: "0.00" });
  const [activity, setActivity] = useState<BetRow[]>([]);

  useEffect(() => {
    api.get<Stats>("/users/me/stats").then(setStats).catch(() => {});
    api.get<BetRow[]>("/games/bets?limit=6").then(setActivity).catch(() => {});
  }, []);

  const favGames = ALL.filter((g) => ids.includes(g.id));
  const xp = user?.xp ?? 0;
  const level = user?.level ?? 1;

  const share = async () => {
    const url = window.location.origin + "/profile";
    try {
      if (navigator.share) await navigator.share({ title: "Aurora profile", url });
      else {
        await navigator.clipboard.writeText(url);
        push("Profile link copied to clipboard");
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="space-y-6">
      {/* banner */}
      <Card padded className="relative overflow-hidden">
        <div
          className="absolute inset-x-0 -top-10 h-40 opacity-40"
          style={{ background: "radial-gradient(60% 100% at 50% 0%, rgb(var(--c-accent)/0.5), transparent 70%)" }}
        />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={user?.username ?? "Player"} size="xl" ring online />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-extrabold tracking-tight">{user?.username ?? "Player"}</h1>
                <Badge tone="gold">{user?.role === "USER" ? "Member" : user?.role}</Badge>
              </div>
              <p className="text-sm text-ink-mut">
                {user?.email} · Joined {user ? new Date(user.joined).toLocaleDateString() : "—"}
              </p>
              <div className="mt-2 w-56">
                <div className="mb-1 flex justify-between text-[11px] text-ink-mut">
                  <span>Level {level}</span>
                  <span className="font-stat">{xp}/{XP_PER_LEVEL} XP</span>
                </div>
                <ProgressBar value={(xp / XP_PER_LEVEL) * 100} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" iconLeft={<Share2 className="h-4 w-4" />} onClick={share}>
              Share
            </Button>
            <Button variant="ghost" size="sm" iconLeft={<Edit3 className="h-4 w-4" />} onClick={() => push("Edit profile coming soon", "info")}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" iconLeft={<Settings className="h-4 w-4" />} aria-label="Settings" onClick={() => nav("/settings")}>
              <span className="sr-only">Settings</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* stats — real */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Balance", fmt(balance)],
          ["Total wagered", `$${stats.wagered}`],
          ["Total bets", String(stats.totalBets)],
          ["Best multiplier", `${stats.bestMultiplier}×`],
        ].map(([l, v]) => (
          <Card key={l} className="text-center">
            <p className="font-stat text-2xl font-extrabold text-gradient">{v}</p>
            <p className="mt-1 text-xs text-ink-mut">{l}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4">
        {/* recent activity — real bet history */}
        <Card padded>
          <h2 className="mb-4 font-display text-lg font-bold">Recent activity</h2>
          <div className="space-y-2">
            {activity.length === 0 && <p className="py-6 text-center text-xs text-ink-mut">No bets yet.</p>}
            {activity.map((b) => {
              const won = b.status === "WON";
              return (
                <div key={b.id} className="flex items-center justify-between rounded-md bg-glass/[0.04] p-3">
                  <div>
                    <p className="text-sm font-semibold">{b.game}</p>
                    <p className="text-xs text-ink-mut">{ago(b.createdAt)}</p>
                  </div>
                  <span className={`font-stat text-sm font-bold ${won ? "text-success" : "text-danger"}`}>
                    {won ? `+$${b.payout}` : `-$${b.amount}`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* favorites */}
      <section>
        <h2 className="mb-3 font-display text-xl font-bold tracking-tight">Favorite games</h2>
        {favGames.length > 0 ? (
          <GameRail games={favGames} />
        ) : (
          <Card className="flex flex-col items-center py-10 text-center">
            <Heart className="h-8 w-8 text-ink-mut" />
            <p className="mt-3 font-semibold">No favorites yet</p>
            <p className="mt-1 text-sm text-ink-mut">Tap the heart on any game to save it.</p>
            <Link to="/casino" className="mt-4">
              <Button size="sm">Browse games</Button>
            </Link>
          </Card>
        )}
      </section>
    </div>
  );
}
