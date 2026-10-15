"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowBendUpLeft,
  CaretDown,
  CopySimple,
  DotsThree,
  Eye,
  EyeSlash,
  PencilSimple,
  Pause,
  Play,
  Prohibit,
  CalendarX,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useConfirm } from "@/components/confirm";
import { del, post, refresh, toastError } from "@/lib/client/api";
import { fmtNum } from "@/lib/shared/utils";
import type { Campaign } from "@/lib/shared/types";
import { ButtonLink } from "../button-link";

type Retarget = "not_read" | "not_delivered" | "failed" | "read_no_reply";

export function CampaignActions({ c }: { c: Campaign }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const state = (action: "pause" | "resume" | "cancel" | "unschedule", done: string) =>
    run(action, async () => {
      await post(`/api/campaigns/${c.id}/state`, { action });
      await refresh("/api/campaigns", "/api/dashboard");
      toast.success(done);
    });

  const cancel = async () => {
    const ok = await confirm({
      title: "Cancel this campaign?",
      description: "Messages still waiting in the queue are skipped. Messages that already went out can’t be recalled.",
      confirmLabel: "Stop campaign",
      tone: "danger",
    });
    if (ok) await state("cancel", "Campaign cancelled");
  };

  const duplicate = () =>
    run("duplicate", async () => {
      const copy = await post<Campaign>(`/api/campaigns/${c.id}/duplicate`);
      refresh("/api/campaigns");
      toast.success("Copied to a new draft");
      router.push(`/campaigns/new?draft=${copy.id}&step=details`);
    });

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      description: "Its results and recipient log are removed for good. Messages already sent stay in the inbox.",
      confirmLabel: "Delete campaign",
      tone: "danger",
    });
    if (!ok) return;
    await run("delete", async () => {
      await del(`/api/campaigns/${c.id}`);
      await refresh("/api/campaigns", "/api/dashboard");
      toast.success("Campaign deleted");
      router.push("/campaigns");
    });
  };

  const followUp = (kind: Retarget) =>
    run(`retarget-${kind}`, async () => {
      const next = await post<Campaign>(`/api/campaigns/${c.id}/retarget`, { retarget: kind });
      refresh("/api/campaigns");
      router.push(`/campaigns/new?draft=${next.id}&step=message`);
    });

  const finished = c.status === "completed" || c.status === "cancelled" || c.status === "failed";
  const counts = {
    not_read: Math.max(0, c.delivered - c.read),
    not_delivered: Math.max(0, c.sent - c.delivered),
    failed: c.failed,
    read_no_reply: Math.max(0, c.read - c.replied),
  };

  return (
    <>
      {c.status === "draft" && (
        <ButtonLink href={`/campaigns/new?draft=${c.id}&step=details`} leading={<PencilSimple size={16} />}>
          Continue editing
        </ButtonLink>
      )}
      {c.status === "sending" && (
        <Button variant="secondary" leading={<Pause size={16} weight="fill" />} loading={busy === "pause"} onClick={() => state("pause", "Campaign paused")}>
          Pause
        </Button>
      )}
      {c.status === "paused" && (
        <Button leading={<Play size={16} weight="fill" />} loading={busy === "resume"} onClick={() => state("resume", "Sending resumed")}>
          Resume
        </Button>
      )}
      {c.status === "scheduled" && (
        <Button variant="secondary" leading={<CalendarX size={16} />} loading={busy === "unschedule"} onClick={() => state("unschedule", "Back to draft")}>
          Unschedule
        </Button>
      )}
      {(c.status === "sending" || c.status === "paused" || c.status === "scheduled") && (
        <Button variant="danger-soft" leading={<Prohibit size={16} />} loading={busy === "cancel"} onClick={cancel}>
          Cancel
        </Button>
      )}

      {finished && c.sent > 0 && (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" leading={<ArrowBendUpLeft size={16} />} trailing={<CaretDown size={12} weight="bold" />}>
              Follow up
            </Button>
          </MenuTrigger>
          <MenuContent className="min-w-[260px]">
            <MenuLabel>Send a new campaign to people who…</MenuLabel>
            <MenuItem icon={<EyeSlash size={16} />} disabled={!counts.not_read} shortcut={fmtNum(counts.not_read)} onSelect={() => followUp("not_read")}>
              Didn’t read it
            </MenuItem>
            <MenuItem icon={<WarningCircle size={16} />} disabled={!counts.not_delivered} shortcut={fmtNum(counts.not_delivered)} onSelect={() => followUp("not_delivered")}>
              Didn’t get it
            </MenuItem>
            <MenuItem icon={<ArrowBendUpLeft size={16} />} disabled={!counts.failed} shortcut={fmtNum(counts.failed)} onSelect={() => followUp("failed")}>
              Failed: retry them
            </MenuItem>
            <MenuItem icon={<Eye size={16} />} disabled={!counts.read_no_reply} shortcut={fmtNum(counts.read_no_reply)} onSelect={() => followUp("read_no_reply")}>
              Read it but didn’t reply
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      {finished && (
        <Button variant="secondary" leading={<CopySimple size={16} />} loading={busy === "duplicate"} onClick={duplicate}>
          Duplicate
        </Button>
      )}

      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <DotsThree size={20} weight="bold" />
          </Button>
        </MenuTrigger>
        <MenuContent>
          {!finished && (
            <MenuItem icon={<CopySimple size={16} />} onSelect={duplicate}>
              Duplicate
            </MenuItem>
          )}
          {!finished && <MenuSeparator />}
          <MenuItem icon={<Trash size={16} />} danger disabled={c.status === "sending"} onSelect={remove}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  );
}
