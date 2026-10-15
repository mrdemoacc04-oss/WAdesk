import * as React from "react";
import { cn } from "@/lib/shared/utils";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** WhatsApp inline formatting → safe HTML. Input is escaped first; only our own tags are emitted. */
export function waHtml(text: string, resolve?: (n: number) => string | undefined, highlight = true): string {
  const vars: string[] = [];
  let s = esc(text).replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const v = resolve?.(Number(n));
    const shown = v !== undefined && v !== "" ? esc(v) : `{{${n}}}`;
    vars.push(highlight ? `<span class="wa-var">${shown}</span>` : shown);
    return `\u0000${vars.length - 1}\u0000`;
  });
  s = s
    .replace(/```([\s\S]+?)```/g, "<code>$1</code>")
    .replace(/(^|[\s(>])\*([^\s*](?:[^*\n]*?[^\s*])?)\*(?=$|[\s).,!?:;<])/g, "$1<strong>$2</strong>")
    .replace(/(^|[\s(>])_([^\s_](?:[^_\n]*?[^\s_])?)_(?=$|[\s).,!?:;<])/g, "$1<em>$2</em>")
    .replace(/(^|[\s(>])~([^\s~](?:[^~\n]*?[^\s~])?)~(?=$|[\s).,!?:;<])/g, "$1<s>$2</s>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<span class="text-info underline decoration-info/40 underline-offset-2">$1</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => vars[Number(i)]);
}

export function WaText({
  text,
  resolve,
  highlight = true,
  className,
}: {
  text: string;
  resolve?: (n: number) => string | undefined;
  highlight?: boolean;
  className?: string;
}) {
  return <span className={cn("wa-text whitespace-pre-wrap break-words", className)} dangerouslySetInnerHTML={{ __html: waHtml(text, resolve, highlight) }} />;
}
