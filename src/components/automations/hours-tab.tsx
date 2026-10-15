"use client";
import * as React from "react";
import { Clock, Copy, HandWaving, Moon, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/controls";
import { patch, post, refresh, toastError } from "@/lib/client/api";
import { useAutomations, useConfig } from "@/lib/client/hooks";
import { DAYS, TIMEZONES } from "@/lib/shared/constants";
import { cn, fmtNum } from "@/lib/shared/utils";
import type { AutomationRule, BusinessHours, DayKey } from "@/lib/shared/types";
import { MiniChat } from "./chat-preview";
import { DEFAULT_AWAY, DEFAULT_WELCOME, PRIORITY_VALUE, describeHours, isOpenNow, nowInZone } from "./rule-utils";

function hoursBetween(open: string, close: string) {
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const mins = ch * 60 + cm - (oh * 60 + om);
  if (!Number.isFinite(mins) || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}${m ? `.${Math.round((m / 60) * 10)}` : ""} h open`;
}

const sameHours = (a: BusinessHours, b: BusinessHours) => JSON.stringify(a) === JSON.stringify(b);

/* ───────── business hours ───────── */

function BusinessHoursCard({ canEdit }: { canEdit: boolean }) {
  const { data: cfg } = useConfig();
  const saved = cfg?.workspace.settings.business_hours;
  const [draft, setDraft] = React.useState<BusinessHours | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [, tick] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!saved) {
    return (
      <Card>
        <Skeleton className="mb-6 h-5 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const value = draft ?? saved;
  const dirty = !!draft && !sameHours(draft, saved);
  const update = (next: BusinessHours) => setDraft(next);
  const setDay = (k: DayKey, p: Partial<BusinessHours["days"][DayKey]>) => update({ ...value, days: { ...value.days, [k]: { ...value.days[k], ...p } } });

  const invalid = (k: DayKey) => {
    const d = value.days[k];
    return d.enabled && (!d.open || !d.close || d.close <= d.open);
  };
  const anyInvalid = DAYS.some((d) => invalid(d.key));
  const open = isOpenNow(value);
  const tzOptions = (TIMEZONES.includes(value.timezone) ? TIMEZONES : [value.timezone, ...TIMEZONES]).map((z) => ({ value: z, label: z.replace(/_/g, " ") }));

  const copyMonday = () => {
    const mon = value.days.mon;
    const days = { ...value.days };
    for (const k of ["tue", "wed", "thu", "fri"] as DayKey[]) days[k] = { ...mon };
    update({ ...value, days });
    toast.success("Monday's hours copied to Tuesday through Friday");
  };

  const save = async () => {
    setSaving(true);
    try {
      await patch("/api/workspace", { settings: { business_hours: value } });
      await refresh("/api/config");
      setDraft(null);
      toast.success("Business hours saved");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Business hours"
        description="Decides when the away message is sent and when your team is considered available."
        action={
          <label className="flex items-center gap-2.5 text-sm text-ink-2">
            <span className="hidden sm:inline">{value.enabled ? "On" : "Off"}</span>
            <Switch checked={value.enabled} onCheckedChange={(enabled) => update({ ...value, enabled })} aria-label="Use business hours" />
          </label>
        }
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="w-full max-w-xs">
            <label htmlFor="tz" className="mb-1.5 block text-[13px] font-medium text-ink-2">
              Timezone
            </label>
            <Select id="tz" value={value.timezone} onValueChange={(timezone) => update({ ...value, timezone })} options={tzOptions} />
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-ink-3 sm:pb-2.5">
            <Clock size={16} className="shrink-0" />
            <span className="tabular whitespace-nowrap">It&apos;s {nowInZone(value.timezone)} there</span>
            {value.enabled ? (
              <Badge tone={open ? "accent" : "warn"} dot>
                {open ? "Open now" : "Closed now"}
              </Badge>
            ) : (
              <Badge tone="neutral">Off, so always open</Badge>
            )}
          </p>
        </div>

        <ul className="divide-y divide-line rounded-2xl hairline">
          {DAYS.map((d) => {
            const day = value.days[d.key];
            const bad = invalid(d.key);
            return (
              <li key={d.key} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
                <label className="flex w-36 items-center gap-3 text-sm font-medium">
                  <Switch checked={day.enabled} onCheckedChange={(enabled) => setDay(d.key, { enabled })} aria-label={`${d.label} is a working day`} />
                  <span className={cn(!day.enabled && "text-ink-3")}>{d.label}</span>
                </label>
                {day.enabled ? (
                  <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-2.5">
                    <Input type="time" value={day.open} onChange={(e) => setDay(d.key, { open: e.target.value })} aria-label={`${d.label} opens`} invalid={bad} className="min-w-0 flex-1 sm:w-[132px] sm:flex-none [&_input]:px-2.5 sm:[&_input]:px-3.5 max-sm:[&_input::-webkit-calendar-picker-indicator]:hidden" />
                    <span className="text-sm text-ink-3">to</span>
                    <Input type="time" value={day.close} onChange={(e) => setDay(d.key, { close: e.target.value })} aria-label={`${d.label} closes`} invalid={bad} className="min-w-0 flex-1 sm:w-[132px] sm:flex-none [&_input]:px-2.5 sm:[&_input]:px-3.5 max-sm:[&_input::-webkit-calendar-picker-indicator]:hidden" />
                  </div>
                ) : (
                  <span className="text-sm text-ink-4">Closed</span>
                )}
                {day.enabled && !bad && <span className="tabular ml-auto hidden text-xs text-ink-4 sm:inline">{hoursBetween(day.open, day.close)}</span>}
                {bad && <p className="basis-full text-xs text-danger sm:ml-[164px] sm:basis-auto">Closing time must be after opening time.</p>}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" leading={<Copy size={14} />} onClick={copyMonday} disabled={!canEdit || !value.days.mon.enabled}>
            Copy Monday to weekdays
          </Button>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Discard
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty || anyInvalid || !canEdit}>
              Save hours
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ───────── welcome / away ───────── */

type Kind = "first_message" | "outside_hours";

function GreetingCard({ kind, rules, canUseBusinessHours }: { kind: Kind; rules: AutomationRule[]; canUseBusinessHours: boolean }) {
  const { data: cfg } = useConfig();
  const rule = rules.find((r) => r.trigger.type === kind && r.enabled) ?? rules.find((r) => r.trigger.type === kind);
  const isWelcome = kind === "first_message";
  const Icon = isWelcome ? HandWaving : Moon;
  const title = isWelcome ? "Welcome message" : "Away message";
  const description = isWelcome ? "Sent the first time a new contact writes in." : "Sent when someone writes outside your business hours.";

  const textIdx = rule ? rule.actions.findIndex((a) => a.type === "send_text") : -1;
  const savedText = rule && textIdx >= 0 ? (rule.actions[textIdx] as { body: string }).body : "";
  const [draft, setDraft] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const text = draft ?? savedText;
  const dirty = draft !== null && draft !== savedText;

  const setUp = async () => {
    if (!cfg) return;
    setBusy(true);
    try {
      const body = isWelcome ? DEFAULT_WELCOME(cfg.workspace.name) : DEFAULT_AWAY(describeHours(cfg.workspace.settings.business_hours));
      await post("/api/automations", {
        name: isWelcome ? "Welcome new chats" : "Away message",
        enabled: true,
        priority: PRIORITY_VALUE.normal,
        trigger: { type: kind },
        actions: [{ type: "send_text", body }],
      });
      await refresh("/api/automations");
      toast.success(`${title} is on`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (enabled: boolean) => {
    if (!rule) return;
    try {
      await patch(`/api/automations/${rule.id}`, { enabled });
      await refresh("/api/automations");
    } catch (e) {
      toastError(e);
    }
  };

  const saveText = async () => {
    if (!rule || textIdx < 0) return;
    if (!text.trim()) {
      toast.error("Write the message to send.");
      return;
    }
    setBusy(true);
    try {
      const actions = rule.actions.map((a, i) => (i === textIdx ? { ...a, body: text.trim() } : a));
      await patch(`/api/automations/${rule.id}`, { actions });
      await refresh("/api/automations");
      setDraft(null);
      toast.success(`${title} saved`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="h-full" coreClassName="flex h-full flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl transition-colors", rule?.enabled ? "bg-accent-soft text-accent-ink" : "bg-ink/[0.06] text-ink-3")}>
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium tracking-tight">{title}</h3>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{description}</p>
          </div>
        </div>
        {rule && <Switch checked={rule.enabled} onCheckedChange={toggle} aria-label={`${title} is ${rule.enabled ? "on" : "off"}`} />}
      </div>

      {!rule ? (
        <div className="mt-auto flex flex-col items-start gap-3 rounded-2xl bg-surface-2 p-4 hairline">
          <p className="text-[13px] leading-relaxed text-ink-3">
            {isWelcome ? "Not set up yet. We'll add a friendly greeting you can edit." : "Not set up yet. We'll add a short message that mentions your working hours."}
          </p>
          <Button variant="secondary" size="sm" loading={busy} onClick={setUp} disabled={!cfg}>
            Set up
          </Button>
        </div>
      ) : textIdx < 0 ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-surface-2 p-4 text-[13px] leading-relaxed text-ink-3 hairline">
            This rule replies with buttons or a template, so it can&apos;t be edited here. Open it in Auto-replies to change it.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <Textarea value={text} onChange={(e) => setDraft(e.target.value)} rows={4} maxLength={1024} aria-label={`${title} text`} placeholder="Write the message…" />
          <MiniChat incoming={isWelcome ? "Hi, I have a question" : "Hello, is anyone there?"} reply={text} />
          <div className="flex items-center justify-between gap-3">
            <p className="tabular text-xs text-ink-3">
              {fmtNum(rule.triggered_count)} sent{isWelcome ? "" : " · at most once every 12 hours per chat"}
            </p>
            <div className="flex items-center gap-2">
              {dirty && (
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Discard
                </Button>
              )}
              <Button size="sm" onClick={saveText} loading={busy} disabled={!dirty}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isWelcome && rule && !canUseBusinessHours && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
          <Warning size={14} className="mt-0.5 shrink-0" weight="fill" />
          Business hours are off, so the away message won&apos;t be sent. Turn them on above.
        </p>
      )}
    </Card>
  );
}

export function HoursTab() {
  const { data: cfg } = useConfig();
  const { data: rules } = useAutomations();
  const canEdit = cfg ? cfg.user.role !== "agent" : true;
  const hoursOn = !!cfg?.workspace.settings.business_hours.enabled;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">Only owners and admins can change business hours.</p>
      )}
      <BusinessHoursCard canEdit={canEdit} />
      {!rules ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-[26px]" />
          <Skeleton className="h-72 w-full rounded-[26px]" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <GreetingCard kind="first_message" rules={rules} canUseBusinessHours={hoursOn} />
          <GreetingCard kind="outside_hours" rules={rules} canUseBusinessHours={hoursOn} />
        </div>
      )}
    </div>
  );
}
