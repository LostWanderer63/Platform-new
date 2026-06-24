import { Link } from "react-router-dom";
import { Play, Users, Eye, Heart } from "lucide-react";
import type { Game } from "../../data/mock";
import { GameImage } from "./GameArt";
import { Badge } from "../ui/Badge";
import { useAuth } from "../../lib/auth";
import { useFavorites } from "../../lib/favorites";

export function GameCard({ game }: { game: Game }) {
  const { isAuthed } = useAuth();
  const { has, toggle } = useFavorites();
  const fav = has(game.id);

  return (
    <Link
      to={`/game/${game.id}`}
      className="group relative block overflow-hidden rounded-lg glass-hi shadow-e2 transition-all duration-300 ease-smooth hover:-translate-y-1 hover:shadow-glow-lg focus-visible:outline-2 focus-visible:outline-accent"
    >
      <GameImage game={game} className="aspect-[3/4]" />

      <div className="absolute left-2 top-2 flex gap-1.5">
        {game.live && (
          <Badge tone="success" dot>
            Live
          </Badge>
        )}
        {game.hot && <Badge tone="danger">Hot</Badge>}
      </div>

      {/* favorite toggle */}
      <button
        aria-label={fav ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={fav}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(game.id);
        }}
        className={`absolute right-2 top-2 z-raised grid h-8 w-8 place-items-center rounded-full bg-base/60 backdrop-blur transition-all hover:scale-110 ${
          fav ? "text-danger opacity-100" : "text-ink-soft opacity-0 group-hover:opacity-100"
        }`}
      >
        <Heart className={`h-4 w-4 ${fav ? "fill-current" : ""}`} />
      </button>

      {/* hover overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-base/95 via-base/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        {isAuthed ? (
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-r from-accent to-accent-2 text-base shadow-glow transition-transform duration-300 ease-spring group-hover:scale-110">
            <Play className="h-5 w-5 fill-current" />
          </span>
        ) : (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-base/70 px-3 py-1.5 text-xs font-bold text-ink backdrop-blur">
            <Eye className="h-3.5 w-3.5 text-accent" /> Explore
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-bold">{game.name}</h3>
          <p className="truncate text-[11px] text-ink-mut">{game.provider}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-mut">
          <Users className="h-3 w-3" />
          {game.players}
        </span>
      </div>
    </Link>
  );
}
