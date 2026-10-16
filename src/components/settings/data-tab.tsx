"use client";
import * as React from "react";
import { ArrowCounterClockwise, Broom, DownloadSimple, Flask, ShieldCheck } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui/display";
import { Button, buttonVariants } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { post, refresh, toastError } from "@/lib/client/api";
import { useConfig } from "@/lib/client/hooks";

function DemoDataCard({ canEdit }: { canEdit: boolean }) {
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState<"clear" | "reset" | null>(null);

  const run = async (kind: "clear" | "reset") => {
    const ok = await confirm(
      kind === "clear"
        ? {
            title: "Start fresh?",
            description: "This removes the sample contacts, templates, campaigns and chats. Your connection, team and automations stay.",
            confirmLabel: "Remove sample data",
            tone: "danger",
          }
        : {
            title: "Reset the sample data?",
            description: "Everything you added in demo mode is replaced with the original sample contacts, templates, campaigns and chats.",
            confirmLabel: "Reset sample data",
            tone: "danger",
          },
    );
    if (!ok) return;
    setBusy(kind);
    try {
      await post(`/api/demo/${kind}`);
      await refresh("/api/");
      toast.success(kind === "clear" ? "Sample data removed. You're starting fresh." : "Sample data restored");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Demo data"
        description="You're running locally with sample data and a simulated WhatsApp."
        action={
          <Badge tone="info" dot>
            Demo mode only
          </Badge>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl bg-surface-2 p-4 hairline">
          <span className="mb-3 grid size-9 place-items-center rounded-xl bg-ink/[0.06] text-ink-2">
            <Broom size={18} />
          </span>
          <h4 className="text-sm font-medium">Start fresh</h4>
          <p className="mt-1 flex-1 text-[13px] leading-relaxed text-ink-3">
            Removes the sample contacts, templates, campaigns and chats so you can begin with an empty workspace. Your connection, team and automations are kept.
          </p>
          <Button className="mt-4 self-start" variant="danger-soft" leading={<Broom size={16} />} loading={busy === "clear"} disabled={!canEdit || busy !== null} onClick={() => run("clear")}>
            Start fresh
          </Button>
        </div>
        <div className="flex flex-col rounded-2xl bg-surface-2 p-4 hairline">
          <span className="mb-3 grid size-9 place-items-center rounded-xl bg-ink/[0.06] text-ink-2">
            <ArrowCounterClockwise size={18} />
          </span>
          <h4 className="text-sm font-medium">Reset sample data</h4>
          <p className="mt-1 flex-1 text-[13px] leading-relaxed text-ink-3">Puts everything back to how it was when you first opened WAdesk, including the sample campaigns and chats.</p>
          <Button className="mt-4 self-start" variant="danger-soft" leading={<ArrowCounterClockwise size={16} />} loading={busy === "reset"} disabled={!canEdit || busy !== null} onClick={() => run("reset")}>
            Reset sample data
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function DataTab({ canEdit }: { canEdit: boolean }) {
  const { data: cfg } = useConfig();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Export" description="Your data is yours. Take a copy whenever you like." />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface-2 p-4 hairline">
          <div className="min-w-0 max-w-md">
            <h4 className="text-sm font-medium">All contacts</h4>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Name, phone, email, tags, consent status and source, as a CSV file that opens in Excel or Google Sheets.</p>
          </div>
          <a href="/api/contacts/export" download className={buttonVariants({ variant: "secondary" })}>
            <DownloadSimple size={16} /> Export all contacts (CSV)
          </a>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
          <ShieldCheck size={14} className="mt-px shrink-0" />
          Your Meta access token and app secret are encrypted when saved and are never included in exports or shown on screen.
        </p>
      </Card>

      {cfg?.mode === "local" && <DemoDataCard canEdit={canEdit} />}
      {!cfg && <Skeleton className="h-48 w-full rounded-[26px]" />}
      {cfg?.mode === "local" && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-3">
          <Flask size={14} className="mt-px shrink-0" />
          Running locally. Connect Supabase to store your data in the cloud.
        </p>
      )}
    </div>
  );
}
