import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface AuthState {
  user: string | null;
  isAuthed: boolean;
  login: (name?: string) => void;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);
const KEY = "aurora_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });

  const login = useCallback((name = "Pruthvi") => {
    setUser(name);
    try {
      localStorage.setItem(KEY, name);
    } catch {
      /* ignore */
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return <Ctx.Provider value={{ user, isAuthed: !!user, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
