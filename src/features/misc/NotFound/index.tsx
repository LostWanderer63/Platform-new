import { Link } from "react-router-dom";
import { Home, Dice5 } from "lucide-react";
import { Ambient } from "@/components/layout/Ambient";
import { Button } from "@/components/ui/Button";

export function NotFound() {
  return (
    <div className="relative grid min-h-screen place-items-center px-6">
      <Ambient />
      <div className="relative z-raised max-w-md text-center animate-fade-up">
        <p className="font-stat text-8xl font-extrabold tracking-tight text-gradient sm:text-9xl">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-ink-soft">
          The page you're after rolled off the table. Let's get you back in the game.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/home">
            <Button size="lg" iconLeft={<Home className="h-5 w-5" />}>
              Home
            </Button>
          </Link>
          <Link to="/casino">
            <Button size="lg" variant="secondary" iconLeft={<Dice5 className="h-5 w-5" />}>
              Casino
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
