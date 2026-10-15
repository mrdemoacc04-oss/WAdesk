"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowSquareOut, ChatCircleDots, Copy, DotsThreeVertical, SidebarSimple, UserCircle } from "@phosphor-icons/react";
import { Avatar, Badge, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui/menu";
import type { ConversationBundle } from "@/lib/client/hooks";
import { formatPhone } from "@/lib/shared/phone";
import { cn } from "@/lib/shared/utils";
import type { Member } from "@/lib/shared/types";
import { AssignSelect, ResolveButton, WindowPill } from "./conversation-controls";
import { displayName } from "./lib";

export function ThreadHeader({
  bundle,
  members,
  meId,
  now,
  onBack,
  panelOpen,
  onTogglePanel,
  onViewContact,
  onAssign,
  onResolve,
  onReopen,
  demo,
  onSimulate,
}: {
  bundle: ConversationBundle | undefined;
  members: Member[] | undefined;
  meId: string | undefined;
  now: number;
  onBack: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onViewContact: () => void;
  onAssign: (userId: string | null) => void;
  onResolve: () => void;
  onReopen: () => void;
  demo: boolean;
  onSimulate: () => void;
}) {
  const router = useRouter();
  const contact = bundle?.contact;
  const conv = bundle?.conversation;

  return (
    <header className="shrink-0 border-b border-line bg-surface px-3 py-3 md:px-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 @[720px]:grid-cols-[minmax(0,1fr)_auto_auto]">
        {/* identity */}
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5">
          <Button variant="ghost" size="icon-sm" aria-label="Back to conversations" onClick={onBack} className="-ml-1 md:hidden">
            <ArrowLeft size={19} />
          </Button>
          {contact ? (
            <Avatar name={contact.name} seed={contact.name ?? contact.phone} size={40} />
          ) : (
            <Skeleton className="size-10 shrink-0 rounded-full" />
          )}
          <div className="min-w-0">
            {contact ? (
              <>
                <h2 className="truncate text-[15px] font-medium leading-tight tracking-tight">{displayName(contact)}</h2>
                <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-ink-3">
                  <span className="truncate font-mono">{formatPhone(contact.phone)}</span>
                  {contact.opt_in === "opted_in" ? (
                    <Badge tone="accent" size="sm" dot className="shrink-0">
                      Opted in
                    </Badge>
                  ) : contact.opt_in === "opted_out" ? (
                    <Badge tone="danger" size="sm" dot className="shrink-0">
                      Opted out
                    </Badge>
                  ) : (
                    <Badge tone="warn" size="sm" dot className="shrink-0">
                      Unconfirmed
                    </Badge>
                  )}
                </p>
              </>
            ) : (
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
            )}
          </div>
        </div>

        {/* window · assignment · resolve */}
        <div className="col-span-2 col-start-1 row-start-2 flex min-w-0 items-center gap-2 @[720px]:col-span-1 @[720px]:col-start-2 @[720px]:row-start-1">
          <WindowPill className="min-w-0 flex-1 @[720px]:flex-none" expiresAt={bundle?.window_expires_at} now={now} loaded={!!bundle} />
          <AssignSelect className="w-[136px] shrink-0 @[720px]:w-[156px]" value={conv?.assigned_to} members={members} meId={meId} onChange={onAssign} />
          <ResolveButton status={conv?.status} onResolve={onResolve} onReopen={onReopen} className="shrink-0" labelClassName="hidden @[720px]:inline" />
        </div>

        {/* panel + menu */}
        <div className="col-start-2 row-start-1 flex items-center gap-0.5 @[720px]:col-start-3">
          <Tooltip content={panelOpen ? "Hide contact panel" : "Show contact panel"}>
            <Button variant="ghost" size="icon-sm" aria-label={panelOpen ? "Hide contact panel" : "Show contact panel"} aria-pressed={panelOpen} onClick={onTogglePanel} className={cn(panelOpen && "bg-ink/[0.07] text-ink")}>
              <SidebarSimple size={19} mirrored />
            </Button>
          </Tooltip>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <DotsThreeVertical size={20} weight="bold" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<UserCircle size={18} />} onSelect={onViewContact}>
                View contact
              </MenuItem>
              <MenuItem icon={<ArrowSquareOut size={18} />} disabled={!contact} onSelect={() => contact && router.push(`/contacts?open=${contact.id}`)}>
                Open in contacts
              </MenuItem>
              <MenuItem
                icon={<Copy size={18} />}
                disabled={!contact}
                onSelect={async () => {
                  if (!contact) return;
                  try {
                    await navigator.clipboard.writeText(contact.phone);
                    toast.success("Number copied");
                  } catch {
                    toast.error("Couldn't copy the number");
                  }
                }}
              >
                Copy phone number
              </MenuItem>
              {demo && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={<ChatCircleDots size={18} />} onSelect={onSimulate}>
                    Simulate customer reply
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>
      </div>
    </header>
  );
}
