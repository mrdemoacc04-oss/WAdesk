"use client";
import * as React from "react";
import { Card, Skeleton } from "@/components/ui/display";
import { cn, fmtNum, fmtPct } from "@/lib/shared/utils";
import type { OptIn } from "@/lib/shared/types";

export interface Audience {
  total: number;
  opted_in: number;
  opted_out: number;
  pending: number;
  new_week: number;
}

type Filter = "all" | OptIn;

export function StatTiles({
  audience,
  active,
  onPick,
}: {
  audience?: Audience;
  active: Filter;
  onPick: (f: Filter) => void;
}) {
  const tiles: { key: string; label: string; value?: number; filter?: Filter; note?: string }[] = [
    { key: "total", label: "Total contacts", value: audience?.total, filter: "all" },
    {
      key: "in",
      label: "Opted in",
      value: audience?.opted_in,
      filter: "opted_in",
      note: audience ? `${fmtPct(audience.opted_in, audience.total, 0)} of all` : undefined,
    },
    {
      key: "pending",
      label: "Unconfirmed",
      value: audience?.pending,
      filter: "pending",
      note: audience ? `${fmtPct(audience.pending, audience.total, 0)} of all` : undefined,
    },
    {
      key: "out",
      label: "Opted out",
      value: audience?.opted_out,
      filter: "opted_out",
      note: audience ? `${fmtPct(audience.opted_out, audience.total, 0)} of all` : undefined,
    },
    { key: "new", label: "New this week", value: audience?.new_week, note: "last 7 days" },
  ];

  return (
    <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-5 md:mx-0 md:mb-5 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0" aria-live="polite">
      {tiles.map((t) => {
        const isActive = t.filter !== undefined && t.filter === active && !(t.filter === "all");
        const body = (
          <>
            <span className="text-[13px] text-ink-3">{t.label}</span>
            {t.value === undefined ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <span className="tabular mt-1 block text-2xl font-medium leading-tight tracking-tight md:text-[26px]">{fmtNum(t.value)}</span>
            )}
            <span className="mt-0.5 block h-4 text-xs text-ink-4">{t.note}</span>
          </>
        );
        return (
          <Card key={t.key} padded={false} className="min-w-[148px] shrink-0 snap-start md:min-w-0" coreClassName={cn("transition-shadow duration-300", isActive && "shadow-[inset_0_0_0_1.5px_var(--accent)]")}>
            {t.filter ? (
              <button
                type="button"
                onClick={() => onPick(t.filter!)}
                aria-pressed={isActive}
                className="block w-full rounded-[inherit] px-4 py-3.5 text-left outline-none transition-colors duration-300 hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                {body}
              </button>
            ) : (
              <div className="px-4 py-3.5">{body}</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
