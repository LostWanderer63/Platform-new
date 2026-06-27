import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";

export function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login } = useAuth();
  const { push } = useToast();
  const from = (loc.state as { from?: string } | null)?.from ?? "/home";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(identifier, password);
      nav(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue your run.">
      <form className="space-y-4" onSubmit={submit}>
        <Input
          label="Email or username"
          type="text"
          placeholder="you@email.com"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          iconLeft={<Mail className="h-4 w-4" />}
        />
        <Input
          label="Password"
          type={show ? "text" : "password"}
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          iconLeft={<Lock className="h-4 w-4" />}
          iconRight={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="pointer-events-auto text-ink-mut transition-colors hover:text-ink"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        {error && (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            <p>{error}</p>
            {error.toLowerCase().includes("admin panel") && (
              <a
                href={import.meta.env.VITE_ADMIN_URL ?? "http://localhost:5174"}
                className="mt-1 inline-block font-semibold text-accent hover:underline"
              >
                Go to admin panel →
              </a>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line/30 bg-glass/10 accent-[rgb(var(--c-accent))]"
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={() => push("Password reset link sent to your email", "info")}
            className="font-semibold text-accent hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" block size="lg" loading={busy}>
          Log in
        </Button>

        <div className="flex items-center gap-3 py-1 text-xs text-ink-mut">
          <span className="h-px flex-1 bg-line/15" /> or <span className="h-px flex-1 bg-line/15" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" type="button" onClick={() => push("Social login coming soon", "info")}>
            Google
          </Button>
          <Button variant="secondary" type="button" onClick={() => push("Wallet login coming soon", "info")}>
            Wallet
          </Button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        New to Aurora?{" "}
        <Link to="/register" className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
