import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Ambient } from "./Ambient";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";

/** Authenticated app frame: sidebar (desktop) + topbar + bottom nav (mobile). */
export function AppShell() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const dist = reduce ? 0 : 8;

  return (
    <div className="relative min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-toast focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-base"
      >
        Skip to content
      </a>
      <Ambient />
      <div className="relative z-raised flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" className="min-h-[calc(100vh-4rem)] px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
            <div className="mx-auto max-w-[1600px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: dist }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -dist }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
