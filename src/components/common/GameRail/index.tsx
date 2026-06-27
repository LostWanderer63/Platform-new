import type { Game } from "@/data/mock";
import { GameCard } from "@/components/game/GameCard";

/** Horizontal scroll rail of game cards (mobile) -> grid feel on desktop. */
export function GameRail({ games }: { games: Game[] }) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {games.map((g) => (
        <div key={g.id} className="w-36 shrink-0 snap-start sm:w-44">
          <GameCard game={g} />
        </div>
      ))}
    </div>
  );
}
