"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MotionConfig, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CheckCircle, CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, Skeleton } from "@/components/ui/display";
import { api, patch, post, refresh, toastError } from "@/lib/client/api";
import { useApi, useConfig, useSegments, useTemplate, type CampaignDetailData } from "@/lib/client/hooks";
import { templateSlots } from "@/lib/shared/template";
import { format } from "date-fns";
import type { AudienceSpec, Campaign, Contact, Template, VarSource } from "@/lib/shared/types";
import { ButtonLink } from "../button-link";
import { useAudienceStats, useNowMs } from "../hooks";
import { SAMPLE_CONTACT, audienceReady, defaultVariableMap, previewValues, slotComplete } from "../lib";
import { LivePreview } from "./live-preview";
import { HorizontalStepper, VerticalStepper } from "./stepper";
import { StepAudience } from "./step-audience";
import { StepDetails } from "./step-details";
import { StepMessage } from "./step-message";
import { StepReview } from "./step-review";
import { StepSchedule } from "./step-schedule";
import { STEPS, stepIndex, type DraftState, type SendMode } from "./types";

type Params = { get(name: string): string | null };

function initialDraft(sp: Params): DraftState {
  const segment = sp.get("segment");
  const tags = (sp.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const contacts = (sp.get("contacts") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 100);
  let audience: AudienceSpec = { mode: "all" };
  if (contacts.length) audience = { mode: "contacts", contact_ids: contacts };
  else if (segment) audience = { mode: "segment", segment_id: segment };
  else if (tags.length) audience = { mode: "tags", tags, tag_match: "any" };
  return {
    name: `Campaign · ${format(new Date(), "d MMM")}`,
    template_id: sp.get("template"),
    audience,
    variable_map: {},
    media_map: {},
    scheduled_at: null,
    throttle_per_min: 600,
  };
}

const payload = (d: DraftState, mode: SendMode) => ({
  name: d.name.trim() || "Untitled campaign",
  template_id: d.template_id,
  audience: d.audience,
  variable_map: d.variable_map,
  media_map: d.media_map,
  scheduled_at: mode === "schedule" ? d.scheduled_at : null,
  throttle_per_min: d.throttle_per_min,
});

export function CampaignWizard() {
  return (
    <React.Suspense fallback={<WizardSkeleton />}>
      <Wizard />
    </React.Suspense>
  );
}

function WizardSkeleton({ header = true }: { header?: boolean }) {
  return (
    <div>
      {header && (
        <div className="mb-7 space-y-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-10 w-64" />
        </div>
      )}
      <Skeleton className="mb-6 h-10 w-full max-w-lg rounded-full" />
      <div className="grid gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[480px] rounded-[26px]" />
        <Skeleton className="hidden h-[600px] rounded-[26px] min-[1180px]:block" />
      </div>
    </div>
  );
}

function Wizard() {
  const router = useRouter();
  const sp = useSearchParams();
  const draftParam = sp.get("draft");
  const { data: cfg } = useConfig();
  const { data: segments } = useSegments();
  const tz = cfg?.workspace.settings.business_hours.timezone ?? "Asia/Kolkata";

  const [draft, setDraft] = React.useState<DraftState>(() => initialDraft(sp));
  const [id, setId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(!!draftParam);
  const [step, setStep] = React.useState(() => (draftParam ? stepIndex(sp.get("step")) : 0));
  const [reached, setReached] = React.useState(() => (draftParam ? stepIndex(sp.get("step")) : 0));
  const [sendMode, setSendMode] = React.useState<SendMode>("now");
  const [saving, setSaving] = React.useState(false);
  const [launching, setLaunching] = React.useState(false);
  const [picked, setPicked] = React.useState<Template | null>(null);
  const [retarget, setRetarget] = React.useState<AudienceSpec | null>(null);

  const now = useNowMs();
  const dirty = React.useRef(false);
  const hydrated = React.useRef<string | null>(null);

  /* ───── load an existing draft ───── */
  React.useEffect(() => {
    if (!draftParam || hydrated.current === draftParam) return;
    let off = false;
    api<CampaignDetailData>(`/api/campaigns/${draftParam}`)
      .then(({ campaign: c }) => {
        if (off) return;
        if (c.status !== "draft") {
          router.replace(`/campaigns/${c.id}`);
          return;
        }
        hydrated.current = c.id;
        setId(c.id);
        setDraft({
          name: c.name,
          template_id: c.template_id,
          audience: c.audience,
          variable_map: c.variable_map ?? {},
          media_map: c.media_map ?? {},
          scheduled_at: c.scheduled_at,
          throttle_per_min: c.throttle_per_min,
        });
        if (c.scheduled_at) setSendMode("schedule");
        if (c.audience.mode === "retarget") setRetarget(c.audience);
        setReached((r) => Math.max(r, c.template_id ? STEPS.length - 1 : 2));
        setLoading(false);
      })
      .catch((e) => {
        if (off) return;
        toastError(e);
        router.replace("/campaigns/new");
        setLoading(false);
      });
    return () => {
      off = true;
    };
  }, [draftParam, router]);

  /* ───── template + audience data ───── */
  const { data: fetchedTemplate, isLoading: tplFetching } = useTemplate(draft.template_id);
  const template: Template | undefined =
    picked && picked.id === draft.template_id ? picked : fetchedTemplate && fetchedTemplate.id === draft.template_id ? fetchedTemplate : undefined;
  const templateLoading = !!draft.template_id && !template && tplFetching;
  const slots = React.useMemo(() => (template ? templateSlots(template.content) : []), [template]);

  const stats = useAudienceStats(draft.audience, !loading);
  const firstSample = stats.data?.sample[0]?.id ?? null;
  const { data: sampleContact } = useApi<{ contact: Contact }>(firstSample ? `/api/contacts/${firstSample}` : null);
  const previewContact = sampleContact?.contact && sampleContact.contact.id === firstSample ? sampleContact.contact : null;

  const values = React.useMemo(() => previewValues(slots, draft, previewContact ?? SAMPLE_CONTACT), [slots, draft, previewContact]);
  const preview = {
    content: template?.content ?? null,
    values,
    contactName: previewContact ? (previewContact.name ?? previewContact.phone) : SAMPLE_CONTACT.name,
    sampleIsReal: !!previewContact,
    businessName: cfg?.account?.verified_name ?? cfg?.workspace.name ?? "Your business",
  };

  /* ───── draft updates ───── */
  const update = React.useCallback((p: Partial<DraftState>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...p }));
  }, []);

  // fill in sensible defaults for any variable that has no mapping yet (prefilled template, follow-ups, new picks)
  React.useEffect(() => {
    if (!template || draft.template_id !== template.id) return;
    const missing = slots.filter((s) => s.kind !== "media" && !draft.variable_map[s.key]);
    if (!missing.length) return;
    const defaults = defaultVariableMap(template.content);
    update({ variable_map: { ...draft.variable_map, ...Object.fromEntries(missing.map((s) => [s.key, defaults[s.key]])) } });
  }, [template, slots, draft.template_id, draft.variable_map, update]);

  const pickTemplate = (t: Template) => {
    setPicked(t);
    update({ template_id: t.id, variable_map: defaultVariableMap(t.content), media_map: {} });
  };

  const setSource = (key: string, src: VarSource) => update({ variable_map: { ...draft.variable_map, [key]: src } });
  const setMedia = (key: string, url: string | null) => {
    const next = { ...draft.media_map };
    if (url) next[key] = url;
    else delete next[key];
    update({ media_map: next });
  };
  const changeSendMode = (m: SendMode) => {
    dirty.current = true;
    setSendMode(m);
    if (m === "now") setDraft((d) => ({ ...d, scheduled_at: null }));
  };

  /* ───── persistence ───── */
  const persist = async (): Promise<string | null> => {
    setSaving(true);
    try {
      const body = payload(draft, sendMode);
      if (!id) {
        const c = await post<Campaign>("/api/campaigns", body);
        hydrated.current = c.id;
        dirty.current = false;
        setId(c.id);
        refresh("/api/campaigns");
        return c.id;
      }
      if (dirty.current) {
        await patch(`/api/campaigns/${id}`, body);
        dirty.current = false;
        refresh("/api/campaigns");
      }
      return id;
    } catch (e) {
      toastError(e);
      return null;
    } finally {
      setSaving(false);
    }
  };

  /* ───── validation per step ───── */
  const blocked: string | null = (() => {
    switch (STEPS[step].id) {
      case "details":
        return draft.name.trim() ? null : "Give your campaign a name to continue.";
      case "audience": {
        const a = draft.audience;
        if (!audienceReady(a)) return a.mode === "segment" ? "Choose a segment to continue." : a.mode === "tags" ? "Add at least one tag to continue." : "Choose an audience to continue.";
        if (!stats.data || stats.loading) return "Counting your audience…";
        if (stats.error) return "We couldn’t count this audience. Try again.";
        if (stats.data.eligible === 0) return "No eligible contacts yet. Adjust the audience to continue.";
        return null;
      }
      case "message": {
        if (!draft.template_id) return "Choose a template to continue.";
        if (!template) return "Loading the template…";
        if (template.status !== "APPROVED") return "Choose an approved template to continue.";
        const open = slots.find((s) => !slotComplete(s, draft));
        return open ? `Fill in “${open.label}” to continue.` : null;
      }
      case "schedule":
        if (sendMode === "schedule") {
          if (!draft.scheduled_at) return "Choose a date and time to continue.";
          if (Date.parse(draft.scheduled_at) <= now) return "Choose a time in the future to continue.";
        }
        return null;
      default:
        return null;
    }
  })();

  /* ───── navigation ───── */
  const topRef = React.useRef<HTMLDivElement>(null);

  const moveTo = async (i: number) => {
    const cid = await persist();
    if (!cid) return;
    setStep(i);
    setReached((r) => Math.max(r, i));
    router.replace(`/campaigns/new?draft=${cid}&step=${STEPS[i].id}`, { scroll: false });
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const goStep = (i: number) => {
    if (i === step || i > reached || saving) return;
    if (i > step && blocked) {
      toast(blocked.replace(" to continue.", ".").replace("…", ""), { description: "Finish this step before jumping ahead." });
      return;
    }
    void moveTo(i);
  };
  const next = () => {
    if (blocked || saving || step >= STEPS.length - 1) return;
    void moveTo(step + 1);
  };
  const back = () => {
    if (step > 0 && !saving) void moveTo(step - 1);
  };

  const launch = async () => {
    setLaunching(true);
    try {
      const cid = await persist();
      if (!cid) {
        setLaunching(false);
        return;
      }
      await post(`/api/campaigns/${cid}/launch`, { when: sendMode === "now" ? "now" : "schedule" });
      await refresh("/api/campaigns", "/api/dashboard");
      router.push(`/campaigns/${cid}`);
    } catch (e) {
      toastError(e);
      setLaunching(false);
    }
  };

  const current = STEPS[step];

  return (
    <MotionConfig reducedMotion="user">
      <div ref={topRef} className="scroll-mt-4" />
      <PageHeader
        back={
          <ButtonLink href="/campaigns" variant="ghost" size="sm" leading={<ArrowLeft size={14} />} className="-ml-3">
            Campaigns
          </ButtonLink>
        }
        title="New campaign"
        description="Five short steps. Your progress is saved as a draft along the way."
        actions={
          id ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-3" aria-live="polite">
              {saving ? <CircleNotch size={14} className="animate-spin" /> : <CheckCircle size={14} weight="fill" className="text-accent" />}
              {saving ? "Saving…" : "Draft saved"}
            </span>
          ) : undefined
        }
      />

      {loading ? (
        <WizardSkeleton header={false} />
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            Step {step + 1} of {STEPS.length}: {current.label}
          </p>
          <HorizontalStepper step={step} reached={reached} onGo={goStep} />
          <div className="grid items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_300px] min-[1400px]:grid-cols-[148px_minmax(0,1fr)_320px] min-[1400px]:gap-8">
            <VerticalStepper step={step} reached={reached} onGo={goStep} />

            <Card className="min-w-0" coreClassName="p-5 sm:p-8">
              <motion.div key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}>
                {current.id === "details" && <StepDetails name={draft.name} onName={(name) => update({ name })} onEnter={next} />}
                {current.id === "audience" && <StepAudience audience={draft.audience} onChange={(audience) => update({ audience })} stats={stats} retarget={retarget} />}
                {current.id === "message" && (
                  <StepMessage
                    templateId={draft.template_id}
                    template={template}
                    templateLoading={templateLoading}
                    mapping={draft}
                    onPick={pickTemplate}
                    onSource={setSource}
                    onMedia={setMedia}
                    preview={preview}
                  />
                )}
                {current.id === "schedule" && (
                  <StepSchedule
                    sendMode={sendMode}
                    onSendMode={changeSendMode}
                    scheduledAt={draft.scheduled_at}
                    onScheduledAt={(iso) => update({ scheduled_at: iso })}
                    tz={tz}
                    throttle={draft.throttle_per_min}
                    onThrottle={(v) => update({ throttle_per_min: v })}
                    eligible={stats.data?.eligible ?? null}
                  />
                )}
                {current.id === "review" && id && (
                  <StepReview
                    campaignId={id}
                    draft={draft}
                    template={template}
                    segments={segments}
                    sendMode={sendMode}
                    tz={tz}
                    onEdit={goStep}
                    onBack={back}
                    onLaunch={launch}
                    launching={launching}
                    preview={preview}
                  />
                )}
              </motion.div>

              {current.id !== "review" && (
                <div className="mt-9 border-t border-line pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="ghost" leading={<ArrowLeft size={16} />} disabled={step === 0 || saving} onClick={back}>
                      Back
                    </Button>
                    <Button loading={saving} disabled={!!blocked} onClick={next} trailing={<ArrowRight size={14} />}>
                      Continue
                    </Button>
                  </div>
                  {blocked && (
                    <p className="mt-3 text-right text-xs text-ink-3" aria-live="polite">
                      {blocked}
                    </p>
                  )}
                </div>
              )}
            </Card>

            <aside className="hidden min-[1180px]:block" aria-label="Message preview">
              <div className="sticky top-6">
                <LivePreview {...preview} />
              </div>
            </aside>
          </div>
        </>
      )}
    </MotionConfig>
  );
}
