import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Bell,
  Plus,
  Menu,
  LogOut,
  Compass,
  X,
  User,
  Headphones,
  Settings,
} from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { useWallet, fmt } from "@/lib/wallet";

export function TopBar() {
  const { isAuthed, logout, user } = useAuth();
  const { balance } = useWallet();
  const { push } = useToast();
  const nav = useNavigate();
  const [mobileSearch, setMobileSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    nav(q.trim() ? `/casino?q=${encodeURIComponent(q.trim())}` : "/casino");
    setMobileSearch(false);
  };

  return (
    <header className="sticky top-0 z-nav border-b border-line/10 bg-base/70 backdrop-blur-glass">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <Link to="/home" className="flex items-center gap-2 lg:hidden">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-accent to-accent-2">
            <span className="font-display text-base font-extrabold text-base">A</span>
          </div>
        </Link>

        {/* search (desktop) */}
        <form onSubmit={submitSearch} className="relative hidden max-w-md flex-1 sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search games, providers…"
            className="h-10 w-full rounded-md border border-line/15 bg-glass/[0.04] pl-10 pr-4 text-sm text-ink placeholder:text-ink-mut focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </form>

        <div className="flex-1 sm:hidden" />

        {isAuthed ? (
          <>
            <div className="flex items-center gap-2 rounded-md glass-hi px-1 py-1">
              <div className="px-2.5">
                <p className="font-stat text-sm font-bold leading-none text-ink">{fmt(balance)}</p>
                <p className="text-[10px] leading-none text-ink-mut">Balance</p>
              </div>
              <Link
                to="/wallet"
                className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-r from-accent to-accent-2 text-white shadow-glow transition-transform hover:scale-105"
                aria-label="Deposit"
              >
                <Plus className="h-4 w-4" />
              </Link>
            </div>

            <IconButton label="Search" className="sm:hidden" onClick={() => setMobileSearch((v) => !v)}>
              <Search className="h-5 w-5" />
            </IconButton>
            <IconButton
              label="Notifications"
              onClick={() => push("You're all caught up — no new notifications", "info")}
            >
              <span className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger ring-2 ring-base" />
              </span>
            </IconButton>
            <Link to="/profile" aria-label="Profile">
              <Avatar name={user?.username ?? "Player"} size="md" online />
            </Link>
            <IconButton
              label="Log out"
              onClick={() => {
                logout();
                push("Logged out");
                nav("/");
              }}
            >
              <LogOut className="h-5 w-5" />
            </IconButton>
          </>
        ) : (
          <>
            <span className="hidden items-center gap-1.5 rounded-full bg-glass/10 px-3 py-1.5 text-xs font-semibold text-ink-soft sm:flex">
              <Compass className="h-3.5 w-3.5 text-accent" /> Explore mode
            </span>
            <IconButton label="Search" className="sm:hidden" onClick={() => setMobileSearch((v) => !v)}>
              <Search className="h-5 w-5" />
            </IconButton>
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Sign up</Button>
            </Link>
          </>
        )}

        {/* mobile menu */}
        <div className="relative lg:hidden">
          <IconButton label="Menu" active={menu} onClick={() => setMenu((v) => !v)}>
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </IconButton>
          {menu && (
            <>
              <div className="fixed inset-0 z-drawer" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-12 z-drawer w-52 overflow-hidden rounded-lg bg-elevated/95 border border-line/15 backdrop-blur-md p-1.5 shadow-e3 animate-fade-up">
                {[
                  { to: "/profile", label: "Profile", icon: User },
                  { to: "/settings", label: "Settings", icon: Settings },
                ].map((i) => (
                  <Link
                    key={i.to}
                    to={i.to}
                    onClick={() => setMenu(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-glass/10 hover:text-ink"
                  >
                    <i.icon className="h-4 w-4" /> {i.label}
                  </Link>
                ))}
                <button
                  onClick={() => {
                    setMenu(false);
                    push("Support chat opening…", "info");
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-glass/10 hover:text-ink"
                >
                  <Headphones className="h-4 w-4" /> Support
                </button>
                {isAuthed && (
                  <button
                    onClick={() => {
                      setMenu(false);
                      logout();
                      push("Logged out");
                      nav("/");
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10"
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* mobile search row */}
      {mobileSearch && (
        <form onSubmit={submitSearch} className="border-t border-line/10 px-4 py-2.5 sm:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search games…"
              className="h-10 w-full rounded-md border border-line/15 bg-glass/[0.04] pl-10 pr-4 text-sm text-ink placeholder:text-ink-mut focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </form>
      )}
    </header>
  );
}
