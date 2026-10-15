"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate as swrMutate } from "swr";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, Copy, Lock, Notepad, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/display";
import { Segmented } from "@/components/ui/controls";
import { useConfirm } from "@/components/confirm";
import { CategoryBadge } from "@/components/status";
import { ApiError, errorMessage, patch, post, refresh, toastError } from "@/lib/client/api";
import { useApi, useConfig, useTemplates } from "@/lib/client/hooks";
import { TEMPLATE_LANGUAGES } from "@/lib/shared/constants";
import type { Issue } from "@/lib/shared/template";
import type { Template, TemplateCategory, TemplateHeader } from "@/lib/shared/types";
import { cn } from "@/lib/shared/utils";
import { ActionBar } from "./action-bar";
import { CarouselEditor } from "./carousel-editor";
import { IssueProvider } from "./issues";
import {
  blankCard,
  blankDraft,
  cardIndexOf,
  collectIssues,
  errorsOf,
  formatOf,
  fromTemplate,
  isPristine,
  sectionOf,
  snapshot,
  toContent,
  warningsOf,
  type Draft,
  type EButton,
  type ECard,
  type EContent,
  type Format,
} from "./model";
import { PRESETS, type Preset } from "./presets";
import { PreviewPanel } from "./preview-panel";
import { BasicsSection, ButtonsSection, FormatSection, MessageSection } from "./sections";
import { LiveStatusBadge } from "./status-live";

const EDITABLE = ["DRAFT", "REJECTED"];

/** /templates/new (no id) and /templates/[id]. */
export function TemplateBuilder({ id }: { id?: string }) {
  const { data: tpl, error } = useApi<Template>(id ? `/api/templates/${id}` : null, { refreshInterval: (d) => (d?.status === "PENDING" ? 4000 : 0) });

  if (id && !tpl && error) {
    return (
      <EmptyState
        icon={<Notepad />}
        title="Template not found"
        description="It may have been deleted. Head back to your templates to pick another."
        action={
          <Link href="/templates" className={buttonVariants({ variant: "secondary" })}>
            All templates
          </Link>
        }
      />
    );
  }
  if (id && (!tpl || tpl.id !== id)) return <BuilderSkeleton />;
  return <BuilderForm key={tpl?.id ?? "new"} live={tpl} />;
}

function BuilderSkeleton() {
  return (
    <div>
      <Skeleton className="mb-3 h-8 w-28 rounded-full" />
      <Skeleton className="mb-8 h-9 w-64" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-8 2xl:gap-10">
        <div className="flex flex-col gap-5">
          {["h-44", "h-28", "h-64"].map((h, i) => (
            <Card key={i}>
              <Skeleton className="mb-5 h-5 w-32" />
              <Skeleton className={cn("w-full", h)} />
            </Card>
          ))}
        </div>
        <Skeleton className="hidden h-[640px] rounded-[26px] xl:block" />
      </div>
    </div>
  );
}

type Stash = { headers: Partial<Record<Format, TemplateHeader | null>>; cards?: ECard[]; std?: { footer: string | null | undefined; buttons: EButton[] } };

function BuilderForm({ live }: { live?: Template }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { data: cfg } = useConfig();
  const { data: all } = useTemplates();
  const optout = `Reply ${(cfg?.workspace.settings.compliance.optout_keywords[0] ?? "stop").toUpperCase()} to opt out`;

  const [draft, setDraft] = React.useState<Draft>(() => (live ? fromTemplate(live) : blankDraft()));
  const [savedId, setSavedId] = React.useState<string | null>(live?.id ?? null);
  const [savedSnap, setSavedSnap] = React.useState(() => snapshot(live ? fromTemplate(live) : blankDraft()));
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [activeCard, setActiveCard] = React.useState(0);
  const [saving, setSaving] = React.useState<null | "draft" | "submit">(null);
  const [serverName, setServerName] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"edit" | "preview">("edit");
  const [duplicating, setDuplicating] = React.useState(false);
  const stash = React.useRef<Stash>({ headers: {} });

  const status = live?.status ?? "DRAFT";
  const readOnly = !!live && !EDITABLE.includes(status);
  const format = formatOf(draft.content);
  const carousel = format === "CAROUSEL";

  /* ───── derived ───── */
  const langName = TEMPLATE_LANGUAGES.find((l) => l.code === draft.language)?.name ?? draft.language;
  const taken = !!draft.name && (all ?? []).some((t) => t.name === draft.name && t.language === draft.language && t.id !== savedId);
  const issues = React.useMemo(() => collectIssues(draft, { optout, taken, takenLanguage: langName }), [draft, optout, taken, langName]);
  const errors = errorsOf(issues);
  const warnings = warningsOf(issues);
  const snap = React.useMemo(() => snapshot(draft), [draft]);
  const dirty = !readOnly && snap !== savedSnap;
  const previewContent = React.useMemo(() => toContent(draft.content), [draft.content]);
  const showPresets = !live && !savedId && isPristine({ ...draft, name: "" });

  const touch = React.useCallback((paths: string[]) => {
    setTouched((prev) => {
      if (paths.every((p) => prev.has(p))) return prev;
      const next = new Set(prev);
      paths.forEach((p) => next.add(p));
      return next;
    });
  }, []);

  /* ───── edits ───── */
  const patchDraft = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const patchContent = (fn: (c: EContent) => EContent) => setDraft((d) => ({ ...d, content: fn(d.content) }));

  const changeFormat = (next: Format) => {
    const cur = formatOf(draft.content);
    if (next === cur) return;
    const s = stash.current;
    const c = draft.content;
    let out: EContent = { ...c };
    if (cur === "CAROUSEL") {
      s.cards = c.cards;
      out = { ...out, cards: undefined };
    } else {
      s.headers[cur] = c.header ?? null;
    }
    if (next === "CAROUSEL") {
      s.std = { footer: c.footer, buttons: c.buttons };
      out = { ...out, header: null, footer: null, buttons: [], cards: s.cards ?? [blankCard("IMAGE"), blankCard("IMAGE")] };
      setActiveCard(0);
    } else {
      if (cur === "CAROUSEL") out = { ...out, footer: s.std?.footer ?? null, buttons: s.std?.buttons ?? [] };
      const kept = s.headers[next];
      out = { ...out, header: kept !== undefined ? kept : next === "TEXT" ? null : { format: next } };
    }
    setDraft({ ...draft, content: out });
  };

  const applyPreset = (p: Preset) => {
    const built = p.build(optout);
    stash.current = { headers: {} };
    setActiveCard(0);
    // suggest a name that isn't already taken in this language
    const used = new Set((all ?? []).filter((t) => t.language === built.language).map((t) => t.name));
    let suggestion = built.name;
    for (let n = 2; used.has(suggestion); n++) suggestion = `${built.name}_v${n}`;
    setDraft((d) => ({ ...built, name: d.name || suggestion }));
    setTouched(new Set());
    setServerName(null);
  };

  /* ───── save / submit ───── */
  const persist = async (): Promise<Template> => {
    const body = { name: draft.name, language: draft.language, category: draft.category, content: toContent(draft.content) };
    const saved = savedId ? await patch<Template>(`/api/templates/${savedId}`, body) : await post<Template>("/api/templates", body);
    setSavedId(saved.id);
    setSavedSnap(snap);
    await swrMutate(`/api/templates/${saved.id}`, saved, { revalidate: false });
    refresh("/api/templates");
    return saved;
  };

  const jump = (i: Pick<Issue, "path">) => {
    setShowAll(true);
    const ci = cardIndexOf(i.path);
    if (ci !== null) setActiveCard(ci);
    setTab("edit");
    // wait a beat so the revealed messages and the card switch have laid out before measuring
    setTimeout(() => document.getElementById(sectionOf(i.path))?.scrollIntoView({ behavior: "smooth", block: "start" }), 140);
  };

  const nameProblem = () => {
    const bad = !draft.name || errors.find((e) => e.path === "name");
    if (!bad) return false;
    touch(["name"]);
    jump({ path: "name" });
    toast.error(draft.name ? errors.find((e) => e.path === "name")!.message : "Give the template a name before saving.");
    return true;
  };

  const handleSaveError = (e: unknown) => {
    if (e instanceof ApiError && e.code === "DUPLICATE") {
      setServerName(e.message);
      jump({ path: "name" });
    }
    toastError(e);
  };

  const saveDraft = async () => {
    if (saving || readOnly) return;
    if (nameProblem()) return;
    setSaving("draft");
    try {
      const wasNew = !savedId;
      const saved = await persist();
      toast.success("Draft saved");
      if (wasNew) router.replace(`/templates/${saved.id}`, { scroll: false });
    } catch (e) {
      handleSaveError(e);
    } finally {
      setSaving(null);
    }
  };

  const submit = async () => {
    if (saving || readOnly) return;
    if (errors.length) {
      setShowAll(true);
      setSummaryOpen(true);
      jump(errors[0]);
      return;
    }
    setSaving("submit");
    let createdId: string | null = null;
    try {
      const wasNew = !savedId;
      const saved = dirty || wasNew ? await persist() : live!;
      if (wasNew) createdId = saved.id;
      const res = await post<Template>(`/api/templates/${saved.id}/submit`);
      refresh("/api/templates");
      if (res.status === "APPROVED") toast.success("Template approved", { description: `${res.name} is ready to use in campaigns.` });
      else if (res.status === "REJECTED") toast.error("Template rejected", { description: res.rejection_reason ?? "Open it to see what to change." });
      else toast.success("Submitted for review", { description: "Meta usually answers within minutes, and can take up to 24 hours. The status updates on the Templates page." });
      router.push("/templates");
    } catch (e) {
      if (e instanceof ApiError && e.code === "DUPLICATE") handleSaveError(e);
      else toast.error("Couldn't submit this template", { description: errorMessage(e), duration: 12000 });
      if (createdId) router.replace(`/templates/${createdId}`, { scroll: false });
    } finally {
      setSaving(null);
    }
  };

  const duplicate = async () => {
    if (!live) return;
    setDuplicating(true);
    try {
      const copy = await post<Template>(`/api/templates/${live.id}/duplicate`);
      refresh("/api/templates");
      toast.success("Copy created", { description: `You are editing ${copy.name}.` });
      router.push(`/templates/${copy.id}`);
    } catch (e) {
      toastError(e);
      setDuplicating(false);
    }
  };

  /* ───── guards & shortcuts ───── */
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // in-app links: ask before walking away from unsaved work
  React.useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      confirm({ title: "Leave without saving?", description: "Your changes to this template haven't been saved.", confirmLabel: "Leave", tone: "danger" }).then((ok) => {
        if (ok) router.push(url.pathname + url.search + url.hash);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, confirm, router]);

  const saveRef = React.useRef(saveDraft);
  React.useEffect(() => {
    saveRef.current = saveDraft;
  });
  React.useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly]);

  /* ───── render ───── */
  const title = !live ? "New template" : readOnly ? "Template" : "Edit template";

  return (
    <IssueProvider issues={issues} showAll={showAll} readOnly={readOnly} touchedPaths={touched} onTouch={touch}>
      <PageHeader
        back={
          <Link href="/templates" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3")}>
            <ArrowLeft size={14} /> Templates
          </Link>
        }
        title={title}
        description={
          live ? (
            <span className="inline-flex flex-wrap items-center gap-2 align-middle">
              <LiveStatusBadge status={status} />
              <CategoryBadge category={draft.category} />
              <span className="font-mono text-[13px] text-ink-3">{live.name}</span>
            </span>
          ) : (
            "Build the message, check it on the phone preview, then send it to Meta for review."
          )
        }
      />

      <div className="mb-5 xl:hidden">
        <Segmented
          aria-label="Edit or preview"
          value={tab}
          onValueChange={setTab}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          options={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-8 2xl:gap-10">
        <div className={cn("flex min-w-0 flex-col gap-5", tab === "preview" && "hidden xl:flex")}>
          {readOnly && <LockedBanner status={status} onDuplicate={duplicate} duplicating={duplicating} approvedId={status === "APPROVED" ? live!.id : null} />}
          {!readOnly && live?.status === "REJECTED" && live.rejection_reason && (
            <div className="flex items-start gap-3 rounded-2xl bg-danger-soft px-4 py-3.5 text-sm text-danger">
              <WarningCircle size={18} weight="fill" className="mt-px shrink-0" />
              <p className="leading-relaxed">
                <span className="font-medium">Rejected by Meta:</span> {live.rejection_reason}. Adjust the template and submit it again.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {showPresets && (
              <motion.section
                key="presets"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
                className="-m-1 overflow-hidden p-1"
                aria-label="Start from an example"
              >
                <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
                  <h2 className="text-[15px] font-medium tracking-tight">Start from an example</h2>
                  <span className="text-xs text-ink-3">or build your own below</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {PRESETS.map((p) => (
                    <div key={p.id} className="bezel-sm transition-transform duration-500 ease-fluid hover:-translate-y-0.5">
                      <button
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="bezel-core group flex h-full w-full flex-col items-start gap-3 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                      >
                        <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent-ink transition-transform duration-500 ease-fluid group-hover:scale-105">
                          <p.icon size={18} />
                        </span>
                        <span>
                          <span className="block text-sm font-medium tracking-tight">{p.title}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{p.line}</span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <fieldset
            disabled={readOnly}
            className={cn("m-0 flex min-w-0 flex-col gap-5 border-0 p-0", readOnly && "[&_input:disabled]:opacity-100 [&_textarea:disabled]:opacity-100 [&_button:disabled]:opacity-100")}
          >
            <BasicsSection
              name={draft.name}
              language={draft.language}
              category={draft.category}
              taken={taken}
              serverError={serverName}
              onName={(v) => {
                patchDraft({ name: v });
                setServerName(null);
              }}
              onLanguage={(v) => patchDraft({ language: v })}
              onCategory={(v: TemplateCategory) => patchDraft({ category: v })}
            />
            <FormatSection format={format} header={draft.content.header} onFormat={changeFormat} onHeader={(h) => patchContent((c) => ({ ...c, header: h }))} />
            <MessageSection
              content={draft.content}
              carousel={carousel}
              optout={optout}
              onBody={(v) => patchContent((c) => ({ ...c, body: v }))}
              onExamples={(v) => patchContent((c) => ({ ...c, body_examples: v }))}
              onFooter={(v) => patchContent((c) => ({ ...c, footer: v }))}
            />
            {carousel ? (
              <Card id="sec-cards" className="scroll-mt-6">
                <div className="mb-4">
                  <h3 className="text-[15px] font-medium tracking-tight">Cards</h3>
                  <p className="mt-0.5 text-[13px] text-ink-3">2 to 10 cards, each with its own media, text and buttons.</p>
                </div>
                <CarouselEditor
                  cards={draft.content.cards ?? []}
                  active={activeCard}
                  onActive={setActiveCard}
                  setCards={(fn) => patchContent((c) => ({ ...c, cards: fn(c.cards ?? []) }))}
                />
              </Card>
            ) : (
              <ButtonsSection buttons={draft.content.buttons} setButtons={(fn) => patchContent((c) => ({ ...c, buttons: fn(c.buttons) }))} />
            )}
          </fieldset>

        </div>

        <aside className={cn("min-w-0 xl:sticky xl:top-6", tab === "edit" && "hidden xl:block")}>
          <PreviewPanel content={previewContent} name={cfg?.workspace.name ?? "Your business"} activeCard={carousel ? activeCard : null} readOnly={readOnly} />
        </aside>
      </div>

      {!readOnly && (
        <ActionBar
          errors={errors}
          warnings={warnings}
          open={summaryOpen}
          onOpen={setSummaryOpen}
          onJump={jump}
          dirty={dirty}
          saved={!!savedId}
          saving={saving}
          onSave={saveDraft}
          onSubmit={submit}
        />
      )}
    </IssueProvider>
  );
}

function LockedBanner({ status, onDuplicate, duplicating, approvedId }: { status: Template["status"]; onDuplicate: () => void; duplicating: boolean; approvedId: string | null }) {
  const router = useRouter();
  const copy: Record<string, { title: string; text: string }> = {
    PENDING: { title: "In review with WhatsApp", text: "It can't be edited while Meta reviews it. This page updates when the decision arrives." },
    APPROVED: { title: "Approved and locked", text: "Approved templates can't be edited, because campaigns rely on their exact wording. Duplicate it to make changes." },
    PAUSED: { title: "Paused by WhatsApp", text: "Meta paused this template, usually because of low quality ratings. Duplicate it to make a revised version." },
    DISABLED: { title: "Disabled by WhatsApp", text: "Meta disabled this template. Duplicate it to make a revised version." },
  };
  const c = copy[status] ?? copy.APPROVED;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 hairline">
          <Lock size={18} />
        </span>
        <div className="min-w-[220px] flex-1">
          <p className="text-[15px] font-medium tracking-tight">{c.title}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{c.text}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {approvedId && (
            <Button variant="secondary" onClick={() => router.push(`/campaigns/new?template=${approvedId}`)}>
              Use in campaign
            </Button>
          )}
          <Button leading={<Copy size={16} />} trailing={<ArrowUpRight size={14} />} loading={duplicating} onClick={onDuplicate}>
            Duplicate to edit
          </Button>
        </div>
      </div>
    </Card>
  );
}
