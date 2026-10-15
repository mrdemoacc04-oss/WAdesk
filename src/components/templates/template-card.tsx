"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Copy, DotsThree, Megaphone, PencilSimple, Eye, Trash, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { CategoryBadge } from "@/components/status";
import { useConfirm } from "@/components/confirm";
import { TemplateBubble } from "@/components/wa/template-bubble";
import { del, post, refresh, toastError } from "@/lib/client/api";
import type { TemplateRow } from "@/lib/client/hooks";
import { TEMPLATE_LANGUAGES } from "@/lib/shared/constants";
import type { TemplateContent } from "@/lib/shared/types";
import { ago, fmtNum, fmtPct, pluralize } from "@/lib/shared/utils";
import { LiveStatusBadge } from "./status-live";

/** A scaled-down WhatsApp bubble on the chat wallpaper, clipped with a soft fade. */
export function TemplateTile({ content }: { content: TemplateContent }) {
  return (
    <div className="wa-wallpaper relative h-[232px] overflow-hidden rounded-[14px] hairline" aria-hidden>
      <div className="absolute left-1/2 top-3.5 w-[272px] origin-top" style={{ transform: "translateX(-50%) scale(0.86)" }}>
        <TemplateBubble content={content} time="10:42" />
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: "linear-gradient(to top, var(--wa-wall) 8%, color-mix(in srgb, var(--wa-wall) 0%, transparent))" }}
      />
    </div>
  );
}

function usageLine(t: TemplateRow): string {
  const u = t.usage;
  if (t.status === "DRAFT") return `Draft · edited ${ago(t.updated_at)}`;
  if (t.status === "PENDING") return `Sent for review ${ago(t.submitted_at ?? t.updated_at)}`;
  if (t.status === "REJECTED") return `Rejected · edited ${ago(t.updated_at)}`;
  if (!u.campaigns) return "Not used in a campaign yet";
  const read = u.delivered ? ` · ${fmtPct(u.read, u.delivered, 0)} read` : "";
  return `${pluralize(u.campaigns, "campaign")} · ${fmtNum(u.sent)} sent${read}`;
}

export function TemplateCard({ t, index }: { t: TemplateRow; index: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const editable = t.status === "DRAFT" || t.status === "REJECTED";
  const lang = TEMPLATE_LANGUAGES.find((l) => l.code === t.language)?.name ?? t.language;

  // a subtle ring when the review result lands while the list is open
  const prev = React.useRef(t.status);
  const [flash, setFlash] = React.useState(false);
  React.useEffect(() => {
    if (prev.current !== t.status) {
      if (prev.current === "PENDING") setFlash(true);
      prev.current = t.status;
    }
  }, [t.status]);
  React.useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(false), 2400);
    return () => clearTimeout(id);
  }, [flash]);

  const duplicate = async () => {
    try {
      const copy = await post<{ id: string; name: string }>(`/api/templates/${t.id}/duplicate`);
      refresh("/api/templates");
      toast.success("Copy created", { description: copy.name });
      router.push(`/templates/${copy.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${t.name}?`,
      description: t.usage.campaigns
        ? `It was used in ${pluralize(t.usage.campaigns, "campaign")}. Their message history stays, but you won't be able to use this template again.`
        : "This can't be undone. If your WhatsApp account is connected, it is also removed from Meta.",
      confirmLabel: "Delete template",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await del(`/api/templates/${t.id}`);
      refresh("/api/templates");
      toast.success("Template deleted");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Card
      padded={false}
      coreClassName="flex h-full flex-col p-2"
      className="group relative animate-fade-up transition-transform duration-500 ease-fluid hover:-translate-y-0.5"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <TemplateTile content={t.content} />
      <div className="flex flex-1 flex-col gap-3 px-2.5 pb-2.5 pt-3.5">
        <div className="flex items-center gap-2">
          <Link
            href={`/templates/${t.id}`}
            className="min-w-0 flex-1 truncate rounded-md font-mono text-[13.5px] font-medium tracking-tight outline-none after:absolute after:inset-0 after:rounded-[26px] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent/60"
          >
            {t.name}
          </Link>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${t.name}`} className="relative z-10 -mr-1">
                <DotsThree size={20} weight="bold" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={editable ? <PencilSimple size={16} /> : <Eye size={16} />} onSelect={() => router.push(`/templates/${t.id}`)}>
                {editable ? "Edit" : "View"}
              </MenuItem>
              <MenuItem icon={<Copy size={16} />} onSelect={duplicate}>
                Duplicate
              </MenuItem>
              {t.status === "APPROVED" && (
                <MenuItem icon={<Megaphone size={16} />} onSelect={() => router.push(`/campaigns/new?template=${t.id}`)}>
                  Use in campaign
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon={<Trash size={16} />} danger onSelect={remove}>
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <LiveStatusBadge status={t.status} />
          <CategoryBadge category={t.category} />
          <span className="text-xs text-ink-3">{lang}</span>
        </div>

        <p className="text-[13px] tabular text-ink-3">{usageLine(t)}</p>

        {t.status === "REJECTED" && t.rejection_reason && (
          <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
            <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0" />
            <span className="min-w-0">{t.rejection_reason}</span>
          </p>
        )}
      </div>

      <AnimatePresence>
        {flash && (
          <motion.span
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, times: [0, 0.12, 0.6, 1], ease: "easeOut" }}
            className="pointer-events-none absolute -inset-px rounded-[27px] shadow-[0_0_0_2px_var(--accent),0_0_32px_-4px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
          />
        )}
      </AnimatePresence>
    </Card>
  );
}

export function TemplateCardSkeleton() {
  return (
    <Card padded={false} coreClassName="p-2">
      <Skeleton className="h-[232px] rounded-[14px]" />
      <div className="flex flex-col gap-3 px-2.5 pb-2.5 pt-3.5">
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-48" />
      </div>
    </Card>
  );
}
