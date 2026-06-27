import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { ScrollToTop } from "@/components/layout/ScrollToTop";

/* Route-level code splitting — each page ships in its own chunk. */
const Landing = lazy(() => import("@/features/landing/Landing").then((m) => ({ default: m.Landing })));
const Login = lazy(() => import("@/features/auth/Login").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("@/features/auth/Register").then((m) => ({ default: m.Register })));
const Home = lazy(() => import("@/features/home/Home").then((m) => ({ default: m.Home })));
const Casino = lazy(() => import("@/features/casino/Casino").then((m) => ({ default: m.Casino })));
const GamePage = lazy(() => import("@/features/game/GamePage").then((m) => ({ default: m.GamePage })));
const Sports = lazy(() => import("@/features/sports/Sports").then((m) => ({ default: m.Sports })));
const Wallet = lazy(() => import("@/features/wallet/Wallet").then((m) => ({ default: m.Wallet })));
const Profile = lazy(() => import("@/features/profile/Profile").then((m) => ({ default: m.Profile })));
const Settings = lazy(() => import("@/features/settings/Settings").then((m) => ({ default: m.Settings })));
const NotFound = lazy(() => import("@/features/misc/NotFound").then((m) => ({ default: m.NotFound })));

function PageLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-base" role="status" aria-label="Loading">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* app shell */}
          <Route element={<AppShell />}>
            {/* explore — open to guests */}
            <Route path="/home" element={<Home />} />
            <Route path="/casino" element={<Casino />} />
            <Route path="/game/:id" element={<GamePage />} />
            <Route path="/sports" element={<Sports />} />
            {/* account — require login (personal data) */}
            <Route
              path="/wallet"
              element={
                <RequireAuth>
                  <Wallet />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <Settings />
                </RequireAuth>
              }
            />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
