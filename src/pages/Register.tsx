import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Gift } from "lucide-react";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../lib/auth";

export function Register() {
  const nav = useNavigate();
  const { login } = useAuth();
  return (
    <AuthLayout title="Create your account" subtitle="30 seconds. Your $5,000 bonus is waiting.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login();
          nav("/home");
        }}
      >
        <Input
          label="Username"
          type="text"
          placeholder="player_one"
          iconLeft={<User className="h-4 w-4" />}
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@email.com"
          iconLeft={<Mail className="h-4 w-4" />}
        />
        <Input
          label="Password"
          type="password"
          placeholder="8+ characters"
          hint="Use 8+ characters with a number & symbol."
          iconLeft={<Lock className="h-4 w-4" />}
        />
        <div className="flex items-center gap-2 rounded-md bg-gold/10 px-3 py-2.5 text-xs font-semibold text-gold">
          <Gift className="h-4 w-4" /> Bonus code{" "}
          <span className="ml-auto rounded bg-gold/20 px-2 py-0.5">AURORA5K</span>
        </div>
        <label className="flex items-start gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-line/30 bg-glass/10 accent-[rgb(var(--c-accent))]"
          />
          I am 18+ and agree to the Terms & Responsible Gaming policy.
        </label>
        <Button type="submit" block size="lg">
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
