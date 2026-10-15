"use client";
import * as React from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { post, toastError } from "@/lib/client/api";

const IDEAS = ["Hi, is this still available?", "Can you share the price list?", "What are your working hours?", "STOP"];

/** Demo mode only: inject an inbound message as if the customer had just written. */
export function SimulateModal({ open, onOpenChange, contactId, name }: { open: boolean; onOpenChange: (o: boolean) => void; contactId: string | undefined; name: string }) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) setText("");
  }, [open]);

  const send = async () => {
    if (!contactId || !text.trim()) return;
    setBusy(true);
    try {
      await post("/api/demo/simulate", { contact_id: contactId, text: text.trim() });
      toast.success("Reply on its way", { description: "It shows up in the thread in a moment." });
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Simulate a customer reply"
      description={`Demo mode. The message arrives as if ${name} sent it from WhatsApp.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={send}>
            Send as customer
          </Button>
        </>
      }
    >
      <Textarea
        autoFocus
        value={text}
        maxLength={1000}
        rows={3}
        aria-label="Customer message"
        placeholder="What does the customer say?"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
        }}
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {IDEAS.map((i) => (
          <button key={i} type="button" onClick={() => setText(i)} className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-ink/[0.1] hover:text-ink">
            {i}
          </button>
        ))}
      </div>
    </Modal>
  );
}
