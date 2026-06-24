import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

type Tone = "success" | "info" | "danger";
interface ToastItem {
  id: number;
  msg: string;
  tone: Tone;
}
interface ToastApi {
  push: (msg: string, tone?: Tone) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

const ICON = { success: CheckCircle2, info: Info, danger: AlertTriangle };
const COLOR = { success: "text-success", info: "text-info", danger: "text-danger" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((msg: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-toast flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end lg:bottom-6">
        <AnimatePresence>
          {items.map((t) => {
            const I = ICON[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                role="status"
                initial={{ opacity: 0, x: 40, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-md glass-hi px-4 py-3 shadow-e3"
              >
                <I className={`h-5 w-5 shrink-0 ${COLOR[t.tone]}`} />
                <p className="flex-1 text-sm font-medium text-ink">{t.msg}</p>
                <button
                  aria-label="Dismiss"
                  onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}
                  className="text-ink-mut transition-colors hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast must be used within ToastProvider");
  return c;
}
