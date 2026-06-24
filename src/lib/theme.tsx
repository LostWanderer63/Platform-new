import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "aurora" | "gold" | "emerald";
export const THEMES: { id: Theme; name: string; desc: string; swatch: string }[] = [
  { id: "aurora", name: "Aurora", desc: "Electric violet → cyan", swatch: "from-[#7c5cff] to-[#38d6ff]" },
  { id: "gold", name: "Midnight Gold", desc: "Warm amber luxury", swatch: "from-[#f0c46e] to-[#ff944a]" },
  { id: "emerald", name: "Emerald Vault", desc: "Jewel green → teal", swatch: "from-[#28d49e] to-[#40e8cc]" },
];

const KEY = "aurora_theme";

interface ThemeApi {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const v = localStorage.getItem(KEY) as Theme | null;
    return v && ["aurora", "gold", "emerald"].includes(v) ? v : "aurora";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
