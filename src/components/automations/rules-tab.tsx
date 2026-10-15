"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Copy, DotsThreeVertical, Info, Lightning, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Card, EmptyState, Skeleton } from "@/components/ui/display";
import { Switch } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useConfirm } from "@/components/confirm";
import { del, patch, post, refresh, toastError } from "@/lib/client/api";
import { useAutomations, useConfig, useTemplates } from "@/lib/client/hooks";
import { ago, cn, fmtNum } from "@/lib/shared/utils";
import { defaultBusinessHours } from "@/lib/shared/constants";
import type { AutomationRule } from "@/lib/shared/types";
import { TRIGGER_META, actionChipLabel, ACTION_META, replyPreview, starterRules, triggerSummary, type RuleDraft } from "./rule-utils";

const EASE = [0.32, 0.72, 0.0, 1] as const;

function RuleRow({ rule, index, onEdit, onToggle, onDuplicate, onDelete, templates, members }: {
  rule: AutomationRule;
  index: number;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  templates: Map<string, { name: string }>;
  members: Map<string, { name: string }>;
}) {
  const TIcon = TRIGGER_META[rule.trigger.type].icon;
  const reply = replyPreview(rule.actions);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ duration: 0.55, ease: EASE, delay: Math.min(index, 6) * 0.04 }}
    >
      <Card>
        <div className="flex items-start gap-4">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl transition-colors duration-300", rule.enabled ? "bg-accent-soft text-accent-ink" : "bg-ink/[0.06] text-ink-3")}>
            <TIcon size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={onEdit} className="min-w-0 text-left outline-none focus-visible:underline">
                <h3 className={cn("truncate text-[15px] font-medium tracking-tight", !rule.enabled && "text-ink-2")}>{rule.name}</h3>
                <p className="mt-0.5 text-sm text-ink-3">{triggerSummary(rule.trigger)}</p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Switch checked={rule.enabled} onCheckedChange={onToggle} aria-label={`${rule.name} is ${rule.enabled ? "on" : "off"}`} />
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${rule.name}`}>
                      <DotsThreeVertical size={18} weight="bold" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem icon={<PencilSimple size={17} />} onSelect={onEdit}>
                      Edit
                    </MenuItem>
                    <MenuItem icon={<Copy size={17} />} onSelect={onDuplicate}>
                      Duplicate
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash size={17} />} danger onSelect={onDelete}>
                      Delete
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {rule.actions.map((a, i) => {
                const AIcon = ACTION_META[a.type].icon;
                return (
                  <span key={i} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 text-xs text-ink-2">
                    <AIcon size={14} className="shrink-0 text-ink-3" />
                    <span className="truncate">{actionChipLabel(a, { templates, members })}</span>
                  </span>
                );
              })}
            </div>

            {reply && <p className="mt-3 line-clamp-2 border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed text-ink-3">{reply}</p>}

            <p className="tabular mt-3.5 text-xs text-ink-3">
              {rule.triggered_count > 0 ? (
                <>
                  Triggered {fmtNum(rule.triggered_count)} {rule.triggered_count === 1 ? "time" : "times"}
                  {rule.last_triggered_at && <> · {ago(rule.last_triggered_at)}</>}
                </>
              ) : (
                "Hasn't triggered yet"
              )}
            </p>
          </div>
        </div>
      </Card>
    </motion.li>
  );
}

export function RulesTab({ onNew, onEdit, onSeed }: { onNew: () => void; onEdit: (r: AutomationRule) => void; onSeed: (r: RuleDraft) => void }) {
  const { data: rules, isLoading, mutate } = useAutomations();
  const { data: cfg } = useConfig();
  const { data: approved } = useTemplates({ status: "APPROVED" });
  const confirm = useConfirm();

  const templates = React.useMemo(() => new Map((approved ?? []).map((t) => [t.id, { name: t.name }])), [approved]);
  const members = React.useMemo(() => new Map((cfg?.members ?? []).map((m) => [m.user_id, { name: m.name.split(" ")[0] }])), [cfg]);

  const toggle = async (rule: AutomationRule, enabled: boolean) => {
    try {
      await mutate(
        async (cur) => {
          await patch(`/api/automations/${rule.id}`, { enabled });
          return cur?.map((r) => (r.id === rule.id ? { ...r, enabled } : r));
        },
        { optimisticData: (cur) => (cur ?? []).map((r) => (r.id === rule.id ? { ...r, enabled } : r)), rollbackOnError: true, revalidate: true },
      );
      toast.success(enabled ? `“${rule.name}” is on` : `“${rule.name}” is off`);
    } catch (e) {
      toastError(e);
    }
  };

  const duplicate = async (rule: AutomationRule) => {
    try {
      await post("/api/automations", { name: `${rule.name} (copy)`.slice(0, 80), enabled: false, priority: rule.priority, trigger: rule.trigger, actions: rule.actions });
      await refresh("/api/automations");
      toast.success("Copy created and switched off");
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (rule: AutomationRule) => {
    const ok = await confirm({
      title: `Delete “${rule.name}”?`,
      description: "Customers will no longer get this reply. Chats that already received it are not affected.",
      confirmLabel: "Delete rule",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await mutate(
        async (cur) => {
          await del(`/api/automations/${rule.id}`);
          return cur?.filter((r) => r.id !== rule.id);
        },
        { optimisticData: (cur) => (cur ?? []).filter((r) => r.id !== rule.id), rollbackOnError: true, revalidate: true },
      );
      toast.success("Rule deleted");
    } catch (e) {
      toastError(e);
    }
  };

  if (isLoading || !rules) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <div className="flex gap-4">
              <Skeleton className="size-11 rounded-2xl" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3.5 w-72 max-w-full" />
                <Skeleton className="h-7 w-56 max-w-full rounded-full" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (rules.length === 0) {
    const starters = starterRules(cfg?.workspace.name ?? "us", cfg?.workspace.settings.business_hours ?? defaultBusinessHours());
    return (
      <div className="space-y-6">
        <Card>
          <EmptyState
            icon={<Lightning />}
            title="No auto-replies yet"
            description="Answer common questions instantly, greet new contacts and tag leads while you sleep."
            action={
              <Button trailing={<Plus size={14} />} onClick={onNew}>
                Create your first rule
              </Button>
            }
          />
        </Card>
        <div>
          <p className="mb-3 text-sm font-medium text-ink-2">Or start from a suggestion</p>
          <div className="grid gap-4 md:grid-cols-3">
            {starters.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.id} type="button" onClick={() => onSeed(s.rule)} className="group text-left outline-none">
                  <Card className="h-full transition-transform duration-500 ease-fluid group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-accent/60" coreClassName="h-full">
                    <span className="mb-4 grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                      <Icon size={20} />
                    </span>
                    <h3 className="flex items-center justify-between text-[15px] font-medium tracking-tight">
                      {s.title}
                      <ArrowUpRight size={15} className="text-ink-4 transition-colors group-hover:text-ink" />
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{s.description}</p>
                  </Card>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-3 hairline">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>
          The first matching keyword rule wins, in the order shown. Welcome and away messages are sent only when no teammate has taken the chat. STOP and START replies are handled before any rule.
        </span>
      </p>
      <ul className="space-y-4">
        <AnimatePresence initial={false} mode="popLayout">
          {rules.map((r, i) => (
            <RuleRow
              key={r.id}
              rule={r}
              index={i}
              templates={templates}
              members={members}
              onEdit={() => onEdit(r)}
              onToggle={(v) => toggle(r, v)}
              onDuplicate={() => duplicate(r)}
              onDelete={() => remove(r)}
            />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
