"use client";
import * as React from "react";
import { MessageBubble } from "@/components/wa/message-bubble";
import { TemplateBubble } from "@/components/wa/template-bubble";
import { PhoneFrame } from "@/components/wa/phone-frame";
import { cn } from "@/lib/shared/utils";
import type { AutomationAction, Interactive, Message, Template } from "@/lib/shared/types";
import { fillSample } from "./rule-utils";

let seq = 0;

/** A throwaway Message so we can render the real WhatsApp bubbles in previews. */
export function fakeMessage(direction: "in" | "out", body: string, interactive?: Interactive): Message {
  const now = new Date().toISOString();
  return {
    id: `preview-${++seq}`,
    workspace_id: "",
    conversation_id: "",
    contact_id: "",
    direction,
    type: interactive ? "interactive" : "text",
    body,
    payload: interactive ? { interactive } : {},
    status: direction === "out" ? "read" : "received",
    wa_message_id: null,
    error_code: null,
    error_message: null,
    campaign_id: null,
    sent_by: null,
    created_at: now,
    sent_at: now,
    delivered_at: null,
    read_at: null,
  };
}

/** A short chat on the WhatsApp wallpaper, used next to the compliance replies and greeting cards. */
export function MiniChat({ incoming, reply, className }: { incoming?: string; reply: string; className?: string }) {
  const bubbles = React.useMemo(
    () => [incoming ? fakeMessage("in", incoming) : null, fakeMessage("out", fillSample(reply) || "Your reply appears here…")].filter(Boolean) as Message[],
    [incoming, reply],
  );
  return (
    <div className={cn("wa-wallpaper flex flex-col gap-1.5 rounded-2xl p-3 hairline", className)} aria-label="Preview of the chat">
      {bubbles.map((m) => (
        <MessageBubble key={m.id} m={m} />
      ))}
    </div>
  );
}

/** What the customer sees when a rule fires: their message, then each reply in order. */
export function RulePreview({
  workspaceName,
  incoming,
  actions,
  templates,
}: {
  workspaceName: string;
  incoming: string;
  actions: AutomationAction[];
  templates: Map<string, Template>;
}) {
  const bubbles: React.ReactNode[] = [];
  const incomingMsg = React.useMemo(() => fakeMessage("in", incoming), [incoming]);
  bubbles.push(<MessageBubble key="in" m={incomingMsg} />);

  actions.forEach((a, i) => {
    if (a.type === "send_text") {
      bubbles.push(<MessageBubble key={i} m={fakeMessage("out", fillSample(a.body) || "Your reply appears here…")} />);
    } else if (a.type === "send_buttons") {
      const buttons = a.buttons.filter((b) => b.title.trim()).slice(0, 3).map((b, n) => ({ id: b.id || `b${n}`, title: b.title.trim().slice(0, 20) }));
      const body = fillSample(a.body) || "Your message appears here…";
      bubbles.push(<MessageBubble key={i} m={fakeMessage("out", body, { kind: "buttons", body, buttons })} />);
    } else if (a.type === "send_template") {
      const t = templates.get(a.template_id);
      if (t) {
        bubbles.push(
          <div key={i} className="flex w-full justify-end">
            <TemplateBubble content={t.content} highlight={false} className="max-w-[250px]" />
          </div>,
        );
      }
    }
  });

  return (
    <PhoneFrame name={workspaceName} subtitle="Business account" height={500}>
      {bubbles}
    </PhoneFrame>
  );
}
