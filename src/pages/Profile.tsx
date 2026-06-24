import { Link, useNavigate } from "react-router-dom";
import { Edit3, Trophy, Flame, Target, Award, Share2, Settings, Heart } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Avatar } from "../components/ui/Avatar";
import { ProgressBar } from "../components/ui/ProgressBar";
import { GameRail } from "../components/common/GameRail";
import { ORIGINALS, SLOTS, LIVE, PLAYER } from "../data/mock";
import { useToast } from "../lib/toast";
import { useFavorites } from "../lib/favorites";

const ALL = [...ORIGINALS, ...SLOTS, ...LIVE];

const ACHIEVEMENTS = [
  { icon: Flame, t: "Hot Streak", d: "10 wins in a row", got: true },
  { icon: Target, t: "Sharpshooter", d: "100x multiplier hit", got: true },
  { icon: Trophy, t: "Champion", d: "Win a tournament", got: true },
  { icon: Award, t: "High Roller", d: "$10k single bet", got: false },
];

const ACTIVITY = [
  { g: "Crash", r: "Won", a: "+$412", t: "2m ago", win: true },
  { g: "Mines", r: "Lost", a: "-$50", t: "8m ago", win: false },
  { g: "Plinko", r: "Won", a: "+$2,640", t: "1h ago", win: true },
  { g: "Dice", r: "Won", a: "+$118", t: "3h ago", win: true },
];

export function Profile() {
  const { push } = useToast();
  const { ids } = useFavorites();
  const nav = useNavigate();
  const favGames = ALL.filter((g) => ids.includes(g.id));
  const share = async () => {
    const url = window.location.origin + "/profile";
    try {
      if (navigator.share) await navigator.share({ title: "Aurora profile", url });
      else {
        await navigator.clipboard.writeText(url);
        push("Profile link copied to clipboard");
      }
    } catch {
      /* user cancelled share */
    }
  };
  return (
    <div className="space-y-6">
      {/* banner */}
      <Card padded className="relative overflow-hidden">
        <div
          className="absolute inset-x-0 -top-10 h-40 opacity-40"
          style={{
            background: "radial-gradient(60% 100% at 50% 0%, rgb(var(--c-accent)/0.5), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={PLAYER.name} size="xl" ring online />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-extrabold tracking-tight">{PLAYER.name}</h1>
                <Badge tone="gold">{PLAYER.rank}</Badge>
              </div>
              <p className="text-sm text-ink-mut">
                {PLAYER.handle} · Joined {PLAYER.joined}
              </p>
              <div className="mt-2 w-56">
                <div className="mb-1 flex justify-between text-[11px] text-ink-mut">
                  <span>Level {PLAYER.level}</span>
                  <span className="font-stat">
                    {PLAYER.xp}/{PLAYER.xpMax} XP
                  </span>
                </div>
                <ProgressBar value={(PLAYER.xp / PLAYER.xpMax) * 100} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" iconLeft={<Share2 className="h-4 w-4" />} onClick={share}>
              Share
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Edit3 className="h-4 w-4" />}
              onClick={() => push("Edit profile coming soon", "info")}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Settings className="h-4 w-4" />}
              aria-label="Settings"
              onClick={() => nav("/settings")}
            >
              <span className="sr-only">Settings</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total wagered", PLAYER.wagered],
          ["Total wins", String(PLAYER.wins)],
          ["Best multiplier", PLAYER.bestMulti],
          ["Win rate", "52.4%"],
        ].map(([l, v]) => (
          <Card key={l} className="text-center">
            <p className="font-stat text-2xl font-extrabold text-gradient">{v}</p>
            <p className="mt-1 text-xs text-ink-mut">{l}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* achievements */}
        <Card className="lg:col-span-2" padded>
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
            <Award className="h-5 w-5 text-accent" /> Achievements
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ACHIEVEMENTS.map((a) => (
              <div
                key={a.t}
                className={`rounded-lg p-4 text-center ${a.got ? "glass-hi" : "bg-glass/[0.02] opacity-50"}`}
              >
                <span
                  className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${a.got ? "bg-gradient-to-br from-gold to-bronze text-base shadow-glow" : "bg-glass/10 text-ink-mut"}`}
                >
                  <a.icon className="h-6 w-6" />
                </span>
                <p className="mt-2 text-sm font-bold">{a.t}</p>
                <p className="text-[11px] text-ink-mut">{a.d}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* recent activity */}
        <Card padded>
          <h2 className="mb-4 font-display text-lg font-bold">Recent activity</h2>
          <div className="space-y-2">
            {ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-glass/[0.04] p-3">
                <div>
                  <p className="text-sm font-semibold">{a.g}</p>
                  <p className="text-xs text-ink-mut">{a.t}</p>
                </div>
                <span className={`font-stat text-sm font-bold ${a.win ? "text-success" : "text-danger"}`}>
                  {a.a}
                </span>
              </div>
            ))}
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
