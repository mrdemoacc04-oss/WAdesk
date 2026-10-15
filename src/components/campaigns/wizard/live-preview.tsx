"use client";
import * as React from "react";
import { DeviceMobile } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { PhoneFrame } from "@/components/wa/phone-frame";
import { TemplateBubble } from "@/components/wa/template-bubble";
import { clock } from "@/lib/shared/utils";
import type { TemplateContent } from "@/lib/shared/types";

export interface PreviewProps {
  content: TemplateContent | null;
  values: Record<string, string>;
  /** who the preview is resolved for */
  contactName: string | null;
  sampleIsReal: boolean;
  businessName: string;
}

function useNow() {
  const [t, setT] = React.useState<string>("");
  React.useEffect(() => setT(clock(new Date().toISOString())), []);
  return t;
}

function Phone({ content, values, businessName, height }: PreviewProps & { height: number }) {
  const time = useNow();
  return (
    <PhoneFrame name={businessName} subtitle="Business account" height={height}>
      {content ? (
        <TemplateBubble content={content} values={values} time={time || undefined} highlight />
      ) : (
        <div className="max-w-[240px] rounded-xl rounded-tl-sm bg-bubble-in px-3 py-2.5 text-[12.5px] leading-snug text-ink-3 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
          Choose a template and your message appears here, exactly as customers will see it.
        </div>
      )}
    </PhoneFrame>
  );
}

/** Sticky preview column (xl and up). */
export function LivePreview(props: PreviewProps) {
  return (
    <div className="rounded-[26px] bg-surface-2 p-5 hairline">
      <Phone {...props} height={500} />
      <p className="mx-auto mt-4 max-w-[270px] text-center text-xs leading-relaxed text-ink-3" aria-live="polite">
        {props.content ? (
          <>
            Shown for <span className="font-medium text-ink-2">{props.contactName ?? "a sample contact"}</span>
            {props.sampleIsReal ? " from your audience" : ""}. Highlighted text is filled in per person.
          </>
        ) : (
          "Live preview"
        )}
      </p>
    </div>
  );
}

/** Same preview in a dialog, for screens without the side column. */
export function PreviewButton(props: PreviewProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" leading={<DeviceMobile size={15} />} onClick={() => setOpen(true)} className="min-[1180px]:hidden">
        Preview
      </Button>
      <Modal open={open} onOpenChange={setOpen} title="Message preview" description={props.content ? `Shown for ${props.contactName ?? "a sample contact"}.` : "Choose a template first."} size="sm">
        <div className="pb-2 pt-1">
          <Phone {...props} height={470} />
        </div>
      </Modal>
    </>
  );
}
