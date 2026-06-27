import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Gift, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export function Register() {
  const nav = useNavigate();
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!agree) {
      setError("Please confirm you are 18+ and agree to the terms.");
      return;
    }
    setBusy(true);
    try {
      await register({ username, email, password });
      nav("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Takes 30 seconds — start playing right away.">
      <form className="space-y-4" onSubmit={submit}>
        <Input
          label="Username"
          type="text"
          placeholder="player_one"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          iconLeft={<User className="h-4 w-4" />}
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@email.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          iconLeft={<Mail className="h-4 w-4" />}
        />
        <Input
          label="Password"
          type={show ? "text" : "password"}
          placeholder="8+ characters"
          autoComplete="new-password"
          hint="Use 8+ characters."
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
        <div className="flex items-center gap-2 rounded-md bg-gold/10 px-3 py-2.5 text-xs font-semibold text-gold">
          <Gift className="h-4 w-4" /> Bonus code{" "}
          <span className="ml-auto rounded bg-gold/20 px-2 py-0.5">AURORA5K</span>
        </div>

        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <label className="flex items-start gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line/30 bg-glass/10 accent-[rgb(var(--c-accent))]"
          />
          I am 18+ and agree to the Terms & Responsible Gaming policy.
        </label>
        <Button type="submit" block size="lg" loading={busy}>
          Create account & claim bonus
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-accent hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
