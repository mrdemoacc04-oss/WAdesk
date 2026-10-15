"use client";
import * as React from "react";
import { CalendarBlank, Check, PaperPlaneTilt, Warning } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Inset } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/input";
import { cn, fmtNum } from "@/lib/shared/utils";
import { useNowMs } from "../hooks";
import { SPEEDS, duration, fmtZoned, isoToZoned, tzAbbrev, zonedToIso } from "../lib";
import type { SendMode } from "./types";
import { SectionTitle, StepHeader } from "./step-shell";

function Choice({
  active,
  onClick,
  icon: Ico,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: Icon;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "relative flex items-start gap-3.5 rounded-2xl p-4 text-left outline-none transition-[box-shadow,background-color] duration-300 ease-fluid focus-visible:ring-2 focus-visible:ring-accent/60",
        active ? "bg-accent-soft/60 shadow-[inset_0_0_0_1.5px_var(--accent)]" : "bg-surface hairline hover:bg-surface-2/70",
      )}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl transition-colors", active ? "bg-accent text-white" : "bg-ink/[0.06] text-ink-2")}>
        <Ico size={20} />
      </span>
      <span className="min-w-0 pr-5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{desc}</span>
      </span>
      {active && (
        <span className="absolute right-3.5 top-3.5 grid size-5 place-items-center rounded-full bg-accent text-white">
          <Check size={11} weight="bold" />
        </span>
      )}
    </button>
  );
}

export function StepSchedule({
  sendMode,
  onSendMode,
  scheduledAt,
  onScheduledAt,
  tz,
  throttle,
  onThrottle,
  eligible,
}: {
  sendMode: SendMode;
  onSendMode: (m: SendMode) => void;
  scheduledAt: string | null;
  onScheduledAt: (iso: string | null) => void;
  tz: string;
  throttle: number;
  onThrottle: (v: number) => void;
  eligible: number | null;
}) {
  const initial = React.useMemo(() => isoToZoned(scheduledAt, tz), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [date, setDate] = React.useState(initial.date);
  const [time, setTime] = React.useState(initial.time);

  const now = useNowMs();
  const today = isoToZoned(new Date(now).toISOString(), tz).date;

  const update = (d: string, t: string) => {
    setDate(d);
    setTime(t);
    onScheduledAt(d && t ? zonedToIso(d, t, tz) : null);
  };

  const chooseSchedule = () => {
    onSendMode("schedule");
    if (!date || !time) {
      const tomorrow = isoToZoned(new Date(now + 86_400_000).toISOString(), tz).date;
      update(date || tomorrow, time || "10:00");
    } else {
      onScheduledAt(zonedToIso(date, time, tz));
    }
  };

  const inPast = sendMode === "schedule" && scheduledAt !== null && Date.parse(scheduledAt) <= now;
  const incomplete = sendMode === "schedule" && scheduledAt === null;

  return (
    <div>
      <StepHeader title="Schedule and speed" description="Send right away or pick a time, then choose how fast messages go out." />

      <div role="radiogroup" aria-label="When to send" className="grid gap-3 sm:grid-cols-2">
        <Choice active={sendMode === "now"} onClick={() => onSendMode("now")} icon={PaperPlaneTilt} title="Send now" desc="Starts as soon as you confirm on the next step" />
        <Choice active={sendMode === "schedule"} onClick={chooseSchedule} icon={CalendarBlank} title="Schedule for later" desc="Pick a date and time" />
      </div>

      {sendMode === "schedule" && (
        <Inset className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="sched-date">
              <Input id="sched-date" type="date" min={today} value={date} onChange={(e) => update(e.target.value, time)} invalid={inPast} />
            </Field>
            <Field label="Time" htmlFor="sched-time">
              <Input id="sched-time" type="time" step={300} value={time} onChange={(e) => update(date, e.target.value)} invalid={inPast} />
            </Field>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3" aria-live="polite">
            Times are in your workspace time zone, <span className="font-medium text-ink-2">{tz.replace(/_/g, " ")} ({tzAbbrev(tz)})</span>.
            {scheduledAt && !inPast && (
              <>
                {" "}
                Goes out <span className="font-medium text-ink-2">{fmtZoned(scheduledAt, tz)}</span>.
              </>
            )}
          </p>
          {(inPast || incomplete) && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
              <Warning size={13} weight="fill" />
              {inPast ? "That time has passed. Choose a time in the future." : "Choose both a date and a time."}
            </p>
          )}
        </Inset>
      )}

      <SectionTitle
        className="mb-4 mt-9"
        title="Sending speed"
        description="Messages are paced so your number isn’t flagged. Slower is gentler on a new number; faster suits time-sensitive offers."
      />
      <div role="radiogroup" aria-label="Sending speed" className="grid gap-3 sm:grid-cols-2">
        {SPEEDS.map((s) => {
          const active = throttle === s.value;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onThrottle(s.value)}
              className={cn(
                "relative rounded-2xl p-4 text-left outline-none transition-[box-shadow,background-color] duration-300 ease-fluid focus-visible:ring-2 focus-visible:ring-accent/60",
                active ? "bg-accent-soft/60 shadow-[inset_0_0_0_1.5px_var(--accent)]" : "bg-surface hairline hover:bg-surface-2/70",
              )}
            >
              <span className="flex items-baseline justify-between gap-3 pr-6">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="tabular font-mono text-xs text-ink-3">{s.hint}</span>
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-ink-3">{s.note}</span>
              <span className="tabular mt-3 block border-t border-line pt-3 text-[13px] text-ink-2">
                {eligible ? (
                  <>
                    {fmtNum(eligible)} {eligible === 1 ? "message" : "messages"} in <span className="font-medium text-ink">{duration(eligible, s.value)}</span>
                  </>
                ) : (
                  "Choose an audience to see the estimate"
                )}
              </span>
              {active && (
                <span className="absolute right-3.5 top-3.5 grid size-5 place-items-center rounded-full bg-accent text-white">
                  <Check size={11} weight="bold" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
