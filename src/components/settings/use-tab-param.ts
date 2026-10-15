"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";

/**
 * Tab state that mirrors `?tab=` in the URL. Switching is instant (local state) and the URL is
 * updated with history.replaceState, so there is no server round trip and links like
 * /settings?tab=team keep working. Callers must render this inside a <Suspense> boundary.
 */
export function useTabParam<T extends string>(values: readonly T[], fallback: T): [T, (t: T) => void] {
  const sp = useSearchParams();
  const parse = React.useCallback((raw: string | null): T => ((values as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback), [values, fallback]);
  const [tab, setTab] = React.useState<T>(() => parse(sp.get("tab")));

  React.useEffect(() => {
    setTab(parse(sp.get("tab")));
  }, [sp, parse]);

  const set = React.useCallback(
    (t: T) => {
      setTab(t);
      try {
        const url = new URL(window.location.href);
        if (t === fallback) url.searchParams.delete("tab");
        else url.searchParams.set("tab", t);
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      } catch {
        /* URL sync is a convenience only */
      }
    },
    [fallback],
  );

  return [tab, set];
}
