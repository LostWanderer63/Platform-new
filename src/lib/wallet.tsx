import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { api, API_ORIGIN, type BalanceResp, type TxResp } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export interface LiveWin {
  username: string;
  game: string;
  amount: string;
  multiplier: number;
  at: number;
}

interface WalletState {
  balance: number;
  liveWins: LiveWin[];
  deposit: (amount: number, method: string) => Promise<void>;
  withdraw: (amount: number, method: string) => Promise<void>;
  setBalance: (n: number) => void;
  addLocal: (n: number) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  const [balance, setBalance] = useState(0);
  const [liveWins, setLiveWins] = useState<LiveWin[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthed) {
      setBalance(0);
      return;
    }
    try {
      const w = await api.get<BalanceResp>("/wallet");
      setBalance(Number(w.balance));
    } catch {
      /* ignore */
    }
  }, [isAuthed]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // realtime: live wins feed (public) + balance push (private)
  useEffect(() => {
    if (!isAuthed) return;
    const socket = io(API_ORIGIN, { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("win", (w: LiveWin) => setLiveWins((prev) => [w, ...prev].slice(0, 20)));
    socket.on("balance", (b: { balance: string }) => setBalance(Number(b.balance)));
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [isAuthed]);

  const deposit = useCallback(async (amount: number, method: string) => {
    const r = await api.post<TxResp>("/transactions/deposit", { amount: String(amount), method });
    setBalance(Number(r.balance));
  }, []);

  const withdraw = useCallback(async (amount: number, method: string) => {
    const r = await api.post<TxResp>("/transactions/withdraw", { amount: String(amount), method });
    setBalance(Number(r.balance));
  }, []);

  const addLocal = useCallback((n: number) => setBalance((b) => b + n), []);

  return (
    <Ctx.Provider value={{ balance, liveWins, deposit, withdraw, setBalance, addLocal, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet must be used within WalletProvider");
  return c;
}
