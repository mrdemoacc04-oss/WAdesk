/* Shared helpers for the Campaigns section (list, wizard, detail). Client-safe: no server imports. */
import type {
  AudienceSpec,
  Campaign,
  CampaignMessage,
  CampaignStatus,
  Segment,
  TemplateButton,
  TemplateContent,
  VarSource,
} from "@/lib/shared/types";
import { resolveSource, templateSlots, type VarSlot } from "@/lib/shared/template";
import { ago, fmtNum, shortDate } from "@/lib/shared/utils";
import { waErrorInfo } from "@/lib/shared/wa-errors";

/* ───────── sending speed (mirrors THROTTLE_PRESETS on the server) ───────── */

export const SPEEDS = [
  { value: 120, label: "Gentle", hint: "2 / sec", note: "Easiest on a new number" },
  { value: 600, label: "Steady", hint: "10 / sec", note: "A good default" },
  { value: 1800, label: "Fast", hint: "30 / sec", note: "For time-sensitive offers" },
  { value: 4800, label: "Max", hint: "80 / sec", note: "Needs a high messaging tier" },
] as const;

export function speedOf(perMin: number) {
  return SPEEDS.find((s) => s.value === perMin);
}

export function speedText(perMin: number) {
  const s = speedOf(perMin);
  return s ? `${s.label} · ${s.hint}` : `${fmtNum(perMin)} / min`;
}

export function duration(count: number, perMin: number): string {
  if (!count) return "—";
  const mins = count / Math.max(perMin, 1);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `about ${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `about ${h} h ${m} min` : `about ${h} h`;
}

/* ───────── audience ───────── */

const RETARGET_LABEL: Record<NonNullable<AudienceSpec["retarget"]>, string> = {
  not_read: "who didn’t read it",
  not_delivered: "who didn’t get it",
  failed: "whose message failed",
  read_no_reply: "who read it but didn’t reply",
};

export function retargetLabel(r: AudienceSpec["retarget"]) {
  return r ? RETARGET_LABEL[r] : "";
}

export function audienceSummary(a: AudienceSpec, segments?: Segment[]): string {
  switch (a.mode) {
    case "all":
      return "All opted-in contacts";
    case "segment": {
      const s = segments?.find((x) => x.id === a.segment_id);
      return s ? `Segment · ${s.name}` : "A saved segment";
    }
    case "tags": {
      const t = a.tags ?? [];
      if (!t.length) return "Contacts with tags";
      return `Tagged ${t.join(a.tag_match === "all" ? " and " : " or ")}`;
    }
    case "contacts":
      return `${fmtNum(a.contact_ids?.length ?? 0)} hand-picked contacts`;
    case "retarget":
      return `Follow-up · people ${retargetLabel(a.retarget)}`;
  }
}

export function audienceRefinements(a: AudienceSpec): string[] {
  const out: string[] = [];
  if (a.exclude_tags?.length) out.push(`Excluding ${a.exclude_tags.join(", ")}`);
  if (a.skip_recent_days) out.push(`Skipping anyone messaged in the last ${a.skip_recent_days} day${a.skip_recent_days === 1 ? "" : "s"}`);
  if (a.include_pending) out.push("Including unconfirmed consent");
  return out;
}

/** An audience we can meaningfully count (a half-configured one would otherwise count everybody). */
export function audienceReady(a: AudienceSpec): boolean {
  if (a.mode === "segment") return !!a.segment_id;
  if (a.mode === "tags") return !!a.tags?.length;
  if (a.mode === "contacts") return !!a.contact_ids?.length;
  if (a.mode === "retarget") return !!a.source_campaign_id && !!a.retarget;
  return true;
}

/* ───────── variable mapping ───────── */

export interface PreviewContact {
  name: string | null;
  phone: string;
  email: string | null;
  country: string | null;
  attributes: Record<string, string>;
}

export const SAMPLE_CONTACT: PreviewContact = {
  name: "Aarav Sharma",
  phone: "+919876543210",
  email: "aarav@example.com",
  country: "IN",
  attributes: {},
};

export const SOURCE_OPTIONS: { value: VarSource["source"]; label: string }[] = [
  { value: "name", label: "Contact name" },
  { value: "first_name", label: "First name" },
  { value: "phone", label: "Phone number" },
  { value: "email", label: "Email" },
  { value: "country", label: "Country" },
  { value: "attribute", label: "Custom field…" },
  { value: "static", label: "Fixed text" },
];

function findButton(content: TemplateContent, key: string): TemplateButton | undefined {
  let m = key.match(/^button\.(\d+)\./);
  if (m) return content.buttons[Number(m[1])];
  m = key.match(/^card\.(\d+)\.button\.(\d+)\./);
  if (m) return content.cards?.[Number(m[1])]?.buttons[Number(m[2])];
  return undefined;
}

/** The sample for a link-suffix slot is the full example URL; the campaign only supplies the end of it. */
export function urlSuffixSample(content: TemplateContent, key: string, sample: string): string {
  const b = findButton(content, key);
  if (b?.type === "URL") {
    const prefix = b.url.replace(/\{\{\s*1\s*\}\}$/, "");
    if (prefix && sample.startsWith(prefix)) return sample.slice(prefix.length);
  }
  return sample;
}

function slotText(content: TemplateContent, key: string): string {
  if (key.startsWith("header.") && content.header?.format === "TEXT") return content.header.text;
  const card = key.match(/^card\.(\d+)\.body\./);
  if (card) return content.cards?.[Number(card[1])]?.body ?? "";
  if (key.startsWith("body.")) return content.body;
  return "";
}

/** Does this variable sit where a first name goes ("Hi {{1}},")? */
function looksLikeGreetingName(content: TemplateContent, slot: VarSlot): boolean {
  const n = Number(slot.key.split(".").pop());
  const text = slotText(content, slot.key);
  const idx = text.search(new RegExp(`\\{\\{\\s*${n}\\s*\\}\\}`));
  if (idx < 0) return false;
  const before = text.slice(0, idx).trimEnd();
  const greeting = before === "" || /(^|\s)(hi|hello|hey|dear|namaste|welcome|thanks|thank you)(\s+there)?[\s,!.-]*$/i.test(before);
  return greeting && /^[A-Z][A-Za-z'’-]{1,19}$/.test(slot.sample.trim());
}

export function defaultSource(content: TemplateContent, slot: VarSlot): VarSource {
  const s = slot.sample.trim();
  if (slot.kind === "url") return { source: "static", value: urlSuffixSample(content, slot.key, s) };
  if (slot.kind === "code") return { source: "static", value: s };
  if (looksLikeGreetingName(content, slot)) return { source: "first_name", fallback: "there" };
  if (/^[A-Z][A-Za-z'’-]+(\s[A-Z][A-Za-z'’-]+){1,3}$/.test(s) && looksLikeGreetingName(content, { ...slot, sample: s.split(" ")[0] }))
    return { source: "name", fallback: "there" };
  if (/^\+?\d[\d\s-]{8,}$/.test(s)) return { source: "phone" };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { source: "email" };
  return { source: "static", value: s };
}

export function defaultVariableMap(content: TemplateContent): Record<string, VarSource> {
  const out: Record<string, VarSource> = {};
  for (const s of templateSlots(content)) if (s.kind !== "media") out[s.key] = defaultSource(content, s);
  return out;
}

export interface MappingState {
  variable_map: Record<string, VarSource>;
  media_map: Record<string, string>;
}

/** Is a slot ready to send? Media falls back to the template sample, codes to the sample code. */
export function slotComplete(slot: VarSlot, d: MappingState): boolean {
  if (slot.kind === "media") return !!(d.media_map[slot.key] || slot.sample);
  if (slot.kind === "code") return true;
  const src = d.variable_map[slot.key];
  if (!src) return false;
  if (src.source === "static") return !!src.value.trim();
  if (src.source === "attribute") return !!src.key.trim();
  return true;
}

/** Slot values for TemplateBubble. Anything left out falls back to the template's own sample. */
export function previewValues(slots: VarSlot[], d: MappingState, contact: PreviewContact): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of slots) {
    if (s.kind === "media") {
      if (d.media_map[s.key]) out[s.key] = d.media_map[s.key];
      continue;
    }
    const v = resolveSource(d.variable_map[s.key], contact);
    if (v) out[s.key] = v;
  }
  return out;
}

/* ───────── time zones ───────── */

function zonedParts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

export function isoToZoned(iso: string | null | undefined, tz: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return { date: "", time: "" };
  const p = zonedParts(ms, tz);
  const z = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.y}-${z(p.mo)}-${z(p.d)}`, time: `${z(p.h)}:${z(p.mi)}` };
}

/** Wall-clock date + time in `tz` → ISO instant. */
export function zonedToIso(date: string, time: string, tz: string): string | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = time.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, tz);
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    guess = wall - (asUtc - guess);
  }
  const out = new Date(guess);
  return Number.isNaN(out.getTime()) ? null : out.toISOString();
}

export function fmtZoned(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return shortDate(iso);
  }
}

export function tzAbbrev(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

/* ───────── campaign display ───────── */

export function campaignWhen(c: Campaign): string {
  switch (c.status) {
    case "draft":
      return `Edited ${ago(c.updated_at)}`;
    case "scheduled":
      return c.scheduled_at ? `Sends ${shortDate(c.scheduled_at)}` : "Scheduled";
    case "sending":
      return `Started ${ago(c.started_at ?? c.created_at)}`;
    case "paused":
      return `Paused ${ago(c.updated_at)}`;
    case "completed":
      return `Finished ${ago(c.completed_at ?? c.updated_at)}`;
    case "cancelled":
      return `Cancelled ${ago(c.completed_at ?? c.updated_at)}`;
    case "failed":
      return `Failed ${ago(c.completed_at ?? c.updated_at)}`;
  }
}

export const isRunning = (s: CampaignStatus) => s === "sending" || s === "paused";

/** What a recipient row currently is, from its timestamps. */
export type RecipientState = "replied" | "read" | "delivered" | "sent" | "failed" | "skipped" | "queued";

export function recipientState(m: CampaignMessage): RecipientState {
  if (m.status === "failed") return "failed";
  if (m.status === "skipped") return "skipped";
  if (m.replied_at) return "replied";
  if (m.read_at) return "read";
  if (m.delivered_at) return "delivered";
  if (m.sent_at) return "sent";
  return "queued";
}

/* ───────── delivery problems ───────── */


const EXTRA_ISSUES: Record<string, { title: string; hint: string }> = {
  CANCELLED: { title: "Cancelled before sending", hint: "The campaign was cancelled while this message was still waiting in the queue." },
  DEMO: { title: "Demo contact", hint: "Demo contacts are skipped when WhatsApp is connected live." },
  MISSING_VAR: { title: "A value was missing", hint: "A variable had no value for this contact and no fallback. Add a fallback in the Message step next time." },
};

export function issueInfo(code: string | null | undefined): { title: string; hint: string } {
  const k = String(code ?? "");
  return EXTRA_ISSUES[k] ?? waErrorInfo(k);
}
