import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

/** Gate personalized/account pages — guests redirect to login. Waits for the
 *  session check so we don't bounce an authenticated user on first load. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthed, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}
