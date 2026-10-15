import type {
  CarouselCard,
  Template,
  TemplateButton,
  TemplateCategory,
  TemplateContent,
  VarSource,
} from "./types";
import { firstName } from "./utils";

/* ───────── limits (WhatsApp Business Platform) ───────── */

export const LIMITS = {
  name: 512,
  body: 1024,
  headerText: 60,
  footer: 60,
  buttonText: 25,
  buttonsTotal: 10,
  buttonsUrl: 2,
  buttonsPhone: 1,
  buttonsCopy: 1,
  cardsMin: 2,
  cardsMax: 10,
  cardBody: 160,
  cardButtons: 2,
  interactiveButtons: 3,
  buttonTitle: 20,
  listRows: 10,
  textMessage: 4096,
} as const;

/* ───────── variable helpers ───────── */

const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;

export function varIndexes(text: string | null | undefined): number[] {
  if (!text) return [];
  const out = new Set<number>();
  for (const m of text.matchAll(VAR_RE)) out.add(Number(m[1]));
  return [...out].sort((a, b) => a - b);
}

export function nextVarIndex(text: string): number {
  const v = varIndexes(text);
  return (v[v.length - 1] ?? 0) + 1;
}

export function replaceVars(text: string, resolve: (index: number) => string): string {
  return text.replace(VAR_RE, (_m, n) => resolve(Number(n)));
}

/** Variables must run {{1}}..{{n}} without gaps. */
export function varsAreSequential(text: string): boolean {
  const v = varIndexes(text);
  return v.every((n, i) => n === i + 1);
}

/* ───────── slots: every value a campaign must supply ───────── */

export interface VarSlot {
  key: string;
  label: string;
  where: string;
  kind: "text" | "media" | "url" | "code";
  sample: string;
  mediaFormat?: "IMAGE" | "VIDEO" | "DOCUMENT";
}

export function templateSlots(content: TemplateContent): VarSlot[] {
  const slots: VarSlot[] = [];
  const h = content.header;
  if (h) {
    if (h.format === "TEXT") {
      if (varIndexes(h.text).length)
        slots.push({ key: "header.1", label: "Header variable", where: "Header", kind: "text", sample: h.example ?? "" });
    } else {
      slots.push({
        key: "header.media",
        label: `Header ${h.format.toLowerCase()}`,
        where: "Header",
        kind: "media",
        sample: h.media_url ?? "",
        mediaFormat: h.format,
      });
    }
  }
  for (const n of varIndexes(content.body)) {
    slots.push({
      key: `body.${n}`,
      label: `Body {{${n}}}`,
      where: "Body",
      kind: "text",
      sample: content.body_examples[n - 1] ?? "",
    });
  }
  content.buttons.forEach((b, i) => pushButtonSlots(slots, b, i, "button", "Button"));
  content.cards?.forEach((c, ci) => {
    slots.push({
      key: `card.${ci}.media`,
      label: `Card ${ci + 1} ${c.media_format.toLowerCase()}`,
      where: `Card ${ci + 1}`,
      kind: "media",
      sample: c.media_url ?? "",
      mediaFormat: c.media_format,
    });
    for (const n of varIndexes(c.body)) {
      slots.push({
        key: `card.${ci}.body.${n}`,
        label: `Card ${ci + 1} text {{${n}}}`,
        where: `Card ${ci + 1}`,
        kind: "text",
        sample: c.body_examples[n - 1] ?? "",
      });
    }
    c.buttons.forEach((b, i) => pushButtonSlots(slots, b, i, `card.${ci}.button`, `Card ${ci + 1} button`));
  });
  return slots;
}

function pushButtonSlots(slots: VarSlot[], b: TemplateButton, i: number, prefix: string, where: string) {
  if (b.type === "URL" && varIndexes(b.url).length) {
    slots.push({
      key: `${prefix}.${i}.1`,
      label: `${b.text} link suffix`,
      where,
      kind: "url",
      sample: b.example ?? "",
    });
  }
  if (b.type === "COPY_CODE") {
    slots.push({ key: `${prefix}.${i}.code`, label: "Offer code", where, kind: "code", sample: b.example });
  }
}

/** Resolve a variable source against a contact. Returns null when nothing usable (and no fallback). */
export function resolveSource(
  src: VarSource | undefined,
  contact: { name: string | null; phone: string; email: string | null; country: string | null; attributes: Record<string, string> },
): string | null {
  if (!src) return null;
  let v: string | null | undefined;
  switch (src.source) {
    case "static":
      return src.value || null;
    case "name":
      v = contact.name;
      break;
    case "first_name":
      v = firstName(contact.name);
      break;
    case "phone":
      v = contact.phone;
      break;
    case "email":
      v = contact.email;
      break;
    case "country":
      v = contact.country;
      break;
    case "attribute":
      v = contact.attributes?.[src.key];
      break;
  }
  const out = (v ?? "").toString().trim();
  if (out) return out;
  return src.fallback?.trim() ? src.fallback.trim() : null;
}

/** Meta forbids newlines, tabs and 4+ consecutive spaces inside text parameters. */
export function cleanParam(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
}

/* ───────── send-time component builder ───────── */

function mediaParam(format: "IMAGE" | "VIDEO" | "DOCUMENT", ref: string, filename?: string) {
  const key = format.toLowerCase() as "image" | "video" | "document";
  const obj: Record<string, string> = ref.startsWith("id:") ? { id: ref.slice(3) } : { link: ref };
  if (format === "DOCUMENT" && filename) obj.filename = filename;
  return { type: key, [key]: obj };
}

/**
 * Convert resolved slot values to the `components` array of a Cloud API template send.
 * `values` holds text values and media refs (URL, or "id:<metaMediaId>").
 */
export function buildSendComponents(
  content: TemplateContent,
  values: Record<string, string>,
  payloadPrefix: string,
): any[] {
  const components: any[] = [];
  const h = content.header;
  if (h) {
    if (h.format === "TEXT") {
      if (varIndexes(h.text).length) {
        components.push({ type: "header", parameters: [{ type: "text", text: cleanParam(values["header.1"] ?? "") }] });
      }
    } else {
      const ref = values["header.media"] || h.media_url || "";
      components.push({
        type: "header",
        parameters: [mediaParam(h.format, ref, h.filename)],
      });
    }
  }
  const bodyVars = varIndexes(content.body);
  if (bodyVars.length) {
    components.push({
      type: "body",
      parameters: bodyVars.map((n) => ({ type: "text", text: cleanParam(values[`body.${n}`] ?? "") })),
    });
  }
  pushButtonComponents(components, content.buttons, values, "button", payloadPrefix);
  if (content.cards?.length) {
    components.push({
      type: "carousel",
      cards: content.cards.map((c: CarouselCard, ci) => {
        const cc: any[] = [
          {
            type: "header",
            parameters: [mediaParam(c.media_format, values[`card.${ci}.media`] || c.media_url || "")],
          },
        ];
        const cv = varIndexes(c.body);
        if (cv.length) {
          cc.push({
            type: "body",
            parameters: cv.map((n) => ({ type: "text", text: cleanParam(values[`card.${ci}.body.${n}`] ?? "") })),
          });
        }
        pushButtonComponents(cc, c.buttons, values, `card.${ci}.button`, `${payloadPrefix}:c${ci}`);
        return { card_index: ci, components: cc };
      }),
    });
  }
  return components;
}

function pushButtonComponents(
  out: any[],
  buttons: TemplateButton[],
  values: Record<string, string>,
  prefix: string,
  payloadPrefix: string,
) {
  buttons.forEach((b, i) => {
    if (b.type === "QUICK_REPLY") {
      out.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(i),
        parameters: [{ type: "payload", payload: `${payloadPrefix}:${i}`.slice(0, 256) }],
      });
    } else if (b.type === "URL" && varIndexes(b.url).length) {
      out.push({
        type: "button",
        sub_type: "url",
        index: String(i),
        parameters: [{ type: "text", text: cleanParam(values[`${prefix}.${i}.1`] ?? "") }],
      });
    } else if (b.type === "COPY_CODE") {
      out.push({
        type: "button",
        sub_type: "copy_code",
        index: String(i),
        parameters: [{ type: "coupon_code", coupon_code: cleanParam(values[`${prefix}.${i}.code`] ?? b.example) }],
      });
    }
  });
}

/* ───────── create-time component builder (submit to Meta) ───────── */

function buttonsToMeta(buttons: TemplateButton[]) {
  return buttons.map((b) => {
    switch (b.type) {
      case "QUICK_REPLY":
        return { type: "QUICK_REPLY", text: b.text };
      case "URL": {
        const dyn = varIndexes(b.url).length > 0;
        return dyn
          ? { type: "URL", text: b.text, url: b.url, example: [b.example || b.url.replace(/\{\{\s*1\s*\}\}/, "example")] }
          : { type: "URL", text: b.text, url: b.url };
      }
      case "PHONE_NUMBER":
        return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
      case "COPY_CODE":
        return { type: "COPY_CODE", example: b.example };
    }
  });
}

function bodyToMeta(text: string, examples: string[]) {
  const vars = varIndexes(text);
  const c: any = { type: "BODY", text };
  if (vars.length) c.example = { body_text: [vars.map((n) => examples[n - 1] || `Sample ${n}`)] };
  return c;
}

export function toMetaComponents(content: TemplateContent): any[] {
  const out: any[] = [];
  if (!content.cards?.length) {
    const h = content.header;
    if (h) {
      if (h.format === "TEXT") {
        const c: any = { type: "HEADER", format: "TEXT", text: h.text };
        if (varIndexes(h.text).length) c.example = { header_text: [h.example || "Sample"] };
        out.push(c);
      } else {
        out.push({ type: "HEADER", format: h.format, example: { header_handle: h.handle ? [h.handle] : [] } });
      }
    }
  }
  out.push(bodyToMeta(content.body, content.body_examples));
  if (content.footer?.trim() && !content.cards?.length) out.push({ type: "FOOTER", text: content.footer.trim() });
  if (content.buttons.length && !content.cards?.length) out.push({ type: "BUTTONS", buttons: buttonsToMeta(content.buttons) });
  if (content.cards?.length) {
    out.push({
      type: "CAROUSEL",
      cards: content.cards.map((c) => {
        const comps: any[] = [
          { type: "HEADER", format: c.media_format, example: { header_handle: c.handle ? [c.handle] : [] } },
          bodyToMeta(c.body, c.body_examples),
        ];
        if (c.buttons.length) comps.push({ type: "BUTTONS", buttons: buttonsToMeta(c.buttons) });
        return { components: comps };
      }),
    });
  }
  return out;
}

/** Parse a template as returned by GET /{waba}/message_templates back into our content shape. */
export function fromMetaComponents(components: any[] = []): { content: TemplateContent; kind: "standard" | "carousel" } {
  const content: TemplateContent = { body: "", body_examples: [], buttons: [], header: null, footer: null };
  let kind: "standard" | "carousel" = "standard";
  const parseButtons = (arr: any[]): TemplateButton[] =>
    (arr ?? []).flatMap((b: any): TemplateButton[] => {
      if (b.type === "QUICK_REPLY") return [{ type: "QUICK_REPLY", text: b.text }];
      if (b.type === "URL") return [{ type: "URL", text: b.text, url: b.url, example: Array.isArray(b.example) ? b.example[0] : undefined }];
      if (b.type === "PHONE_NUMBER") return [{ type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number }];
      if (b.type === "COPY_CODE") return [{ type: "COPY_CODE", example: Array.isArray(b.example) ? b.example[0] : (b.example ?? "") }];
      return [];
    });
  for (const c of components) {
    switch (c.type) {
      case "HEADER":
        if (c.format === "TEXT") content.header = { format: "TEXT", text: c.text ?? "", example: c.example?.header_text?.[0] };
        else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(c.format))
          content.header = { format: c.format, media_url: c.example?.header_handle?.[0]?.startsWith?.("http") ? c.example.header_handle[0] : undefined };
        break;
      case "BODY":
        content.body = c.text ?? "";
        content.body_examples = c.example?.body_text?.[0] ?? [];
        break;
      case "FOOTER":
        content.footer = c.text ?? "";
        break;
      case "BUTTONS":
        content.buttons = parseButtons(c.buttons);
        break;
      case "CAROUSEL":
        kind = "carousel";
        content.cards = (c.cards ?? []).map((card: any) => {
          const cc: CarouselCard = { media_format: "IMAGE", body: "", body_examples: [], buttons: [] };
          for (const comp of card.components ?? []) {
            if (comp.type === "HEADER") {
              cc.media_format = comp.format === "VIDEO" ? "VIDEO" : "IMAGE";
              const h = comp.example?.header_handle?.[0];
              if (typeof h === "string" && h.startsWith("http")) cc.media_url = h;
            } else if (comp.type === "BODY") {
              cc.body = comp.text ?? "";
              cc.body_examples = comp.example?.body_text?.[0] ?? [];
            } else if (comp.type === "BUTTONS") cc.buttons = parseButtons(comp.buttons);
          }
          return cc;
        });
        break;
    }
  }
  return { content, kind };
}

/* ───────── validation ───────── */

export interface Issue {
  path: string;
  message: string;
  level: "error" | "warning";
}

export function validateTemplate(t: {
  name: string;
  category: TemplateCategory;
  content: TemplateContent;
}): Issue[] {
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message, level: "error" });
  const warn = (path: string, message: string) => issues.push({ path, message, level: "warning" });
  const c = t.content;

  if (!t.name.trim()) err("name", "Give the template a name.");
  else if (!/^[a-z0-9_]+$/.test(t.name)) err("name", "Use lowercase letters, numbers and underscores only.");
  else if (t.name.length > LIMITS.name) err("name", "Name is too long.");

  const isCarousel = !!c.cards?.length;

  if (!c.body.trim()) err("body", "Body text is required.");
  if (c.body.length > LIMITS.body) err("body", `Body is ${c.body.length}/${LIMITS.body} characters.`);
  if (!varsAreSequential(c.body)) err("body", "Variables must be numbered {{1}}, {{2}}, … without gaps.");
  const bv = varIndexes(c.body);
  if (bv.length) {
    if (/^\s*\{\{/.test(c.body) || /\}\}[\s.!?]*$/.test(c.body))
      err("body", "Body can't start or end with a variable — add some text around it.");
    bv.forEach((n) => {
      if (!c.body_examples[n - 1]?.trim()) err(`body.example.${n}`, `Add a sample value for {{${n}}}.`);
    });
    if (c.body.replace(/\{\{\s*\d+\s*\}\}/g, "").trim().length < bv.length * 12)
      warn("body", "Too many variables for the amount of text — Meta may reject it.");
  }

  const h = c.header;
  if (h && !isCarousel) {
    if (h.format === "TEXT") {
      if (!h.text.trim()) err("header", "Header text is empty.");
      if (h.text.length > LIMITS.headerText) err("header", `Header is ${h.text.length}/${LIMITS.headerText} characters.`);
      if (varIndexes(h.text).length > 1) err("header", "Header text allows only one variable.");
      if (varIndexes(h.text).length && !h.example?.trim()) err("header.example", "Add a sample value for the header variable.");
    } else if (!h.media_url && !h.handle) {
      err("header", `Upload a sample ${h.format.toLowerCase()} for the header.`);
    }
  }

  if (c.footer && !isCarousel) {
    if (c.footer.length > LIMITS.footer) err("footer", `Footer is ${c.footer.length}/${LIMITS.footer} characters.`);
    if (varIndexes(c.footer).length) err("footer", "Footer can't contain variables.");
  }

  if (!isCarousel) validateButtons(c.buttons, "buttons", err, true);

  if (isCarousel) {
    const cards = c.cards!;
    if (cards.length < LIMITS.cardsMin) err("cards", `A carousel needs at least ${LIMITS.cardsMin} cards.`);
    if (cards.length > LIMITS.cardsMax) err("cards", `A carousel allows at most ${LIMITS.cardsMax} cards.`);
    const fmt = cards[0]?.media_format;
    const sig = (b: TemplateButton[]) => b.map((x) => x.type).join(",");
    const firstSig = cards[0] ? sig(cards[0].buttons) : "";
    cards.forEach((card, i) => {
      if (card.media_format !== fmt) err(`cards.${i}`, "All cards must use the same media type (all images or all videos).");
      if (!card.media_url && !card.handle) err(`cards.${i}.media`, `Card ${i + 1}: add a sample ${card.media_format.toLowerCase()}.`);
      if (!card.body.trim()) err(`cards.${i}.body`, `Card ${i + 1}: add text.`);
      if (card.body.length > LIMITS.cardBody) err(`cards.${i}.body`, `Card ${i + 1} text is ${card.body.length}/${LIMITS.cardBody}.`);
      if (!varsAreSequential(card.body)) err(`cards.${i}.body`, `Card ${i + 1}: variables must be sequential.`);
      varIndexes(card.body).forEach((n) => {
        if (!card.body_examples[n - 1]?.trim()) err(`cards.${i}.example.${n}`, `Card ${i + 1}: add a sample for {{${n}}}.`);
      });
      if (card.buttons.length > LIMITS.cardButtons) err(`cards.${i}.buttons`, `Card ${i + 1}: max ${LIMITS.cardButtons} buttons.`);
      if (!card.buttons.length) err(`cards.${i}.buttons`, `Card ${i + 1}: add at least one button.`);
      if (sig(card.buttons) !== firstSig) err(`cards.${i}.buttons`, "Every card needs the same button types in the same order.");
      validateButtons(card.buttons, `cards.${i}.buttons`, err, false);
    });
  }

  return issues;
}

function validateButtons(
  buttons: TemplateButton[],
  path: string,
  err: (p: string, m: string) => void,
  allowCopy: boolean,
) {
  if (buttons.length > LIMITS.buttonsTotal) err(path, `Max ${LIMITS.buttonsTotal} buttons.`);
  const count = (t: TemplateButton["type"]) => buttons.filter((b) => b.type === t).length;
  if (count("URL") > LIMITS.buttonsUrl) err(path, `Max ${LIMITS.buttonsUrl} link buttons.`);
  if (count("PHONE_NUMBER") > LIMITS.buttonsPhone) err(path, `Max ${LIMITS.buttonsPhone} call button.`);
  if (count("COPY_CODE") > LIMITS.buttonsCopy) err(path, `Max ${LIMITS.buttonsCopy} copy-code button.`);
  if (!allowCopy && count("COPY_CODE")) err(path, "Copy-code buttons aren't available on carousel cards.");
  buttons.forEach((b, i) => {
    const p = `${path}.${i}`;
    if (b.type !== "COPY_CODE") {
      if (!b.text.trim()) err(p, "Button text is required.");
      if (b.text.length > LIMITS.buttonText) err(p, `Button text is ${b.text.length}/${LIMITS.buttonText}.`);
    }
    if (b.type === "URL") {
      if (!/^https?:\/\//i.test(b.url)) err(p, "Link must start with https://");
      const v = varIndexes(b.url);
      if (v.length > 1 || (v.length === 1 && v[0] !== 1)) err(p, "Link allows a single {{1}} at the end.");
      if (v.length && !/\{\{\s*1\s*\}\}$/.test(b.url)) err(p, "Put {{1}} at the very end of the link.");
      if (v.length && !b.example?.trim()) err(p, "Add an example full URL for the dynamic link.");
    }
    if (b.type === "PHONE_NUMBER" && !/^\+\d{7,15}$/.test(b.phone_number.replace(/[\s-]/g, "")))
      err(p, "Phone must be international format, e.g. +919876543210.");
    if (b.type === "COPY_CODE" && (!b.example.trim() || b.example.length > 15)) err(p, "Offer code example is required (max 15 chars).");
  });
  // Meta wants quick replies grouped together
  const types = buttons.map((b) => b.type === "QUICK_REPLY");
  const transitions = types.reduce((n, cur, i) => (i && cur !== types[i - 1] ? n + 1 : n), 0);
  if (transitions > 1) err(path, "Keep quick-reply buttons together, before or after the other buttons.");
}

/* ───────── display helpers ───────── */

export function previewText(text: string, sampleFor: (n: number) => string): string {
  return replaceVars(text, (n) => sampleFor(n) || `{{${n}}}`);
}

export function templateSummary(t: Pick<Template, "content">): string {
  return t.content.body.replace(/\s+/g, " ").trim();
}

export function newCard(format: "IMAGE" | "VIDEO" = "IMAGE"): CarouselCard {
  return { media_format: format, body: "", body_examples: [], buttons: [{ type: "URL", text: "Shop now", url: "https://" }] };
}

export function emptyContent(): TemplateContent {
  return { header: null, body: "", body_examples: [], footer: null, buttons: [] };
}
