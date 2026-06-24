import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/** Catches render-time errors so users see a branded screen, not a white page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production, forward to an error-tracking service (Sentry, etc.)
    if (import.meta.env.DEV) console.error("Unhandled error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-base px-6 text-center">
        <div className="max-w-md">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 shadow-glow">
            <span className="font-display text-2xl font-extrabold text-base">!</span>
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink">
            Something went wrong
          </h1>
          <p className="mt-2 text-ink-soft">An unexpected error occurred. Reloading usually fixes it.</p>
          <button
            onClick={() => window.location.assign("/")}
            className="mt-6 rounded-md bg-gradient-to-r from-accent to-accent-2 px-6 py-3 text-sm font-bold text-base shadow-glow transition-transform hover:scale-[1.03]"
          >
            Reload Aurora
          </button>
        </div>
      </div>
    );
  }
}
