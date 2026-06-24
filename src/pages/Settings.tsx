import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Palette, SlidersHorizontal, ShieldAlert, LogOut, KeyRound } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useTheme, THEMES } from "../lib/theme";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";

function Toggle({
  on,
  onChange,
  label,
  desc,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-ink-mut">{desc}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          on ? "bg-accent" : "bg-glass/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function Settings() {
  const { theme, setTheme } = useTheme();
  const { push } = useToast();
  const { logout } = useAuth();
  const nav = useNavigate();

  const [sound, setSound] = useState(true);
  const [emails, setEmails] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [limit, setLimit] = useState("");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">Personalize your experience.</p>
      </div>

      {/* appearance / theme */}
      <Card padded>
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <Palette className="h-5 w-5 text-accent" /> Appearance
        </h2>
        <p className="mb-4 text-sm text-ink-mut">Pick an accent theme — applies instantly across the app.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                push(`${t.name} theme applied`);
              }}
              aria-pressed={theme === t.id}
              className={`relative overflow-hidden rounded-lg p-4 text-left transition-all ${
                theme === t.id ? "ring-2 ring-accent" : "ring-1 ring-line/15 hover:ring-line/30"
              }`}
            >
              <span className={`block h-12 w-full rounded-md bg-gradient-to-br ${t.swatch}`} />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-bold">{t.name}</span>
                {theme === t.id && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-base">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>
              <span className="text-xs text-ink-mut">{t.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* preferences */}
      <Card padded>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <SlidersHorizontal className="h-5 w-5 text-accent" /> Preferences
        </h2>
        <div className="divide-y divide-line/10">
          <Toggle
            on={sound}
            onChange={(v) => {
              setSound(v);
              push(v ? "Sound on" : "Sound off", "info");
            }}
            label="Sound effects"
            desc="Play sounds for wins and actions."
          />
          <Toggle
            on={emails}
            onChange={(v) => {
              setEmails(v);
              push(v ? "Email updates on" : "Email updates off", "info");
            }}
            label="Email notifications"
            desc="Promotions, results, and account alerts."
          />
          <Toggle
            on={reduceMotion}
            onChange={(v) => {
              setReduceMotion(v);
              push(v ? "Reduced motion on" : "Reduced motion off", "info");
            }}
            label="Reduced motion"
            desc="Minimize animations across the interface."
          />
        </div>
      </Card>

      {/* responsible gaming */}
      <Card padded>
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <ShieldAlert className="h-5 w-5 text-warning" /> Responsible gaming
        </h2>
        <p className="mb-4 text-sm text-ink-mut">
          Set limits to stay in control. You can adjust these anytime.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="Daily deposit limit"
            type="number"
            placeholder="e.g. 500"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
          <Button
            className="shrink-0"
            onClick={() =>
              Number(limit) > 0
                ? push(`Daily deposit limit set to $${Number(limit).toFixed(2)}`)
                : push("Enter a limit amount", "danger")
            }
          >
            Save limit
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => push("Reality-check reminder enabled (every 60 min)", "info")}
          >
            Enable session reminder
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => push("Self-exclusion request received — support will confirm", "info")}
          >
            Self-exclude
          </Button>
        </div>
      </Card>

      {/* account */}
      <Card padded>
        <h2 className="mb-3 font-display text-lg font-bold">Account</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            iconLeft={<KeyRound className="h-4 w-4" />}
            onClick={() => push("Password reset link sent to your email", "info")}
          >
            Change password
          </Button>
          <Button
            variant="ghost"
            iconLeft={<LogOut className="h-4 w-4" />}
            onClick={() => {
              logout();
              push("Logged out");
              nav("/");
            }}
          >
            Log out
          </Button>
        </div>
      </Card>
    </div>
  );
}
