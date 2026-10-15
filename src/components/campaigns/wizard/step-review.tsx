"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ArrowsClockwise, CheckCircle, PaperPlaneTilt, Phone, Warning, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Inset, Skeleton } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/input";
import { CategoryBadge } from "@/components/status";
import { useConfirm } from "@/components/confirm";
import { errorMessage, post } from "@/lib/client/api";
import { useConfig } from "@/lib/client/hooks";
import { cn, fmtMoney, fmtNum, pluralize } from "@/lib/shared/utils";
import type { Segment, Template } from "@/lib/shared/types";
import { audienceRefinements, audienceSummary, duration, fmtZoned, speedText } from "../lib";
import { PreviewButton, type PreviewProps } from "./live-preview";
import { SectionTitle, StepHeader } from "./step-shell";
import type { DraftState, SendMode } from "./types";

export interface CheckResult {
  ok: boolean;
  issues: { level: "ok" | "warning" | "error"; message: string }[];
  audience: { eligible: number; opted_out: number; pending: number };
  cost: number;
  currency: string;
}

const ICON = {
  ok: { Ico: CheckCircle, cls: "text-accent", label: "Passed" },
  warning: { Ico: Warning, cls: "text-warn", label: "Warning" },
  error: { Ico: XCircle, cls: "text-danger", label: "Needs fixing" },
} as const;

export function StepReview({
  campaignId,
  draft,
  template,
  segments,
  sendMode,
  tz,
  onEdit,
  onBack,
  onLaunch,
  launching,
  preview,
}: {
  campaignId: string;
  draft: DraftState;
  template: Template | undefined;
  segments: Segment[] | undefined;
  sendMode: SendMode;
  tz: string;
  onEdit: (stepIndex: number) => void;
  onBack: () => void;
  onLaunch: () => Promise<void>;
  launching: boolean;
  preview: PreviewProps;
}) {
  const confirm = useConfirm();
  const { data: cfg } = useConfig();
  const [check, setCheck] = React.useState<CheckResult | null>(null);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const [phone, setPhone] = React.useState("");
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    let off = false;
    setCheck(null);
    setCheckError(null);
    post<CheckResult>(`/api/campaigns/${campaignId}/check`)
      .then((r) => !off && setCheck(r))
      .catch((e) => !off && setCheckError(errorMessage(e)));
    return () => {
      off = true;
    };
  }, [campaignId, nonce]);

  const mock = cfg?.providerMode === "mock";
  const speed = speedText(draft.throttle_per_min);
  const eligible = check?.audience.eligible ?? null;
  const errors = check?.issues.filter((i) => i.level === "error").length ?? 0;
  const warnings = check?.issues.filter((i) => i.level === "warning").length ?? 0;
  const refinements = audienceRefinements(draft.audience);

  const sendTest = async () => {
    if (!draft.template_id) return;
    setTesting(true);
    try {
      const r = await post<{ id: string; mode: "mock" | "live" }>("/api/campaigns/test", {
        template_id: draft.template_id,
        phone,
        variable_map: draft.variable_map,
        media_map: draft.media_map,
      });
      toast.success(r.mode === "mock" ? "Test message simulated" : "Test message sent", {
        description: r.mode === "mock" ? "Demo mode: it appears in your inbox, nothing reached WhatsApp." : "It should reach that phone in a few seconds.",
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  const launch = async () => {
    if (!check) return;
    const n = check.audience.eligible;
    const ok = await confirm({
      title: sendMode === "now" ? `Send to ${pluralize(n, "contact")}?` : `Schedule for ${pluralize(n, "contact")}?`,
      description:
        sendMode === "now"
          ? `“${draft.name}” starts sending right away, ${duration(n, draft.throttle_per_min)} at ${speed.split(" · ")[0].toLowerCase()} speed. You can pause or cancel from the campaign page.`
          : `“${draft.name}” goes out ${draft.scheduled_at ? fmtZoned(draft.scheduled_at, tz) : "at the time you chose"}. Until then you can unschedule it.`,
      confirmLabel: sendMode === "now" ? "Send now" : "Schedule campaign",
      tone: "primary",
    });
    if (ok) await onLaunch();
  };

  return (
    <div>
      <StepHeader
        title="Review and send"
        description="One last look. Fix anything marked below, then send."
        action={<PreviewButton {...preview} />}
      />

      {/* summary */}
      <dl className="divide-y divide-line rounded-2xl bg-surface-2/60 px-4 hairline">
        <SummaryRow label="Campaign" onEdit={() => onEdit(0)}>
          {draft.name || "Untitled"}
        </SummaryRow>
        <SummaryRow label="Template" onEdit={() => onEdit(2)}>
          {template ? (
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span className="font-mono text-[13px]">{template.name}</span>
              <CategoryBadge category={template.category} />
            </span>
          ) : (
            <span className="text-danger">None chosen</span>
          )}
        </SummaryRow>
        <SummaryRow label="Audience" onEdit={() => onEdit(1)}>
          <span className="block">{audienceSummary(draft.audience, segments)}</span>
          <span className="tabular block text-[13px] font-normal text-ink-3">
            {eligible === null ? "Counting…" : pluralize(eligible, "contact")}
            {refinements.length > 0 && ` · ${refinements.join(" · ")}`}
          </span>
        </SummaryRow>
        <SummaryRow label="When" onEdit={() => onEdit(3)}>
          {sendMode === "now" ? "Right away" : draft.scheduled_at ? fmtZoned(draft.scheduled_at, tz) : <span className="text-danger">No time chosen</span>}
        </SummaryRow>
        <SummaryRow label="Speed" onEdit={() => onEdit(3)}>
          <span className="block">{speed}</span>
          {eligible ? <span className="block text-[13px] font-normal text-ink-3">Takes {duration(eligible, draft.throttle_per_min)}</span> : null}
        </SummaryRow>
      </dl>

      {/* pre-flight */}
      <div className="mt-8">
        <div className="mb-3 flex items-start justify-between gap-3">
          <SectionTitle
            title="Pre-flight checks"
            description={
              check === null
                ? "Checking your campaign…"
                : errors
                  ? `${errors} ${errors === 1 ? "thing" : "things"} to fix before you can send`
                  : warnings
                    ? "Ready to send, with a few things worth a look"
                    : "Everything looks good"
            }
          />
          <Button variant="ghost" size="xs" leading={<ArrowsClockwise size={13} />} onClick={() => setNonce((n) => n + 1)} aria-label="Run checks again">
            Re-check
          </Button>
        </div>
        <div aria-live="polite" aria-busy={check === null && !checkError}>
          {checkError ? (
            <p className="rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] text-danger">Couldn’t run the checks: {checkError}</p>
          ) : check === null ? (
            <div className="space-y-2.5">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-4/5" />
            </div>
          ) : (
            <ul className="space-y-2.5">
              {[...check.issues]
                .sort((a, b) => ({ error: 0, warning: 1, ok: 2 })[a.level] - { error: 0, warning: 1, ok: 2 }[b.level])
                .map((i, idx) => {
                  const { Ico, cls, label } = ICON[i.level];
                  return (
                    <li key={idx} className="flex items-start gap-2.5 text-sm">
                      <Ico size={18} weight="fill" className={cn("mt-px shrink-0", cls)} />
                      <span className="min-w-0 text-ink-2">
                        <span className="sr-only">{label}: </span>
                        {i.message}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>

      {/* cost */}
      <Inset className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-[13px] text-ink-3">Estimated cost</p>
          <p className="tabular mt-1 text-2xl font-medium tracking-[-0.03em]">{check ? fmtMoney(check.cost, check.currency) : "—"}</p>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-ink-3">
          An estimate from the per-message rates in{" "}
          <Link href="/settings" className="font-medium text-ink-2 underline decoration-line-strong underline-offset-4">
            Settings
          </Link>
          . What Meta bills may differ.
        </p>
      </Inset>

      {/* test message */}
      <div className="mt-8 rounded-2xl bg-surface p-4 hairline sm:p-5">
        <SectionTitle
          title="Send a test message"
          description={
            mock
              ? "Demo mode: the test is simulated. It lands in your inbox and nothing reaches WhatsApp."
              : "Sends this template once to the number you enter, so you can see it on a real phone before the broadcast."
          }
        />
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            sendTest();
          }}
        >
          <Field label="Phone number" htmlFor="test-phone" className="sm:flex-1">
            <Input id="test-phone" type="tel" inputMode="tel" autoComplete="off" leading={<Phone size={16} />} placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={testing} disabled={phone.replace(/\D/g, "").length < 7 || !draft.template_id}>
            Send test
          </Button>
        </form>
      </div>

      {/* actions */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="ghost" leading={<ArrowLeft size={16} />} onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {errors > 0 && <span className="hidden text-xs text-ink-3 sm:inline">Fix the items marked above to continue.</span>}
          <Button
            size="lg"
            loading={launching}
            disabled={!check || !check.ok || (sendMode === "schedule" && !draft.scheduled_at)}
            onClick={launch}
            trailing={<PaperPlaneTilt size={16} weight="fill" />}
          >
            {sendMode === "now" ? "Send now" : "Schedule campaign"}
          </Button>
        </div>
      </div>
      {eligible !== null && <p className="sr-only">{fmtNum(eligible)} recipients</p>}
    </div>
  );
}

function SummaryRow({ label, children, onEdit }: { label: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-4 py-3.5 text-sm">
      <dt className="w-24 shrink-0 pt-px text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1 text-right font-medium">{children}</dd>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label.toLowerCase()}`}
        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-ink-3 outline-none transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        Edit
      </button>
    </div>
  );
}
