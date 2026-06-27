import { Link } from "react-router-dom";
import { ChevronRight, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GameImage } from "@/components/game/GameArt";
import { useCatalog } from "@/lib/catalog";

/** Spotlight card for a featured game from the live catalog. */
export function GameOfTheWeek() {
  const { games } = useCatalog();
  const game = games.find((g) => g.hot) ?? games[0];
  if (!game) return null;

  return (
    <Card className="group relative flex h-full flex-col justify-between overflow-hidden p-6" hover>
      <div className="relative">
        <div className="flex items-center justify-between">
          <Badge tone="gold" dot className="animate-pulse">
            Game of the Week
          </Badge>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
            <Users className="h-3.5 w-3.5" /> {game.players.toLocaleString()} playing
          </span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <GameImage game={game} className="h-20 w-20 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <h3 className="font-display text-2xl font-extrabold tracking-tight">{game.name}</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {game.category} · {game.provider}
            </p>
          </div>
        </div>

        <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft">
          Provably-fair, instant rounds. Every outcome is decided and verified server-side.
        </p>
      </div>

      <div className="relative mt-8 flex items-center justify-end">
        <Link to={`/game/${game.id}`}>
          <Button size="sm" iconRight={<ChevronRight className="h-4 w-4" />}>
            Play {game.name}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
