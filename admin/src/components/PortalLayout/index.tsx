import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Network, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/players", label: "My Players", icon: Users },
  { to: "/subs", label: "Sub-distributors", icon: Network },
];

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel p-3 md:flex">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 font-extrabold text-base">
            A
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">Aurora</p>
            <p className="text-[11px] text-mut">Distributor portal</p>
          </div>
        </div>
        <nav className="mt-3 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive ? "bg-accent/15 text-ink" : "text-mut hover:bg-panel2 hover:text-ink"
                }`
              }
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-3">
          <p className="px-3 text-xs text-mut">
            {user?.username} · <span className="text-accent2">{user?.role}</span>
          </p>
          <button onClick={logout} className="btn-ghost mt-2 w-full">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-5 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
