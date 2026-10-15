"use client";
import * as React from "react";
import { errorMessage, post } from "@/lib/client/api";
import type { AudienceSpec } from "@/lib/shared/types";
import { audienceReady } from "./lib";

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface AudienceStatsData {
  eligible: number;
  opted_out: number;
  pending: number;
  sample: { id: string; name: string | null; phone: string }[];
}

const EMPTY: AudienceStatsData = { eligible: 0, opted_out: 0, pending: 0, sample: [] };

/** Live audience numbers from POST /api/campaigns/audience, debounced. Keeps the previous result while refetching. */
export function useAudienceStats(audience: AudienceSpec, enabled = true) {
  const key = JSON.stringify(audience);
  const [state, setState] = React.useState<{ data: AudienceStatsData | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    if (!enabled) return;
    const spec = JSON.parse(key) as AudienceSpec;
    if (!audienceReady(spec)) {
      setState({ data: EMPTY, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const data = await post<AudienceStatsData>("/api/campaigns/audience", { audience: spec });
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: errorMessage(e) }));
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key, enabled]);

  return state;
}

/** A clock that ticks, so render never has to call Date.now() itself. */
export function useNowMs(intervalMs = 15_000): number {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
