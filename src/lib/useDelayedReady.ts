import { useEffect, useState } from "react";

/** Returns false, then true after `delay` ms — used to show skeletons briefly. */
export function useDelayedReady(delay = 700): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return ready;
}
