import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, Flame, Sparkles, Dice5, Radio, Spade, Heart } from "lucide-react";
import { Tabs } from "../components/ui/Tabs";
import { Badge } from "../components/ui/Badge";
import { GameCard } from "../components/game/GameCard";
import { ORIGINALS, SLOTS, LIVE } from "../data/mock";
import type { Game } from "../data/mock";
import { useToast } from "../lib/toast";
import { useFavorites } from "../lib/favorites";

const ALL: Game[] = [...ORIGINALS, ...SLOTS, ...LIVE];

const TABS = [
  { id: "all", label: "All", icon: <Flame className="h-4 w-4" /> },
  { id: "favorites", label: "Favorites", icon: <Heart className="h-4 w-4" /> },
  { id: "Originals", label: "Originals", icon: <Sparkles className="h-4 w-4" /> },
  { id: "Slots", label: "Slots", icon: <Dice5 className="h-4 w-4" /> },
  { id: "Live", label: "Live", icon: <Radio className="h-4 w-4" /> },
  { id: "Table", label: "Table", icon: <Spade className="h-4 w-4" /> },
];

export function Casino() {
  const { push } = useToast();
  const { has } = useFavorites();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState(params.get("q") ?? "");

  // keep the URL ?q= in sync with the search box (shareable / deep-linkable)
  useEffect(() => {
    const urlQ = params.get("q") ?? "";
    if (urlQ !== q) setQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const onSearch = (val: string) => {
    setQ(val);
    setParams(val ? { q: val } : {}, { replace: true });
  };

  const games = useMemo(
    () =>
      ALL.filter(
        (g) =>
          (tab === "all" || tab === "favorites" || g.category === tab) &&
          (tab !== "favorites" || has(g.id)) &&
          g.name.toLowerCase().includes(q.toLowerCase())
      ),
    [tab, q, has]
  );

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Casino Lobby</h1>
          <p className="mt-1 text-sm text-ink-soft">{ALL.length} games · certified fair</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
            <input
              value={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search 4,800+ games…"
              className="h-12 w-full rounded-md border border-line/15 bg-glass/[0.04] pl-11 pr-4 text-sm text-ink placeholder:text-ink-mut focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <button
            onClick={() => push("Filters panel coming soon", "info")}
            className="flex h-12 items-center justify-center gap-2 rounded-md glass-hi px-5 text-sm font-semibold text-ink transition-colors hover:bg-glass/10"
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </button>
        </div>

        <Tabs items={TABS} active={tab} onChange={setTab} />
      </div>

      {/* grid / empty */}
      {games.length === 0 ? (
        <div className="grid place-items-center rounded-2xl glass py-24 text-center">
          {tab === "favorites" ? (
            <>
              <Heart className="h-10 w-10 text-ink-mut" />
              <p className="mt-4 font-display text-lg font-bold">No favorites yet</p>
              <p className="mt-1 text-sm text-ink-mut">Tap the heart on any game to save it here.</p>
            </>
          ) : (
            <>
              <Search className="h-10 w-10 text-ink-mut" />
              <p className="mt-4 font-display text-lg font-bold">No games found</p>
              <p className="mt-1 text-sm text-ink-mut">Try a different search or category.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-ink-mut">
            <Badge tone="accent">{games.length} results</Badge>
            <span>Sorted by popularity</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 3xl:grid-cols-8">
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
