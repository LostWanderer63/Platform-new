import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "ok" | "info" | "bad";
interface Item { id: number; msg: string; tone: Tone }
const Ctx = createContext<{ push: (m: string, t?: Tone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const push = useCallback((msg: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3000);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`card px-4 py-2.5 text-sm shadow-xl ${
              t.tone === "bad" ? "border-bad/50 text-bad" : t.tone === "info" ? "border-accent2/40 text-accent2" : "border-ok/40 text-ok"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside provider");
  return c;
}
