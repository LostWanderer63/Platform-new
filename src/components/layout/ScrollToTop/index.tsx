import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Scrolls to top on every route change for a clean page transition. */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}
