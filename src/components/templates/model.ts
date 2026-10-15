import { LIMITS, emptyContent, validateTemplate, varIndexes, type Issue } from "@/lib/shared/template";
import type { CarouselCard, MediaFormat, Template, TemplateButton, TemplateCategory, TemplateContent, TemplateHeader } from "@/lib/shared/types";

/* ───────── editor-only shapes: every button/card carries a stable key for list animation ───────── */

export type Keyed<T> = T & { _k?: string };
export type EButton = Keyed<TemplateButton>;
export type ECard = Omit<CarouselCard, "buttons"> & { _k?: string; buttons: EButton[] };
export type EContent = Omit<TemplateContent, "buttons" | "cards"> & { buttons: EButton[]; cards?: ECard[] };

export type ButtonType = TemplateButton["type"];
export type Format = "TEXT" | MediaFormat | "CAROUSEL";

export interface Draft {
  name: string;
  language: string;
  category: TemplateCategory;
  content: EContent;
}

let seq = 0;
export const uid = () => `k${++seq}`;

export function withKeys(c: TemplateContent): EContent {
  return {
    ...c,
    buttons: c.buttons.map((b) => ({ ...b, _k: uid() })),
    cards: c.cards?.map((card) => ({ ...card, _k: uid(), buttons: card.buttons.map((b) => ({ ...b, _k: uid() })) })),
  };
}

const bare = <T extends { _k?: string }>(o: T): Omit<T, "_k"> => {
  const { _k: _ignored, ...rest } = o;
  return rest;
};

/** Plain API shape, with empties normalised so the dirty check and the validator see what the server will see. */
export function toContent(c: EContent): TemplateContent {
  const isCarousel = !!c.cards?.length;
  const maxVar = (s: string) => Math.max(0, ...varIndexes(s));
  const examples = (text: string, list: string[]) => Array.from({ length: maxVar(text) }, (_, i) => (list[i] ?? "").trim());

  let header: TemplateHeader | null = null;
  if (!isCarousel && c.header) {
    const h = c.header;
    if (h.format === "TEXT") {
      header = { format: "TEXT", text: h.text, ...(varIndexes(h.text).length ? { example: (h.example ?? "").trim() } : {}) };
    } else {
      header = { format: h.format, ...(h.media_url ? { media_url: h.media_url } : {}), ...(h.handle ? { handle: h.handle } : {}), ...(h.format === "DOCUMENT" && h.filename ? { filename: h.filename } : {}) };
    }
  }
  const body = c.body.trim();
  const footer = !isCarousel && c.footer?.trim() ? c.footer.trim() : null;
  const out: TemplateContent = {
    header,
    body,
    body_examples: examples(body, c.body_examples),
    footer,
    buttons: isCarousel ? [] : c.buttons.map((b) => bare(b) as TemplateButton),
  };
  if (isCarousel) {
    out.cards = c.cards!.map((card) => ({
      media_format: card.media_format,
      ...(card.media_url ? { media_url: card.media_url } : {}),
      ...(card.handle ? { handle: card.handle } : {}),
      body: card.body.trim(),
      body_examples: examples(card.body.trim(), card.body_examples),
      buttons: card.buttons.map((b) => bare(b) as TemplateButton),
    }));
  }
  return out;
}

export function blankDraft(): Draft {
  return { name: "", language: "en", category: "MARKETING", content: withKeys(emptyContent()) };
}

export function fromTemplate(t: Template): Draft {
  return { name: t.name, language: t.language, category: t.category, content: withKeys(t.content) };
}

export const snapshot = (d: Draft) => JSON.stringify({ n: d.name, l: d.language, c: d.category, x: toContent(d.content) });

export function formatOf(c: EContent): Format {
  if (c.cards?.length) return "CAROUSEL";
  return c.header ? c.header.format : "TEXT";
}

export function isPristine(d: Draft): boolean {
  const c = d.content;
  return !d.name && !c.body && !c.header && !c.footer && !c.buttons.length && !c.cards?.length;
}

/* ───────── buttons ───────── */

export function makeButton(type: ButtonType): EButton {
  const _k = uid();
  switch (type) {
    case "QUICK_REPLY":
      return { type, text: "", _k };
    case "URL":
      return { type, text: "", url: "", _k };
    case "PHONE_NUMBER":
      return { type, text: "", phone_number: "", _k };
    case "COPY_CODE":
      return { type, example: "", _k };
  }
}

export const BUTTON_LABEL: Record<ButtonType, string> = {
  QUICK_REPLY: "Quick reply",
  URL: "Link",
  PHONE_NUMBER: "Call",
  COPY_CODE: "Copy offer code",
};

export function countOf(list: EButton[], type: ButtonType) {
  return list.filter((b) => b.type === type).length;
}

/** Why a button type can't be added right now (null = it can). */
export function addBlocker(list: EButton[], type: ButtonType, maxTotal: number): string | null {
  if (list.length >= maxTotal) return `A ${maxTotal === LIMITS.cardButtons ? "card" : "template"} can have at most ${maxTotal} buttons.`;
  if (type === "URL" && countOf(list, "URL") >= LIMITS.buttonsUrl) return `WhatsApp allows up to ${LIMITS.buttonsUrl} link buttons.`;
  if (type === "PHONE_NUMBER" && countOf(list, "PHONE_NUMBER") >= LIMITS.buttonsPhone) return "WhatsApp allows one call button.";
  if (type === "COPY_CODE" && countOf(list, "COPY_CODE") >= LIMITS.buttonsCopy) return "WhatsApp allows one copy-code button.";
  return null;
}

/** Insert so quick replies stay grouped: next to their own kind, otherwise at the end. */
export function insertButton(list: EButton[], b: EButton): EButton[] {
  const same = (x: EButton) => (x.type === "QUICK_REPLY") === (b.type === "QUICK_REPLY");
  let at = list.length;
  for (let i = list.length - 1; i >= 0; i--) {
    if (same(list[i])) {
      at = i + 1;
      break;
    }
  }
  return [...list.slice(0, at), b, ...list.slice(at)];
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export function patchButton(b: EButton, patch: Record<string, unknown>): EButton {
  return { ...b, ...patch } as EButton;
}

/** A copy of a button for another carousel card: same type and label, link left blank to be filled per card. */
export function cloneButtonForCard(b: EButton): EButton {
  const base = { ...b, _k: uid() } as EButton;
  if (base.type === "URL") return { ...base, url: "", example: undefined };
  return base;
}

export function cloneCard(c: ECard): ECard {
  return { ...c, _k: uid(), handle: undefined, buttons: c.buttons.map((b) => ({ ...b, _k: uid() }) as EButton), body_examples: [...c.body_examples] };
}

export function blankCard(format: "IMAGE" | "VIDEO", like?: EButton[]): ECard {
  return {
    _k: uid(),
    media_format: format,
    body: "",
    body_examples: [],
    buttons: like?.length ? like.map(cloneButtonForCard) : [makeButton("URL")],
  };
}

/* ───────── validation ───────── */

export interface DraftIssue extends Issue {
  /** came from the server rather than the local validator */
  server?: boolean;
}

function looksLikeUrl(u: string) {
  try {
    const parsed = new URL(u.replace(/\{\{\s*\d+\s*\}\}/g, "x"));
    return /^https?:$/.test(parsed.protocol) && parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

/** The shared validator plus a few checks it doesn't make (blank links, duplicate names, opt-out advice). */
export function collectIssues(d: Draft, opts: { optout: string; taken: boolean; takenLanguage: string }): Issue[] {
  const content = toContent(d.content);
  const issues = validateTemplate({ name: d.name, category: d.category, content });
  const has = (path: string) => issues.some((i) => i.path === path && i.level === "error");

  if (d.name && opts.taken && !has("name")) issues.push({ path: "name", level: "error", message: `A template named “${d.name}” already exists in ${opts.takenLanguage}.` });

  const checkLinks = (buttons: TemplateButton[], prefix: string) =>
    buttons.forEach((b, i) => {
      const p = `${prefix}.${i}`;
      if (b.type === "URL" && /^https?:\/\//i.test(b.url) && !looksLikeUrl(b.url) && !has(p))
        issues.push({ path: p, level: "error", message: "Enter a complete link, for example https://example.com/offer." });
    });
  if (!content.cards?.length) checkLinks(content.buttons, "buttons");
  content.cards?.forEach((c, ci) => checkLinks(c.buttons, `cards.${ci}.buttons`));

  if (d.category === "MARKETING" && !content.cards?.length && !content.footer)
    issues.push({ path: "footer", level: "warning", message: `Marketing messages should let people opt out. A footer such as “${opts.optout}” is the usual way.` });

  return issues;
}

export const errorsOf = (issues: Issue[]) => issues.filter((i) => i.level === "error");
export const warningsOf = (issues: Issue[]) => issues.filter((i) => i.level === "warning");

/** Slug while typing: lowercase, anything else becomes one underscore. Edges are trimmed on blur. */
export function liveSlug(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+/, "");
}
export const finalSlug = (v: string) => liveSlug(v).replace(/_+$/, "");

/** Which on-page section holds a validator path. */
export function sectionOf(path: string): string {
  if (path === "name") return "sec-basics";
  if (path.startsWith("header")) return "sec-format";
  if (path.startsWith("body")) return "sec-body";
  if (path === "footer") return "sec-body";
  if (path.startsWith("buttons")) return "sec-buttons";
  if (path.startsWith("cards")) return "sec-cards";
  return "sec-basics";
}

export function cardIndexOf(path: string): number | null {
  const m = /^cards\.(\d+)/.exec(path);
  return m ? Number(m[1]) : null;
}
