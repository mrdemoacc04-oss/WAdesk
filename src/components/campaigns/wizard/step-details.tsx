"use client";
import { Info } from "@phosphor-icons/react";
import { Inset } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/input";
import { StepHeader } from "./step-shell";

export function StepDetails({ name, onName, onEnter }: { name: string; onName: (v: string) => void; onEnter: () => void }) {
  return (
    <div>
      <StepHeader title="Name your campaign" description="A name you’ll recognise in lists and reports. Customers never see it." />
      <Field label="Campaign name" htmlFor="campaign-name">
        <Input
          id="campaign-name"
          value={name}
          maxLength={120}
          autoComplete="off"
          placeholder="e.g. Diwali sale — VIP customers"
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
        />
      </Field>
      <Inset className="mt-6 flex gap-3 text-[13px] leading-relaxed text-ink-2">
        <Info size={18} className="mt-0.5 shrink-0 text-ink-3" />
        <p>
          A broadcast starts new conversations, so WhatsApp requires an approved message template. Replies land in your inbox and open a 24-hour window where you can answer freely.
        </p>
      </Inset>
    </div>
  );
}
