import { Link } from "react-router-dom";
import { ShieldCheck, Zap, Gift } from "lucide-react";
import { Ambient } from "@/components/layout/Ambient";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-2">
      <Ambient />

      {/* brand panel */}
      <div className="relative z-raised hidden flex-col justify-between p-12 lg:flex">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-accent to-accent-2 shadow-glow">
            <span className="font-display text-xl font-extrabold text-base">A</span>
          </div>
          <span className="font-display text-xl font-extrabold tracking-tight">AURORA</span>
        </Link>

        <div className="max-w-md">
          <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight">
            Welcome to the <span className="text-gradient">future</span> of play.
          </h2>
          <div className="mt-8 space-y-4">
            {[
              { icon: Gift, t: "$5,000 welcome bonus", d: "Across your first four deposits." },
              { icon: Zap, t: "Instant payouts", d: "Withdraw to your card or bank, 24/7." },
              { icon: ShieldCheck, t: "Certified fair", d: "Independently audited & certified RNG." },
            ].map((f) => (
              <div key={f.t} className="flex items-start gap-3 rounded-lg glass p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">{f.t}</p>
                  <p className="text-sm text-ink-mut">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-ink-mut">18+ · Play responsibly · BeGambleAware</p>
      </div>

      {/* form panel — top-aligned so the form doesn't re-center (jump) when
          the inline error message appears/disappears */}
      <div className="relative z-raised flex min-h-screen items-start justify-center px-5 py-[12vh] sm:px-8">
        <div className="w-full max-w-sm animate-fade-up">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-accent to-accent-2">
              <span className="font-display text-lg font-extrabold text-base">A</span>
            </div>
            <span className="font-display text-lg font-extrabold">AURORA</span>
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
