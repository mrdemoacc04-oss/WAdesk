"use client";
import * as React from "react";
import { ArrowBendUpLeft, ArrowSquareOut, Copy, FileText, Phone, Play, ImageSquare } from "@phosphor-icons/react";
import { cn } from "@/lib/shared/utils";
import type { CarouselCard, TemplateButton, TemplateContent } from "@/lib/shared/types";
import { WaText } from "./wa-text";
import { StatusTicks } from "./status-ticks";

const isVideo = (u?: string | null) => !!u && /\.(mp4|mov|webm|3gp)(\?|$)/i.test(u);

function Media({ format, src, className }: { format: "IMAGE" | "VIDEO" | "DOCUMENT"; src?: string | null; className?: string }) {
  if (format === "DOCUMENT") return null;
  return (
    <div className={cn("relative overflow-hidden bg-ink/10", className)}>
      {src ? (
        isVideo(src) ? (
          <video src={src} muted playsInline className="size-full object-cover" />
        ) : (
           
          <img src={src} alt="" className="size-full object-cover" loading="lazy" />
        )
      ) : (
        <div className="grid size-full place-items-center text-ink-4">
          <ImageSquare size={28} />
        </div>
      )}
      {format === "VIDEO" && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <Play size={16} weight="fill" />
          </span>
        </span>
      )}
    </div>
  );
}

function ButtonRow({ b, className }: { b: TemplateButton; className?: string }) {
  const base = "flex items-center justify-center gap-1.5 bg-bubble-in px-3 py-2 text-center text-[12.5px] font-medium text-info";
  const icon = { QUICK_REPLY: <ArrowBendUpLeft size={14} />, URL: <ArrowSquareOut size={14} />, PHONE_NUMBER: <Phone size={14} />, COPY_CODE: <Copy size={14} /> }[b.type];
  const text = b.type === "COPY_CODE" ? "Copy offer code" : b.text || "Button";
  return (
    <div className={cn(base, className)}>
      {icon}
      <span className="truncate">{text}</span>
    </div>
  );
}

function Buttons({ buttons, className }: { buttons: TemplateButton[]; className?: string }) {
  if (!buttons.length) return null;
  return (
    <div className={cn("mt-0.5 flex flex-col gap-0.5", className)}>
      {buttons.map((b, i) => (
        <ButtonRow key={i} b={b} className={cn("shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]", i === buttons.length - 1 ? "rounded-b-xl" : "", "rounded-sm", i === buttons.length - 1 && "rounded-b-xl")} />
      ))}
    </div>
  );
}

/**
 * Renders a template exactly as a WhatsApp chat shows it.
 * `values` carries slot keys (`body.1`, `header.media`, …); anything missing falls back to the template's sample.
 */
export function TemplateBubble({
  content,
  values = {},
  time,
  status,
  highlight = true,
  className,
  author,
}: {
  content: TemplateContent;
  values?: Record<string, string>;
  time?: string | null;
  status?: string;
  highlight?: boolean;
  className?: string;
  author?: React.ReactNode;
}) {
  const h = content.header;
  const hv = (k: string) => values[k];
  const bodyResolve = (n: number) => hv(`body.${n}`) || content.body_examples[n - 1];
  const hasCards = !!content.cards?.length;

  return (
    <div className={cn("w-full max-w-[272px] animate-bubble", className)}>
      <div className="rounded-xl rounded-tl-sm bg-bubble-in p-1 text-[13px] leading-[1.35] text-ink shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] [overflow-wrap:anywhere]">
        {h?.format === "TEXT" && (
          <p className="px-2 pb-0.5 pt-1.5 text-[13.5px] font-semibold">
            <WaText text={h.text} resolve={() => hv("header.1") || h.example || undefined} highlight={highlight} />
          </p>
        )}
        {h && h.format !== "TEXT" && h.format !== "DOCUMENT" && <Media format={h.format} src={hv("header.media") || h.media_url} className="mb-1 aspect-[16/10] rounded-lg" />}
        {h?.format === "DOCUMENT" && (
          <div className="m-0.5 mb-1 flex items-center gap-2.5 rounded-lg bg-ink/[0.07] p-2.5">
            <div className="grid size-9 place-items-center rounded-md bg-danger-soft text-danger">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium">{h.filename || (hv("header.media") || h.media_url || "document.pdf").split("/").pop()}</p>
              <p className="text-[10.5px] text-ink-3">Document</p>
            </div>
          </div>
        )}
        <p className="px-2 pb-1 pt-1">
          <WaText text={content.body || "Your message appears here…"} resolve={bodyResolve} highlight={highlight} className={cn(!content.body && "text-ink-4")} />
        </p>
        {content.footer && !hasCards && <p className="px-2 pb-1 text-[11px] text-ink-3">{content.footer}</p>}
        <div className="flex items-center justify-end gap-1 px-2 pb-1 text-[10px] text-ink-3">
          {time && <span>{time}</span>}
          {status && <StatusTicks status={status} size={13} />}
        </div>
      </div>
      {!hasCards && <Buttons buttons={content.buttons} />}
      {hasCards && (
        <div className="-mx-2.5 mt-1.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2.5 pb-1.5 [scrollbar-width:none]">
          {content.cards!.map((c, i) => (
            <Card key={i} card={c} index={i} values={values} highlight={highlight} />
          ))}
        </div>
      )}
      {author && <div className="mt-1 px-1 text-[10.5px] text-ink-3">{author}</div>}
    </div>
  );
}

function Card({ card, index, values, highlight }: { card: CarouselCard; index: number; values: Record<string, string>; highlight: boolean }) {
  const resolve = (n: number) => values[`card.${index}.body.${n}`] || card.body_examples[n - 1];
  return (
    <div className="w-[206px] shrink-0 snap-start">
      <div className="overflow-hidden rounded-xl bg-bubble-in shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]">
        <Media format={card.media_format} src={values[`card.${index}.media`] || card.media_url} className="aspect-square" />
        <p className="px-2.5 pb-2.5 pt-2 text-[12.5px] leading-snug">
          <WaText text={card.body || "Card text…"} resolve={resolve} highlight={highlight} className={cn(!card.body && "text-ink-4")} />
        </p>
      </div>
      <Buttons buttons={card.buttons} />
    </div>
  );
}
