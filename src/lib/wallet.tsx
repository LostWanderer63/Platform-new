import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const KEY = "aurora_balance";
const START = 8412.5;

export const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

interface WalletApi {
  balance: number;
  deposit: (n: number) => void;
  withdraw: (n: number) => boolean;
  placeBet: (n: number) => boolean;
  addWin: (n: number) => void;
}

const Ctx = createContext<WalletApi | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState<number>(() => {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : START;
  });

  const set = useCallback((updater: (b: number) => number) => {
    setBalance((b) => {
      const next = Math.max(0, Math.round(updater(b) * 100) / 100);
      try {
        localStorage.setItem(KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const deposit = useCallback((n: number) => set((b) => b + n), [set]);
  const addWin = useCallback((n: number) => set((b) => b + n), [set]);

  const withdraw = useCallback(
    (n: number) => {
      if (n <= 0 || n > balance) return false;
      set((b) => b - n);
      return true;
    },
    [balance, set]
  );

  const placeBet = useCallback(
    (n: number) => {
      if (n <= 0 || n > balance) return false;
      set((b) => b - n);
      return true;
    },
    [balance, set]
  );

  return <Ctx.Provider value={{ balance, deposit, withdraw, placeBet, addWin }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet must be used within WalletProvider");
  return c;
}
