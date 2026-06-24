import { NavLink } from "react-router-dom";
import {
  Home,
  Dice5,
  Trophy,
  Wallet,
  User,
  Gift,
  LayoutDashboard,
  Headphones,
  Users,
  Settings,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useToast } from "../../lib/toast";

const MAIN = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/casino", label: "Casino", icon: Dice5 },
  { to: "/sports", label: "Sports", icon: Trophy },
  { to: "/wallet", label: "Wallet", icon: Wallet },
];
const SECONDARY = [
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/admin", label: "Admin", icon: LayoutDashboard },
];

function Item({ to, label, Icon }: { to: string; label: string; Icon: typeof Home }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-all duration-200",
          isActive ? "bg-accent/15 text-ink shadow-glow" : "text-ink-mut hover:bg-glass/[0.06] hover:text-ink"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-accent")} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { push } = useToast();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line/10 bg-elevated/40 backdrop-blur-glass lg:flex">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-accent to-accent-2 shadow-glow">
          <span className="font-display text-lg font-extrabold text-base">A</span>
        </div>
        <span className="font-display text-lg font-extrabold tracking-tight">AURORA</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-mut">Menu</p>
        {MAIN.map((i) => (
          <Item key={i.to} to={i.to} label={i.label} Icon={i.icon} />
        ))}
        <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-mut">
          Account
        </p>
        {SECONDARY.map((i) => (
          <Item key={i.to} to={i.to} label={i.label} Icon={i.icon} />
        ))}
      </nav>

      <div className="border-t border-line/10 p-3">
        <button
          onClick={() => push("Daily reward claimed — +$25.00 bonus added 🎁")}
          className="w-full rounded-lg glass p-3 text-left transition-all hover:shadow-glow"
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-gold">
            <Gift className="h-4 w-4" /> Daily Reward
          </div>
          <p className="text-xs text-ink-mut">Tap to claim · +$25.00</p>
        </button>
        <div className="mt-2 flex gap-1">
          <button
            onClick={() => push("Support chat opening…", "info")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs text-ink-mut hover:text-ink"
          >
            <Headphones className="h-4 w-4" /> Support
          </button>
          <button
            onClick={() => push("Friends list coming soon", "info")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs text-ink-mut hover:text-ink"
          >
            <Users className="h-4 w-4" /> Friends
          </button>
        </div>
      </div>
    </aside>
  );
}
