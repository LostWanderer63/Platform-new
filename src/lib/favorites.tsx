import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const KEY = "aurora_favorites";

interface FavApi {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}

const Ctx = createContext<FavApi | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  });

  const persist = (next: string[]) => {
    setIds(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback(
    (id: string) => persist(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    [ids]
  );

  return <Ctx.Provider value={{ ids, has, toggle }}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFavorites must be used within FavoritesProvider");
  return c;
}
