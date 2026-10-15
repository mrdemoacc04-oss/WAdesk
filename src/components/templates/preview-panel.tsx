"use client";
import * as React from "react";
import { PhoneFrame } from "@/components/wa/phone-frame";
import { TemplateBubble } from "@/components/wa/template-bubble";
import type { TemplateContent } from "@/lib/shared/types";

/** The handset: always the template exactly as WhatsApp renders it, with sample values filled in. */
export function PreviewPanel({ content, name, activeCard, readOnly }: { content: TemplateContent; name: string; activeCard: number | null; readOnly?: boolean }) {
  const [height, setHeight] = React.useState(560);
  const boxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const fit = () => setHeight(Math.max(440, Math.min(600, window.innerHeight - 210)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // keep the swipeable cards in step with the card being edited
  const cardCount = content.cards?.length ?? 0;
  React.useEffect(() => {
    if (activeCard === null || !cardCount) return;
    const scroller = boxRef.current?.querySelector<HTMLElement>(".snap-x");
    const el = scroller?.children[activeCard] as HTMLElement | undefined;
    if (!scroller || !el) return;
    const left = scroller.scrollLeft + el.getBoundingClientRect().left - scroller.getBoundingClientRect().left - 10;
    scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeCard, cardCount]);

  return (
    <div ref={boxRef} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-[15px] font-medium tracking-tight">Preview</h2>
        <span className="text-xs text-ink-3">{readOnly ? "As recipients see it" : "Updates as you type"}</span>
      </div>
      <div className="bezel">
        <div className="bezel-core bg-surface-2 px-3 py-5">
          <PhoneFrame name={name} subtitle="Business account" height={height}>
            <TemplateBubble content={content} time="10:42" />
          </PhoneFrame>
        </div>
      </div>
      <p className="px-1 text-center text-xs leading-relaxed text-ink-3">Variables show your sample values. Campaigns replace them with each contact&apos;s details.</p>
    </div>
  );
}
