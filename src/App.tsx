import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAuth } from "./components/layout/RequireAuth";
import { ScrollToTop } from "./components/layout/ScrollToTop";

/* Route-level code splitting — each page ships in its own chunk. */
const Landing = lazy(() => import("./pages/Landing").then((m) => ({ default: m.Landing })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("./pages/Register").then((m) => ({ default: m.Register })));
const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const Casino = lazy(() => import("./pages/Casino").then((m) => ({ default: m.Casino })));
const GamePage = lazy(() => import("./pages/GamePage").then((m) => ({ default: m.GamePage })));
const Sports = lazy(() => import("./pages/Sports").then((m) => ({ default: m.Sports })));
const Wallet = lazy(() => import("./pages/Wallet").then((m) => ({ default: m.Wallet })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));
const NotFound = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));

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
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <Admin />
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
