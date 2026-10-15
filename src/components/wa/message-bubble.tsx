"use client";
import * as React from "react";
import { ArrowBendUpLeft, ArrowSquareOut, DownloadSimple, FileText, ListBullets, MapPin, Note, User, WarningCircle } from "@phosphor-icons/react";
import { cn, clock } from "@/lib/shared/utils";
import { waErrorInfo } from "@/lib/shared/wa-errors";
import type { Message, Template } from "@/lib/shared/types";
import { WaText } from "./wa-text";
import { StatusTicks } from "./status-ticks";
import { TemplateBubble } from "./template-bubble";
import { Tooltip } from "@/components/ui/menu";

const isVideo = (u?: string | null) => !!u && /\.(mp4|mov|webm|3gp)(\?|$)/i.test(u);

function Meta({ m }: { m: Message }) {
  return (
    <span className="float-right ml-3 mt-1.5 inline-flex translate-y-1 items-center gap-1 text-[10.5px] text-ink-3">
      {clock(m.created_at)}
      {m.direction === "out" && <StatusTicks status={m.status} size={14} />}
    </span>
  );
}

export function MessageBubble({
  m,
  templates,
  showAuthor,
  fresh,
  onRetry,
}: {
  m: Message;
  templates?: Map<string, Template>;
  showAuthor?: boolean;
  fresh?: boolean;
  onRetry?: (m: Message) => void;
}) {
  const out = m.direction === "out";
  const p = m.payload ?? {};
  const author = p.author?.name;

  if (m.type === "note") {
    return (
      <div className={cn("mx-auto flex w-full max-w-[460px] items-start gap-2.5 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn", fresh && "animate-bubble")}>
        <Note size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-medium opacity-80">Internal note · {author ?? "Team"} · {clock(m.created_at)}</p>
          <p className="whitespace-pre-wrap break-words text-ink [overflow-wrap:anywhere]">{m.body}</p>
        </div>
      </div>
    );
  }

  const tplMeta = m.type === "template" ? p.template : undefined;
  const tplContent = tplMeta?.content ?? (tplMeta?.id ? templates?.get(tplMeta.id)?.content : undefined);

  const bubble = (children: React.ReactNode, pad = true) => (
    <div
      className={cn(
        "relative max-w-[min(78%,520px)] rounded-2xl text-[14px] leading-[1.4] shadow-[0_1px_0.5px_rgba(0,0,0,0.1)]",
        out ? "rounded-tr-md bg-bubble-out" : "rounded-tl-md bg-bubble-in",
        pad && "px-3 py-2",
        m.status === "failed" && "ring-1 ring-danger/40",
        fresh && "animate-bubble",
      )}
    >
      {children}
    </div>
  );

  let inner: React.ReactNode;

  if (m.type === "template" && tplContent) {
    inner = (
      <div className={cn("max-w-[300px]", fresh && "animate-bubble")}>
        <TemplateBubble content={tplContent} values={tplMeta?.values} highlight={false} time={clock(m.created_at)} status={out ? m.status : undefined} className="max-w-none" />
        {m.campaign_id && <p className="mt-1 px-1 text-[11px] text-ink-3">Sent in a broadcast</p>}
      </div>
    );
  } else if (m.type === "image" || m.type === "sticker") {
    inner = bubble(
      <>
        {p.media?.url && (
          <a href={p.media.url} target="_blank" rel="noreferrer" className="-mx-1.5 -mt-1 mb-1 block overflow-hidden rounded-xl">
            { }
            <img src={p.media.url} alt={p.media.caption ?? "Image"} className="max-h-72 w-full object-cover" loading="lazy" />
          </a>
        )}
        {m.body && <WaText text={m.body} />}
        <Meta m={m} />
      </>,
    );
  } else if (m.type === "video") {
    inner = bubble(
      <>
        {p.media?.url && (isVideo(p.media.url) ? <video src={p.media.url} controls className="-mx-1.5 -mt-1 mb-1 max-h-72 rounded-xl" /> : <a href={p.media.url} target="_blank" rel="noreferrer" className="text-info underline">Open video</a>)}
        {m.body && <WaText text={m.body} />}
        <Meta m={m} />
      </>,
    );
  } else if (m.type === "audio") {
    inner = bubble(
      <>
        {p.media?.url ? <audio src={p.media.url} controls className="h-9 w-56 max-w-full" /> : <span className="text-ink-3">Voice message</span>}
        <Meta m={m} />
      </>,
    );
  } else if (m.type === "document") {
    inner = bubble(
      <>
        <a href={p.media?.url} target="_blank" rel="noreferrer" className="-mx-1 mb-1 flex min-w-52 items-center gap-3 rounded-xl bg-ink/[0.06] p-2.5">
          <span className="grid size-10 place-items-center rounded-lg bg-danger-soft text-danger">
            <FileText size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{p.media?.filename ?? "Document"}</span>
            <span className="block text-[11px] text-ink-3">{(p.media?.mime ?? "file").split("/").pop()?.toUpperCase()}</span>
          </span>
          <DownloadSimple size={18} className="text-ink-3" />
        </a>
        {m.body && <WaText text={m.body} />}
        <Meta m={m} />
      </>,
    );
  } else if (m.type === "location") {
    inner = bubble(
      <>
        <div className="-mx-1 mb-1 flex items-center gap-3 rounded-xl bg-ink/[0.06] p-3">
          <MapPin size={22} className="text-danger" weight="fill" />
          <div className="min-w-0 text-[13px]">
            <p className="font-medium">{p.location?.name ?? "Shared location"}</p>
            {p.location?.address && <p className="truncate text-ink-3">{p.location.address}</p>}
          </div>
        </div>
        <Meta m={m} />
      </>,
    );
  } else if (m.type === "button") {
    inner = bubble(
      <>
        <p className="mb-0.5 flex items-center gap-1 text-[11px] text-ink-3">
          <ArrowBendUpLeft size={12} /> {p.reply?.kind === "list" ? "Chose from list" : "Tapped a button"}
        </p>
        <span className="font-medium">{m.body}</span>
        <Meta m={m} />
      </>,
    );
  } else if (m.type === "interactive") {
    const i = p.interactive;
    inner = (
      <div className={cn("flex max-w-[min(78%,420px)] flex-col gap-0.5", out && "items-end")}>
        {bubble(
          <>
            <WaText text={m.body ?? i?.body ?? ""} />
            <Meta m={m} />
          </>,
        )}
        {i?.kind === "buttons" &&
          i.buttons.map((b) => (
            <div key={b.id} className="flex w-full min-w-48 items-center justify-center gap-1.5 rounded-lg bg-bubble-in px-3 py-2 text-[13px] font-medium text-info shadow-[0_1px_0.5px_rgba(0,0,0,0.1)]">
              <ArrowBendUpLeft size={14} /> {b.title}
            </div>
          ))}
        {i?.kind === "list" && (
          <div className="flex w-full min-w-48 items-center justify-center gap-1.5 rounded-lg bg-bubble-in px-3 py-2 text-[13px] font-medium text-info shadow-[0_1px_0.5px_rgba(0,0,0,0.1)]">
            <ListBullets size={14} /> {i.button}
          </div>
        )}
        {i?.kind === "cta_url" && (
          <div className="flex w-full min-w-48 items-center justify-center gap-1.5 rounded-lg bg-bubble-in px-3 py-2 text-[13px] font-medium text-info shadow-[0_1px_0.5px_rgba(0,0,0,0.1)]">
            <ArrowSquareOut size={14} /> {i.display_text}
          </div>
        )}
      </div>
    );
  } else if (m.type === "reaction") {
    inner = bubble(<span className="text-lg">{m.body}</span>);
  } else if (m.type === "unsupported") {
    inner = bubble(<span className="italic text-ink-3">This message type isn&apos;t supported yet.</span>);
  } else {
    // text, and templates whose definition is gone
    inner = bubble(
      <>
        {m.type === "template" && <p className="mb-1 text-[11px] text-ink-3">Template · {tplMeta?.name}</p>}
        <WaText text={m.body ?? ""} />
        <Meta m={m} />
      </>,
    );
  }

  return (
    <div className={cn("flex w-full flex-col", out ? "items-end" : "items-start")}>
      {out && showAuthor && author && (
        <span className="mb-0.5 mr-1 flex items-center gap-1 text-[11px] text-ink-3">
          <User size={11} /> {author}
        </span>
      )}
      <div className={cn("flex w-full", out ? "justify-end" : "justify-start")}>{inner}</div>
      {m.status === "failed" && (
        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-danger">
          <WarningCircle size={14} weight="fill" />
          <Tooltip content={waErrorInfo(m.error_code).hint}>
            <span className="cursor-help underline decoration-dotted underline-offset-2">{waErrorInfo(m.error_code).title}</span>
          </Tooltip>
          {onRetry && (
            <button type="button" onClick={() => onRetry(m)} className="font-medium underline underline-offset-2">
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
