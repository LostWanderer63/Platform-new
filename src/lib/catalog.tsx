import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Game } from "@/data/mock";

interface CatalogRow {
  id: string;
  name: string;
  category: string;
  provider: string;
  kind: string;
  status: string;
  hot: boolean;
  live: boolean;
  hue: number;
  img: string | null;
  launchUrl?: string | null;
}

// deterministic "players online" so the UI looks alive without a backend field
const seededPlayers = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9000;
  return 200 + h;
};

function toGame(r: CatalogRow): Game {
  return {
    id: r.id,
    name: r.name,
    category: r.category as Game["category"],
    provider: r.provider,
    players: seededPlayers(r.id),
    hot: r.hot,
    live: r.live,
    hue: r.hue,
    kw: "",
    img: r.img ?? undefined,
    status: r.status,
    // external games (e.g. the Olympus cabinet) launch their own client by URL;
    // others fall back to the built-in demo client.
    url: r.launchUrl ?? `/demo-game.html?id=${r.id}&name=${encodeURIComponent(r.name)}`,
  };
}

interface CatalogState {
  games: Game[];
  loading: boolean;
  byId: (id: string) => Game | undefined;
  byCategory: (cat: string) => Game[];
}

const Ctx = createContext<CatalogState | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CatalogRow[]>("/games/catalog")
      .then((rows) => setGames(rows.map(toGame)))
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<CatalogState>(
    () => ({
      games,
      loading,
      byId: (id) => games.find((g) => g.id === id),
      byCategory: (cat) => games.filter((g) => g.category === cat),
    }),
    [games, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog(): CatalogState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCatalog must be used within CatalogProvider");
  return c;
}
