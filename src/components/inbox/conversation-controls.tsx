"use client";
import * as React from "react";
import { toast } from "sonner";
import { ArrowCounterClockwise, CheckCircle, ClockCountdown, UserCircleDashed } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/menu";
import { patch, refresh, toastError } from "@/lib/client/api";
import { useConversation, type ConversationBundle } from "@/lib/client/hooks";
import { cn } from "@/lib/shared/utils";
import type { Conversation, Member } from "@/lib/shared/types";
import { windowInfo } from "./lib";

/** Optimistic assign / resolve / reopen for one conversation. */
export function useConversationActions(id: string) {
  const { mutate } = useConversation(id);

  const apply = React.useCallback(
    async (body: { status?: "open" | "resolved"; assigned_to?: string | null }) => {
      try {
        await mutate(
          async (cur?: ConversationBundle) => {
            const conv = await patch<Conversation>(`/api/conversations/${id}`, body);
            return cur ? { ...cur, conversation: { ...cur.conversation, ...conv } } : cur;
          },
          {
            optimisticData: (cur?: ConversationBundle) => (cur ? { ...cur, conversation: { ...cur.conversation, ...body } } : (cur as unknown as ConversationBundle)),
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          },
        );
        void refresh("/api/conversations?", "/api/config");
        return true;
      } catch (e) {
        toastError(e);
        return false;
      }
    },
    [id, mutate],
  );

  const assign = React.useCallback((userId: string | null) => apply({ assigned_to: userId }), [apply]);
  const reopen = React.useCallback(() => apply({ status: "open" }), [apply]);
  const resolve = React.useCallback(async () => {
    const ok = await apply({ status: "resolved" });
    if (ok) toast("Conversation resolved", { action: { label: "Undo", onClick: () => void apply({ status: "open" }) } });
    return ok;
  }, [apply]);

  return { assign, resolve, reopen };
}

const UNASSIGNED = "unassigned";

export function AssignSelect({
  value,
  members,
  meId,
  onChange,
  className,
}: {
  value: string | null | undefined;
  members: Member[] | undefined;
  meId: string | undefined;
  onChange: (userId: string | null) => void;
  className?: string;
}) {
  const options = [
    { value: UNASSIGNED, label: "Unassigned", icon: <UserCircleDashed size={18} className="text-ink-3" /> },
    ...(members ?? []).map((m) => ({
      value: m.user_id,
      label: m.user_id === meId ? `${m.name} (you)` : m.name,
      icon: <Avatar name={m.name} seed={m.color} size={18} />,
    })),
  ];
  return <Select size="sm" aria-label="Assign conversation" className={className} value={value ?? UNASSIGNED} options={options} onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)} />;
}

export function ResolveButton({
  status,
  onResolve,
  onReopen,
  className,
  labelClassName,
}: {
  status: "open" | "resolved" | undefined;
  onResolve: () => void;
  onReopen: () => void;
  className?: string;
  /** hide the text label responsively, e.g. "hidden @[720px]:inline" */
  labelClassName?: string;
}) {
  if (!status) return <span className={cn("skeleton inline-block h-8 w-20 rounded-full", className)} aria-hidden />;
  const resolved = status === "resolved";
  const label = resolved ? "Reopen" : "Resolve";
  return (
    <Tooltip content={resolved ? "Reopen this conversation" : "Mark as resolved"}>
      <Button
        variant={resolved ? "soft" : "secondary"}
        size="sm"
        leading={resolved ? <ArrowCounterClockwise size={15} /> : <CheckCircle size={15} />}
        onClick={resolved ? onReopen : onResolve}
        aria-label={label}
        className={className}
      >
        <span className={labelClassName}>{label}</span>
      </Button>
    </Tooltip>
  );
}

/** 24-hour customer-service window: "Replies open · 6h 12m left" / "Window closed — templates only". */
export function WindowPill({ expiresAt, now, loaded, short, className }: { expiresAt: string | null | undefined; now: number; loaded: boolean; short?: boolean; className?: string }) {
  if (!loaded) return <span className={cn("skeleton inline-block h-5 w-40 rounded-full", className)} aria-hidden />;
  const w = windowInfo(expiresAt, now);
  const soon = w.open && w.msLeft < 3_600_000;
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 truncate rounded-full px-2.5 text-xs font-medium",
        w.open ? (soon ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-ink") : "bg-warn-soft text-warn",
        className,
      )}
      role="status"
    >
      {w.open ? <span className="size-1.5 shrink-0 rounded-full bg-current" /> : <ClockCountdown size={13} className="shrink-0" />}
      <span className="truncate">
        {short ? (
          w.open ? `Open · ${w.label}` : "Closed"
        ) : w.open ? (
          <>
            <span className="@[500px]:hidden">Open · {w.label}</span>
            <span className="hidden @[500px]:inline">Replies open · {w.label}</span>
          </>
        ) : (
          <>
            <span className="@[500px]:hidden">Window closed</span>
            <span className="hidden @[500px]:inline">Window closed — templates only</span>
          </>
        )}
      </span>
    </span>
  );
}
