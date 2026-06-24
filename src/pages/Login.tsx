import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, Eye } from "lucide-react";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

export function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login } = useAuth();
  const { push } = useToast();
  const from = (loc.state as { from?: string } | null)?.from ?? "/home";
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue your run.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login();
          nav(from, { replace: true });
        }}
      >
        <Input
          label="Email or username"
          type="text"
          placeholder="you@email.com"
          iconLeft={<Mail className="h-4 w-4" />}
        />
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          iconLeft={<Lock className="h-4 w-4" />}
          iconRight={<Eye className="h-4 w-4" />}
        />
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
        <Button type="submit" block size="lg">
          Log in
        </Button>

        <div className="flex items-center gap-3 py-1 text-xs text-ink-mut">
          <span className="h-px flex-1 bg-line/15" /> or <span className="h-px flex-1 bg-line/15" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              login();
              nav(from, { replace: true });
            }}
          >
            Google
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              login();
              nav(from, { replace: true });
            }}
          >
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
