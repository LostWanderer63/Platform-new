import { Trophy, Bell } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/toast";

/**
 * Sportsbook — not wired to a live odds feed yet, so we show an honest
 * coming-soon state instead of placeholder fixtures. Drop in a real
 * markets API here and render it.
 */
export function Sports() {
  const { push } = useToast();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Sportsbook</h1>
        <p className="mt-1 text-sm text-ink-soft">Live betting markets — launching soon.</p>
      </div>

      <Card className="relative overflow-hidden" padded>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Trophy className="h-8 w-8" />
          </span>
          <Badge tone="accent" dot>
            Coming soon
          </Badge>
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Sports betting is on the way</h2>
          <p className="max-w-md text-sm text-ink-soft">
            We're integrating a live odds provider for soccer, basketball, tennis, esports and more — with
            real-time markets and cash-out. No demo lines until it's the real thing.
          </p>
          <Button
            iconLeft={<Bell className="h-4 w-4" />}
            onClick={() => push("You'll be notified when the sportsbook goes live", "info")}
          >
            Notify me at launch
          </Button>
        </div>
      </Card>
    </div>
  );
}
