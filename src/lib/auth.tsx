import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type ApiUser } from "@/lib/api";

interface AuthState {
  user: ApiUser | null;
  isAuthed: boolean;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { username: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  // hydrate session from the cookie on load
  useEffect(() => {
    api
      .get<ApiUser>("/auth/me")
      // only real players use the player app; ignore staff/distributor sessions
      .then((u) => setUser(u.role === "USER" ? u : null))
      .catch(() => {
        setUser(null);
        localStorage.removeItem("at");
        localStorage.removeItem("rt");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const { user, token, refreshToken } = await api.post<{ user: ApiUser; token: string; refreshToken: string }>("/auth/login", { identifier, password });
    if (token) localStorage.setItem("at", token);
    if (refreshToken) localStorage.setItem("rt", refreshToken);
    setUser(user);
  }, []);

  const register = useCallback(async (data: { username: string; email: string; password: string }) => {
    const { user, token, refreshToken } = await api.post<{ user: ApiUser; token: string; refreshToken: string }>("/auth/register", data);
    if (token) localStorage.setItem("at", token);
    if (refreshToken) localStorage.setItem("rt", refreshToken);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    localStorage.removeItem("at");
    localStorage.removeItem("rt");
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, isAuthed: !!user, loading, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
