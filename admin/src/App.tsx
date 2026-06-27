import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import { Login } from "@/features/auth/Login";
import { Layout } from "@/components/Layout";
import { PortalLayout } from "@/components/PortalLayout";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { Games } from "@/features/games/Games";
import { Players } from "@/features/players/Players";
import { Distributors } from "@/features/distributors/Distributors";
import { Transactions } from "@/features/transactions/Transactions";
import { Withdrawals } from "@/features/withdrawals/Withdrawals";
import { Kyc } from "@/features/kyc/Kyc";
import { Logs } from "@/features/logs/Logs";
import { Overview } from "@/features/portal/Overview";
import { PortalPlayers } from "@/features/portal/PortalPlayers";
import { PortalSubs } from "@/features/portal/PortalSubs";

function AdminApp() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/games" element={<Games />} />
        <Route path="/players" element={<Players />} />
        <Route path="/distributors" element={<Distributors />} />
        <Route path="/withdrawals" element={<Withdrawals />} />
        <Route path="/kyc" element={<Kyc />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function DistributorApp() {
  return (
    <PortalLayout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/players" element={<PortalPlayers />} />
        <Route path="/subs" element={<PortalSubs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PortalLayout>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Login />;

  const isDistributor = user.role === "DISTRIBUTOR" || user.role === "SUB_DISTRIBUTOR";

  return <ToastProvider>{isDistributor ? <DistributorApp /> : <AdminApp />}</ToastProvider>;
}
