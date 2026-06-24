import { NavLink } from "react-router-dom";
import { Home, Dice5, Search, Wallet, User } from "lucide-react";
import { cn } from "../../lib/cn";

const ITEMS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/casino", label: "Casino", icon: Dice5 },
  { to: "/casino", label: "Search", icon: Search, center: true },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/profile", label: "Me", icon: User },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-nav border-t border-line/10 bg-base/80 backdrop-blur-glass lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {ITEMS.map((it, i) =>
          it.center ? (
            <NavLink key={i} to={it.to} aria-label={it.label} className="flex items-center justify-center">
              <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-r from-accent to-accent-2 text-white shadow-glow-lg">
                <it.icon className="h-5 w-5" />
              </span>
            </NavLink>
          ) : (
            <NavLink
              key={i}
              to={it.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-md py-1.5 text-[10px] font-semibold transition-colors",
                  isActive ? "text-accent" : "text-ink-mut"
                )
              }
            >
              <it.icon className="h-5 w-5" />
              {it.label}
            </NavLink>
          )
        )}
      </div>
    </nav>
  );
}
