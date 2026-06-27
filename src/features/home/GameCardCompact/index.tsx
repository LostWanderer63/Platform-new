import { Link } from "react-router-dom";
import { GameImage } from "@/components/game/GameArt";
import type { Game } from "@/data/mock";

/** Compact square game tile used in the Originals grid. */
export function GameCardCompact({ game }: { game: Game }) {
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
