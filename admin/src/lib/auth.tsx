import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface AuthState {
  user: AdminUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const STAFF_ROLES = ["ADMIN", "MODERATOR", "DISTRIBUTOR", "SUB_DISTRIBUTOR"];

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AdminUser>("/auth/me")
      .then((u) => setUser(STAFF_ROLES.includes(u.role) ? u : null))
      .catch(() => {
        setUser(null);
        localStorage.removeItem("at");
        localStorage.removeItem("rt");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    // dedicated staff-only endpoint (rejects players server-side)
    const { user, token, refreshToken } = await api.post<{ user: AdminUser; token: string; refreshToken: string }>("/auth/admin/login", { identifier, password });
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

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
