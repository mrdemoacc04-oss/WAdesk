"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowsClockwise, Check, Funnel, HandPointing, Tag, UsersThree, Warning } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { Avatar, Inset, Skeleton } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { useTags, useSegments, useCampaignDetail } from "@/lib/client/hooks";
import { cn, fmtNum, pluralize } from "@/lib/shared/utils";
import { formatPhone } from "@/lib/shared/phone";
import type { AudienceSpec } from "@/lib/shared/types";
import type { AudienceStatsData } from "../hooks";
import { audienceReady, retargetLabel } from "../lib";
import { SectionTitle, StepHeader } from "./step-shell";

type Mode = AudienceSpec["mode"];

interface Option {
  mode: Mode;
  title: string;
  desc: string;
  icon: Icon;
}

const BASE: Option[] = [
  { mode: "all", title: "All opted-in contacts", desc: "Everyone who has agreed to hear from you", icon: UsersThree },
  { mode: "segment", title: "A saved segment", desc: "Reuse a filter you built in Contacts", icon: Funnel },
  { mode: "tags", title: "Contacts with tags", desc: "Choose the tags to include", icon: Tag },
];

export function StepAudience({
  audience,
  onChange,
  stats,
  retarget,
}: {
  audience: AudienceSpec;
  onChange: (next: AudienceSpec) => void;
  stats: { data: AudienceStatsData | null; loading: boolean; error: string | null };
  /** the follow-up audience this draft was created with, if any */
  retarget: AudienceSpec | null;
}) {
  const { data: segments } = useSegments();
  const { data: tags } = useTags();
  const tagNames = React.useMemo(() => (tags ?? []).filter((t) => t.count > 0).map((t) => t.name), [tags]);

  const options: Option[] = [...BASE];
  if (audience.contact_ids?.length || audience.mode === "contacts")
    options.push({ mode: "contacts", title: "Hand-picked", desc: "People you selected in Contacts", icon: HandPointing });
  if (retarget || audience.mode === "retarget")
    options.push({ mode: "retarget", title: "Follow-up", desc: "From an earlier campaign", icon: ArrowsClockwise });

  const set = (patch: Partial<AudienceSpec>) => onChange({ ...audience, ...patch });

  const pick = (mode: Mode) => {
    if (mode === audience.mode) return;
    if (mode === "retarget" && retarget) return onChange({ ...retarget, exclude_tags: audience.exclude_tags, skip_recent_days: audience.skip_recent_days, include_pending: audience.include_pending });
    if (mode === "segment") return set({ mode, segment_id: audience.segment_id ?? null });
    if (mode === "tags") return set({ mode, tags: audience.tags ?? [], tag_match: audience.tag_match ?? "any" });
    set({ mode });
  };

  const skipOn = !!audience.skip_recent_days;

  return (
    <div>
      <StepHeader title="Choose your audience" description="Only contacts who have opted in can receive a broadcast. Opted-out contacts are always left out." />

      <div role="radiogroup" aria-label="Who should receive this campaign" className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const active = audience.mode === o.mode;
          const Ico = o.icon;
          return (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(o.mode)}
              className={cn(
                "relative flex items-start gap-3.5 rounded-2xl p-4 text-left outline-none transition-[box-shadow,background-color] duration-300 ease-fluid focus-visible:ring-2 focus-visible:ring-accent/60",
                active ? "bg-accent-soft/60 shadow-[inset_0_0_0_1.5px_var(--accent)]" : "bg-surface hairline hover:bg-surface-2/70",
              )}
            >
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl transition-colors", active ? "bg-accent text-white" : "bg-ink/[0.06] text-ink-2")}>
                <Ico size={20} />
              </span>
              <span className="min-w-0 pr-5">
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{o.desc}</span>
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

      {/* option-specific controls */}
      {audience.mode !== "all" && (
        <motion.div
          key={audience.mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          className="mt-4"
        >
          {audience.mode === "segment" && (
            <Field label="Segment" htmlFor="aud-segment">
              {segments && segments.length === 0 ? (
                <Inset className="text-[13px] text-ink-2">
                  You haven’t saved a segment yet.{" "}
                  <Link href="/contacts" className="font-medium text-accent-ink underline underline-offset-4">
                    Build one in Contacts
                  </Link>
                  .
                </Inset>
              ) : (
                <Select
                  id="aud-segment"
                  value={audience.segment_id ?? undefined}
                  onValueChange={(v) => set({ segment_id: v })}
                  placeholder="Choose a segment"
                  options={(segments ?? []).map((s) => ({
                    value: s.id,
                    label: s.name,
                    description: s.count !== undefined ? pluralize(s.count, "contact") : undefined,
                  }))}
                />
              )}
            </Field>
          )}

          {audience.mode === "tags" && (
            <div className="space-y-3">
              <Field label="Include contacts tagged" hint="Press Enter after each tag.">
                <TagInput
                  value={audience.tags ?? []}
                  onChange={(v) => set({ tags: v })}
                  suggestions={tagNames}
                  placeholder="Search or add a tag"
                  aria-label="Tags to include"
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Segmented
                  size="sm"
                  aria-label="Tag matching"
                  value={audience.tag_match ?? "any"}
                  onValueChange={(v) => set({ tag_match: v })}
                  options={[
                    { value: "any", label: "Any of these tags" },
                    { value: "all", label: "All of these tags" },
                  ]}
                />
              </div>
              {tagNames.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-ink-3">Popular</span>
                  {(tags ?? [])
                    .filter((t) => t.count > 0 && !(audience.tags ?? []).includes(t.name))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 7)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => set({ tags: [...(audience.tags ?? []), t.name] })}
                        className="inline-flex h-6 items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 text-xs text-ink-2 outline-none transition-colors hover:bg-ink/[0.09] focus-visible:ring-2 focus-visible:ring-accent/60"
                      >
                        {t.name}
                        <span className="tabular text-ink-4">{t.count}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {audience.mode === "contacts" && (
            <Inset className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-ink-2">
                <span className="tabular font-medium text-ink">{fmtNum(audience.contact_ids?.length ?? 0)}</span> contacts you picked in Contacts.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChange({ ...audience, mode: "all", contact_ids: [] })}
              >
                Clear selection
              </Button>
            </Inset>
          )}

          {audience.mode === "retarget" && <RetargetNote audience={audience} />}
        </motion.div>
      )}

      {/* refinements */}
      <div className="mt-8 space-y-5">
        <SectionTitle title="Fine-tune" />
        <Field label="Leave out contacts tagged" htmlFor="aud-exclude" hint="Anyone with one of these tags is skipped.">
          <TagInput
            value={audience.exclude_tags ?? []}
            onChange={(v) => set({ exclude_tags: v })}
            suggestions={tagNames}
            placeholder="e.g. do-not-disturb"
            aria-label="Tags to leave out"
          />
        </Field>

        <ToggleRow
          id="aud-recent"
          title="Skip people messaged recently"
          description="Avoids sending to someone who already heard from you this week."
          checked={skipOn}
          onCheckedChange={(on) => set({ skip_recent_days: on ? 7 : 0 })}
        >
          {skipOn && (
            <div className="mt-3 flex items-center gap-2.5 text-[13px] text-ink-2">
              <label htmlFor="aud-recent-days">Skip anyone messaged in the last</label>
              <Input
                id="aud-recent-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                className="w-20"
                value={audience.skip_recent_days ?? 7}
                onChange={(e) => set({ skip_recent_days: Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 1))) })}
              />
              <span>days</span>
            </div>
          )}
        </ToggleRow>

        <ToggleRow
          id="aud-pending"
          title="Include contacts whose consent is unconfirmed"
          description="People you added without a recorded opt-in."
          checked={!!audience.include_pending}
          onCheckedChange={(on) => set({ include_pending: on })}
        >
          {audience.include_pending && (
            <p className="mt-3 flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-warn">
              <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
              Messaging people who haven’t confirmed consent leads to blocks and reports, which can lower your quality rating and messaging limit.
            </p>
          )}
        </ToggleRow>
      </div>

      <AudienceResult audience={audience} stats={stats} />
    </div>
  );
}

/* ───────── pieces ───────── */

function ToggleRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface p-4 hairline">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={id} className="block cursor-pointer text-sm font-medium">
            {title}
          </label>
          <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      </div>
      {children}
    </div>
  );
}

function RetargetNote({ audience }: { audience: AudienceSpec }) {
  const { data } = useCampaignDetail(audience.source_campaign_id ?? null);
  return (
    <Inset className="text-[13px] leading-relaxed text-ink-2">
      People {retargetLabel(audience.retarget)} in{" "}
      {data ? (
        <Link href={`/campaigns/${data.campaign.id}`} className="font-medium text-ink underline decoration-line-strong underline-offset-4">
          {data.campaign.name}
        </Link>
      ) : (
        "an earlier campaign"
      )}
      .
    </Inset>
  );
}

function AudienceResult({
  audience,
  stats,
}: {
  audience: AudienceSpec;
  stats: { data: AudienceStatsData | null; loading: boolean; error: string | null };
}) {
  const { data, loading, error } = stats;
  const ready = audienceReady(audience);
  const hint = !ready
    ? audience.mode === "segment"
      ? "Choose a segment to see who is in it."
      : audience.mode === "tags"
        ? "Add at least one tag to see who matches."
        : "Choose who should receive this campaign."
    : null;

  return (
    <Inset className="mt-8 p-5" >
      <div aria-live="polite" aria-busy={loading}>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            {data === null ? (
              <Skeleton className="h-11 w-28" />
            ) : (
              <p className={cn("tabular text-[44px] font-medium leading-none tracking-[-0.04em] transition-opacity duration-300", loading && "opacity-50")}>{fmtNum(data.eligible)}</p>
            )}
            <p className="mt-2 text-sm text-ink-2">{data?.eligible === 1 ? "contact will receive this" : "contacts will receive this"}</p>
          </div>
          {data && (data.opted_out > 0 || data.pending > 0) && (
            <ul className="space-y-1 text-[13px] text-ink-3">
              {data.opted_out > 0 && (
                <li>
                  <span className="tabular font-medium text-ink-2">{fmtNum(data.opted_out)}</span> opted out, left out automatically
                </li>
              )}
              {data.pending > 0 && (
                <li>
                  <span className="tabular font-medium text-ink-2">{fmtNum(data.pending)}</span> with unconfirmed consent, left out
                </li>
              )}
            </ul>
          )}
        </div>

        {hint && <p className="mt-4 text-[13px] text-ink-3">{hint}</p>}
        {error && !loading && <p className="mt-4 text-[13px] text-danger">Couldn’t count this audience: {error}</p>}
        {ready && data && data.eligible === 0 && !loading && (
          <p className="mt-4 flex items-start gap-2 text-[13px] text-warn">
            <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
            Nobody matches yet. Change the audience or the filters above to continue.
          </p>
        )}

        {data && data.sample.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2.5 text-xs text-ink-3">A few of the people in this audience</p>
            <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {data.sample.map((p) => (
                <li key={p.id} className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={p.name ?? p.phone} size={28} />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[13px] font-medium">{p.name || "Unnamed contact"}</span>
                    <span className="block truncate font-mono text-xs text-ink-3">{formatPhone(p.phone)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Inset>
  );
}
