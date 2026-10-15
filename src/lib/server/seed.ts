import { defaultSettings } from "@/lib/shared/constants";
import type {
  AutomationRule,
  Campaign,
  CampaignMessage,
  Contact,
  Conversation,
  Message,
  Segment,
  Template,
  TemplateContent,
  VarSource,
} from "@/lib/shared/types";

/* Demo data for local mode. Everything is generated relative to "now" so the workspace always looks lived-in.
   Sample contacts use source "demo": a live WhatsApp connection refuses to message them. */

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Reyansh", "Ishaan", "Krishna", "Rohan", "Kabir", "Dev", "Ananya", "Diya", "Saanvi", "Aadhya", "Myra", "Kiara", "Meera", "Priya", "Neha", "Riya", "Sneha", "Pooja", "Kavya", "Isha", "Tanvi", "Nikhil", "Siddharth", "Rahul", "Vikram", "Amit", "Sanjay", "Deepak", "Manish", "Harsh", "Yash", "Ritu", "Sonal", "Divya", "Anjali", "Swati", "Farhan", "Imran", "Zoya", "Aisha", "Gurpreet", "Harpreet", "Lakshmi", "Venkat", "Karthik", "Suresh"];
const LAST = ["Sharma", "Verma", "Patel", "Mehta", "Iyer", "Nair", "Reddy", "Rao", "Gupta", "Agarwal", "Singh", "Kapoor", "Khan", "Shah", "Desai", "Joshi", "Kulkarni", "Banerjee", "Chatterjee", "Das", "Bose", "Menon", "Pillai", "Bhatia", "Malhotra", "Chopra", "Jain", "Saxena", "Mishra", "Pandey"];
const CITIES = ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Pune", "Chennai", "Kolkata", "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Kochi", "Indore", "Guwahati"];
const TAGS = ["customer", "lead", "vip", "webinar", "diwali-sale", "newsletter", "wholesale", "retail", "cart-abandoner", "repeat-buyer"];
const PLANS = ["Starter", "Growth", "Scale"];

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const DEMO_IDS = { ws: "00000000-0000-4000-8000-00000000d3a0", owner: "00000000-0000-4000-8000-0000000000a1", admin: "00000000-0000-4000-8000-0000000000a2", agent: "00000000-0000-4000-8000-0000000000a3" };

export function seedLocal(t: Record<string, any[]>) {
  const r = mulberry(20261015);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const id = () => crypto.randomUUID();
  const ws = DEMO_IDS.ws;

  /* ── workspace + team ── */
  const settings = defaultSettings();
  settings.sim_ambient = true;
  t.workspaces.push({ id: ws, name: "DigiBind Media", settings, created_at: iso(now - 120 * DAY) });
  const members = [
    { user_id: DEMO_IDS.owner, role: "owner", name: "Dhrubajit", email: "owner@wadesk.local", color: "#0e8a52" },
    { user_id: DEMO_IDS.admin, role: "admin", name: "Priya Nair", email: "priya@wadesk.local", color: "#6b5bd6" },
    { user_id: DEMO_IDS.agent, role: "agent", name: "Aarav Mehta", email: "aarav@wadesk.local", color: "#c2693a" },
  ];
  members.forEach((m, i) => t.workspace_members.push({ id: id(), workspace_id: ws, created_at: iso(now - (110 - i) * DAY), ...m }));

  t.wa_accounts.push({
    id: id(),
    workspace_id: ws,
    phone_number_id: "108204567890123",
    waba_id: "204567890123456",
    app_id: null,
    display_phone_number: "+91 80000 12345",
    verified_name: "DigiBind Media",
    quality_rating: "GREEN",
    messaging_limit_tier: "TIER_10K",
    status: "connected",
    status_message: "Demo connection — messages are simulated",
    webhook_verify_token: "wadesk_demo_verify_token",
    last_checked_at: iso(now - 4 * MIN),
    created_at: iso(now - 100 * DAY),
  });

  /* ── tags ── */
  TAGS.forEach((name) => t.tags.push({ id: id(), workspace_id: ws, name, created_at: iso(now - 90 * DAY) }));

  /* ── contacts ── */
  const contacts: Contact[] = [];
  for (let i = 0; i < 140; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const name = `${first} ${last}`;
    const roll = r();
    const opt = roll < 0.8 ? "opted_in" : roll < 0.9 ? "pending" : "opted_out";
    const age = Math.floor(Math.pow(r(), 1.6) * 88 * DAY);
    const tags = new Set<string>();
    if (r() < 0.55) tags.add("customer");
    if (r() < 0.4) tags.add("lead");
    if (r() < 0.18) tags.add("vip");
    if (r() < 0.25) tags.add("webinar");
    if (r() < 0.3) tags.add("diwali-sale");
    if (r() < 0.2) tags.add("newsletter");
    if (r() < 0.12) tags.add("wholesale");
    if (r() < 0.22) tags.add("repeat-buyer");
    if (r() < 0.1) tags.add("cart-abandoner");
    if (!tags.size) tags.add("lead");
    const created = iso(now - age);
    contacts.push({
      id: id(),
      workspace_id: ws,
      phone: `+9198${String(10_000_000 + i * 7919).padStart(8, "0")}`,
      name,
      email: r() < 0.6 ? `${first}.${last}`.toLowerCase() + "@example.com" : null,
      country: "IN",
      tags: [...tags],
      attributes: { city: pick(CITIES), plan: pick(PLANS), ...(r() < 0.4 ? { company: `${last} ${pick(["Traders", "Studios", "Labs", "& Co", "Retail"])}` } : {}) },
      opt_in: opt,
      opt_in_source: opt === "opted_in" ? pick(["import", "web_form", "manual"]) : opt === "opted_out" ? "whatsapp_keyword" : null,
      opted_in_at: opt === "opted_in" ? created : null,
      opted_out_at: opt === "opted_out" ? iso(now - Math.floor(r() * 20) * DAY) : null,
      source: "demo",
      notes: null,
      last_inbound_at: null,
      last_outbound_at: null,
      created_at: created,
      updated_at: created,
    } as Contact);
  }
  t.contacts.push(...contacts);
  const eligible = contacts.filter((c) => c.opt_in === "opted_in");

  /* ── templates ── */
  const tpl = (
    name: string,
    category: Template["category"],
    status: Template["status"],
    content: TemplateContent,
    extra: Partial<Template> = {},
    daysAgo = 30,
  ): Template => {
    const row = {
      id: id(),
      workspace_id: ws,
      name,
      language: "en",
      category,
      status,
      kind: content.cards?.length ? "carousel" : "standard",
      content,
      rejection_reason: null,
      meta_template_id: status === "DRAFT" ? null : String(900000000000000 + Math.floor(r() * 99999999999)),
      quality: status === "APPROVED" ? "GREEN" : null,
      submitted_at: status === "DRAFT" ? null : iso(now - daysAgo * DAY),
      created_at: iso(now - (daysAgo + 1) * DAY),
      updated_at: iso(now - daysAgo * DAY),
      ...extra,
    } as Template;
    t.templates.push(row);
    return row;
  };

  tpl("welcome_onboarding", "UTILITY", "APPROVED", {
    body: "Hi {{1}}, welcome to DigiBind Media! 👋 We're glad to have you. Tap below to explore what we can do for your brand.",
    body_examples: ["Aarav"],
    footer: "Reply STOP to opt out",
    buttons: [{ type: "QUICK_REPLY", text: "Browse services" }, { type: "QUICK_REPLY", text: "Talk to a human" }],
  }, {}, 60);

  const tDiwali = tpl("diwali_mega_sale", "MARKETING", "APPROVED", {
    header: { format: "IMAGE", media_url: "/demo/diwali.svg" },
    body: "Hi {{1}}, our Diwali Mega Sale is live! 🪔 Enjoy flat {{2}} off on all packages till 31st October. Your VIP code is waiting inside.",
    body_examples: ["Aarav", "25%"],
    footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Claim offer", url: "https://digibind.media/diwali" }, { type: "QUICK_REPLY", text: "Not interested" }],
  }, {}, 14);

  const tOrder = tpl("order_shipped", "UTILITY", "APPROVED", {
    body: "Hello {{1}}, your order #{{2}} has been shipped and will reach you in 2–3 days. You can track it anytime from the link below.",
    body_examples: ["Aarav", "48217"],
    footer: null,
    buttons: [{ type: "URL", text: "Track order", url: "https://digibind.media/track/{{1}}", example: "https://digibind.media/track/48217" }],
  }, {}, 45);

  const tWebinar = tpl("webinar_invite", "MARKETING", "APPROVED", {
    header: { format: "VIDEO", media_url: "/demo/webinar.svg" },
    body: "{{1}}, join our free live webinar: *Scale your business with WhatsApp* on {{2}}. Seats are limited — reserve yours now.",
    body_examples: ["Aarav", "Sat, 24 Oct · 6 PM IST"],
    footer: "Free for DigiBind customers",
    buttons: [{ type: "QUICK_REPLY", text: "Register me" }, { type: "URL", text: "Details", url: "https://digibind.media/webinar" }],
  }, {}, 11);

  const tCarousel = tpl("autumn_arrivals_carousel", "MARKETING", "APPROVED", {
    body: "Hi {{1}}, our Autumn collection just dropped 🍂 Swipe through the new arrivals and tap to shop your favourites.",
    body_examples: ["Aarav"],
    buttons: [],
    cards: [
      { media_format: "IMAGE", media_url: "/demo/card-1.svg", body: "Heritage Weave Jacket · now ₹3,499", body_examples: [], buttons: [{ type: "URL", text: "Shop now", url: "https://digibind.media/shop/jacket" }, { type: "QUICK_REPLY", text: "Tell me more" }] },
      { media_format: "IMAGE", media_url: "/demo/card-2.svg", body: "Studio Linen Shirt · now ₹1,899", body_examples: [], buttons: [{ type: "URL", text: "Shop now", url: "https://digibind.media/shop/shirt" }, { type: "QUICK_REPLY", text: "Tell me more" }] },
      { media_format: "IMAGE", media_url: "/demo/card-3.svg", body: "Midnight Chino · now ₹2,299", body_examples: [], buttons: [{ type: "URL", text: "Shop now", url: "https://digibind.media/shop/chino" }, { type: "QUICK_REPLY", text: "Tell me more" }] },
    ],
  }, {}, 7);

  const tCoupon = tpl("coupon_code_drop", "MARKETING", "APPROVED", {
    body: "Hi {{1}}, here's a little thank-you: use the code below at checkout for 15% off your next order. Valid for 48 hours ⏳",
    body_examples: ["Aarav"],
    footer: "Terms apply",
    buttons: [{ type: "COPY_CODE", example: "THANKS15" }],
  }, {}, 20);

  tpl("catalogue_2026", "MARKETING", "APPROVED", {
    header: { format: "DOCUMENT", media_url: "/demo/catalogue.pdf", filename: "DigiBind-Catalogue-2026.pdf" },
    body: "Hi {{1}}, as promised, here's our latest catalogue with pricing and packages. Let us know which one catches your eye!",
    body_examples: ["Aarav"],
    footer: null,
    buttons: [{ type: "PHONE_NUMBER", text: "Call sales", phone_number: "+918000012345" }],
  }, {}, 25);

  tpl("cart_reminder", "MARKETING", "PENDING", {
    body: "Hi {{1}}, you left something in your cart. Complete your order in the next 24 hours and we'll add free delivery.",
    body_examples: ["Aarav"],
    footer: null,
    buttons: [{ type: "URL", text: "Return to cart", url: "https://digibind.media/cart" }],
  }, {}, 0);

  tpl("feedback_request", "UTILITY", "REJECTED", {
    body: "Hey {{1}}!!! Rate us NOW and win a FREE gift. Click the link immediately.",
    body_examples: ["Aarav"],
    footer: null,
    buttons: [{ type: "URL", text: "Rate us", url: "https://digibind.media/rate" }],
  }, { rejection_reason: "Promotional content in a utility template" }, 3);

  tpl("monsoon_clearance", "MARKETING", "DRAFT", {
    header: { format: "IMAGE", media_url: "/demo/diwali.svg" },
    body: "Hi {{1}}, our Monsoon Clearance is here — up to {{2}} off on selected items.",
    body_examples: ["Aarav", "40%"],
    footer: null,
    buttons: [{ type: "URL", text: "Shop the sale", url: "https://digibind.media/sale" }],
  }, {}, 1);

  /* ── segments ── */
  const seg = (name: string, match: Segment["match"], rules: Segment["rules"]) =>
    t.segments.push({ id: id(), workspace_id: ws, name, match, rules, created_at: iso(now - 20 * DAY) });
  seg("VIP customers", "all", [{ field: "tag", op: "has", value: "vip" }, { field: "opt_in", op: "is", value: "opted_in" }]);
  seg("Mumbai leads", "all", [{ field: "attribute", key: "city", op: "is", value: "Mumbai" }, { field: "tag", op: "has", value: "lead" }]);
  seg("New this month", "all", [{ field: "created_at", op: "after", value: "30d" }]);
  seg("Wholesale or repeat buyers", "any", [{ field: "tag", op: "has", value: "wholesale" }, { field: "tag", op: "has", value: "repeat-buyer" }]);

  /* ── campaigns with believable engagement ── */
  const nameVar: Record<string, VarSource> = { "body.1": { source: "first_name", fallback: "there" } };

  const build = (
    name: string,
    template: Template,
    daysAgo: number,
    hour: number,
    audienceFilter: (c: Contact) => boolean,
    audienceSpec: Campaign["audience"],
    varMap: Record<string, VarSource>,
    opts: { readP: number; replyP: number; ratePerMin: number } = { readP: 0.6, replyP: 0.1, ratePerMin: 1200 },
  ) => {
    const start = new Date(now - daysAgo * DAY);
    start.setHours(hour, 5 + Math.floor(r() * 40), 0, 0);
    const startMs = start.getTime();
    const audience = eligible.filter(audienceFilter);
    const campId = id();
    const rows: CampaignMessage[] = [];
    let sent = 0, delivered = 0, read = 0, replied = 0, failed = 0;
    audience.forEach((c, i) => {
      const sentAt = startMs + Math.floor((i / opts.ratePerMin) * 60_000);
      const row: CampaignMessage = {
        id: id(), workspace_id: ws, campaign_id: campId, contact_id: c.id, phone: c.phone, contact_name: c.name,
        status: "sent", wa_message_id: `wamid.DEMO${campId.slice(0, 6)}${i}`, error_code: null, error_message: null, claimed_at: null,
        sent_at: iso(sentAt), delivered_at: null, read_at: null, replied_at: null, failed_at: null, created_at: iso(startMs - 60_000),
      };
      sent++;
      const roll = r();
      if (roll < 0.045) {
        row.status = "failed";
        row.error_code = pick(["131026", "131026", "131049", "131050"]);
        row.error_message = row.error_code === "131050" ? "User stopped marketing messages" : "Message undeliverable";
        row.failed_at = iso(sentAt + 2000);
        failed++;
      } else {
        row.delivered_at = iso(sentAt + 1000 + Math.floor(r() * 6000));
        row.status = "delivered";
        delivered++;
        if (r() < opts.readP) {
          const lag = Math.floor(-Math.log(1 - r()) * 55) * MIN + Math.floor(r() * MIN);
          row.read_at = iso(Date.parse(row.delivered_at) + lag);
          row.status = "read";
          read++;
          if (r() < opts.replyP) {
            row.replied_at = iso(Date.parse(row.read_at) + (2 + Math.floor(r() * 90)) * MIN);
            replied++;
          }
        }
      }
      rows.push(row);
    });
    t.campaign_messages.push(...rows);
    const rate = template.category === "UTILITY" ? 0.12 : 0.78;
    const camp: Campaign = {
      id: campId, workspace_id: ws, name, status: "completed", template_id: template.id, template_name: template.name, template_language: "en",
      template_category: template.category, template_snapshot: template.content, audience: audienceSpec, variable_map: varMap, media_map: {},
      scheduled_at: null, started_at: iso(startMs), completed_at: iso(startMs + Math.ceil((audience.length / opts.ratePerMin) * 60_000) + 5_000),
      throttle_per_min: opts.ratePerMin, total: audience.length, sent, delivered, read, replied, failed, clicked: 0,
      cost_estimate: Math.round(sent * rate * 100) / 100, last_error: null, created_by: DEMO_IDS.owner,
      created_at: iso(startMs - 3 * HOUR), updated_at: iso(startMs + HOUR),
    };
    t.campaigns.push(camp);
    return { camp, rows };
  };

  const has = (tag: string) => (c: Contact) => c.tags.includes(tag);
  const d1 = build("Diwali Mega Sale — VIP early access", tDiwali, 12, 11, (c) => has("vip")(c) || has("repeat-buyer")(c), { mode: "tags", tags: ["vip", "repeat-buyer"], tag_match: "any" }, { ...nameVar, "body.2": { source: "static", value: "25%" } }, { readP: 0.72, replyP: 0.14, ratePerMin: 600 });
  const d2 = build("Webinar: Scale with WhatsApp", tWebinar, 9, 18, (c) => has("lead")(c) || has("webinar")(c), { mode: "tags", tags: ["lead", "webinar"], tag_match: "any" }, { ...nameVar, "body.2": { source: "static", value: "Sat, 24 Oct · 6 PM IST" } }, { readP: 0.58, replyP: 0.17, ratePerMin: 1200 });
  const d3 = build("Autumn arrivals — new collection", tCarousel, 5, 10, () => true, { mode: "all" }, nameVar, { readP: 0.64, replyP: 0.09, ratePerMin: 1800 });
  const d4 = build("Thank-you coupon — repeat buyers", tCoupon, 3, 19, (c) => has("customer")(c) && !has("lead")(c), { mode: "tags", tags: ["customer"], tag_match: "any", exclude_tags: ["lead"] }, nameVar, { readP: 0.69, replyP: 0.06, ratePerMin: 600 });
  build("Order shipped — October batch", tOrder, 1, 9, (c) => has("customer")(c), { mode: "tags", tags: ["customer"], tag_match: "any" }, { ...nameVar, "body.2": { source: "attribute", key: "order_id", fallback: "48217" }, "button.0.1": { source: "static", value: "48217" } }, { readP: 0.81, replyP: 0.03, ratePerMin: 1200 });

  // scheduled (materialised, still queued) + draft
  const scheduledId = id();
  const schedStart = new Date(now + DAY);
  schedStart.setHours(18, 0, 0, 0);
  const schedAudience = eligible.filter((c) => has("vip")(c) || has("customer")(c)).slice(0, 48);
  t.campaign_messages.push(
    ...schedAudience.map((c) => ({
      id: id(), workspace_id: ws, campaign_id: scheduledId, contact_id: c.id, phone: c.phone, contact_name: c.name, status: "queued", wa_message_id: null,
      error_code: null, error_message: null, claimed_at: null, sent_at: null, delivered_at: null, read_at: null, replied_at: null, failed_at: null, created_at: iso(now - 2 * HOUR),
    })),
  );
  t.campaigns.push({
    id: scheduledId, workspace_id: ws, name: "Flash sale — Friday 6 PM", status: "scheduled", template_id: tDiwali.id, template_name: tDiwali.name, template_language: "en",
    template_category: "MARKETING", template_snapshot: tDiwali.content, audience: { mode: "tags", tags: ["vip", "customer"], tag_match: "any" },
    variable_map: { ...nameVar, "body.2": { source: "static", value: "30%" } }, media_map: {}, scheduled_at: schedStart.toISOString(), started_at: null, completed_at: null,
    throttle_per_min: 600, total: schedAudience.length, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, clicked: 0, cost_estimate: Math.round(schedAudience.length * 0.78 * 100) / 100,
    last_error: null, created_by: DEMO_IDS.owner, created_at: iso(now - 2 * HOUR), updated_at: iso(now - 2 * HOUR),
  } as Campaign);
  t.campaigns.push({
    id: id(), workspace_id: ws, name: "Monsoon clearance teaser", status: "draft", template_id: null, template_name: null, template_language: null, template_category: null,
    template_snapshot: null, audience: { mode: "segment", segment_id: t.segments[2].id }, variable_map: {}, media_map: {}, scheduled_at: null, started_at: null, completed_at: null,
    throttle_per_min: 600, total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, clicked: 0, cost_estimate: 0, last_error: null, created_by: DEMO_IDS.owner,
    created_at: iso(now - 5 * HOUR), updated_at: iso(now - 5 * HOUR),
  } as Campaign);

  /* ── inbox threads ── */
  type Step = { d: "in" | "out"; type: Message["type"]; body?: string | null; ago: number; by?: string; payload?: Message["payload"]; status?: Message["status"]; reply?: string };
  const convFor = new Map<string, Conversation>();
  const addThread = (contact: Contact, steps: Step[], opts: { unread?: number; status?: "open" | "resolved"; assigned?: string | null } = {}) => {
    const sorted = [...steps].sort((a, b) => b.ago - a.ago);
    const convId = id();
    let lastIn: string | null = null;
    const msgs: Message[] = sorted.map((s, i) => {
      const at = iso(now - s.ago * MIN);
      if (s.d === "in") lastIn = at;
      return {
        id: id(), workspace_id: ws, conversation_id: convId, contact_id: contact.id, direction: s.d, type: s.type, body: s.body ?? null,
        payload: s.payload ?? (s.by && s.d === "out" ? { author: { name: s.by } } : {}), status: s.status ?? (s.d === "in" ? "received" : i === sorted.length - 1 ? "delivered" : "read"),
        wa_message_id: `wamid.DEMOMSG${convId.slice(0, 6)}${i}`, error_code: null, error_message: null, campaign_id: null,
        sent_by: s.by === "Priya Nair" ? DEMO_IDS.admin : s.by === "Aarav Mehta" ? DEMO_IDS.agent : null, created_at: at, sent_at: at, delivered_at: s.d === "out" ? at : null, read_at: s.d === "out" && i < sorted.length - 1 ? at : null,
      } as Message;
    });
    const last = [...msgs].reverse().find((m) => m.type !== "note")!;
    const preview = last.type === "template" ? (last.body ?? "Template") : last.type === "image" ? "Photo" : last.type === "document" ? "Document" : last.body ?? "";
    const conv: Conversation = {
      id: convId, workspace_id: ws, contact_id: contact.id, status: opts.status ?? "open", assigned_to: opts.assigned ?? null, unread_count: opts.unread ?? 0,
      last_message_at: last.created_at, last_message_preview: preview.slice(0, 160), last_message_direction: last.direction, last_message_status: last.status, last_inbound_at: lastIn,
      created_at: msgs[0].created_at,
    } as Conversation;
    t.conversations.push(conv);
    t.messages.push(...msgs);
    convFor.set(contact.id, conv);
    contact.last_inbound_at = lastIn;
    return conv;
  };

  const c = (i: number) => eligible[i];
  const diwaliTplPayload = (name: string, values: Record<string, string>): Message["payload"] => ({ template: { id: tDiwali.id, name: tDiwali.name, language: "en", values } });
  const diwaliBody = (n: string) => `Hi ${n}, our Diwali Mega Sale is live! 🪔 Enjoy flat 25% off on all packages till 31st October. Your VIP code is waiting inside.`;

  addThread(c(0), [
    { d: "out", type: "template", body: diwaliBody(c(0).name!.split(" ")[0]), ago: 2 * 24 * 60 + 40, payload: diwaliTplPayload(tDiwali.name, { "body.1": c(0).name!.split(" ")[0], "body.2": "25%" }) },
    { d: "in", type: "button", body: "Claim offer", ago: 2 * 24 * 60 + 12 },
    { d: "in", type: "text", body: "Hi, is the Diwali offer still on?", ago: 18 },
    { d: "in", type: "text", body: "Also do you deliver to Pune?", ago: 17 },
  ], { unread: 2 });

  addThread(c(1), [
    { d: "in", type: "text", body: "Need the invoice for my last order #4821", ago: 190 },
    { d: "out", type: "text", body: "Sure — sharing it now.", ago: 176, by: "Priya Nair" },
    { d: "out", type: "document", body: "Invoice for order #4821", ago: 175, by: "Priya Nair", payload: { author: { name: "Priya Nair" }, media: { url: "/demo/catalogue.pdf", filename: "Invoice-4821.pdf", mime: "application/pdf", caption: "Invoice for order #4821" } } },
    { d: "in", type: "text", body: "Got it, thanks! 🙏", ago: 160 },
  ], { status: "resolved", assigned: DEMO_IDS.admin });

  addThread(c(2), [
    { d: "out", type: "template", body: "Aarav, join our free live webinar: Scale your business with WhatsApp on Sat, 24 Oct · 6 PM IST. Seats are limited — reserve yours now.", ago: 4 * 24 * 60 + 90, payload: { template: { id: tWebinar.id, name: tWebinar.name, language: "en", values: { "body.1": "Aarav", "body.2": "Sat, 24 Oct · 6 PM IST" } } } },
    { d: "in", type: "button", body: "Register me", ago: 4 * 24 * 60 + 60 },
    { d: "out", type: "text", body: "Great, you're in! Here's your joining link: https://digibind.media/webinar/join — see you on Saturday.", ago: 4 * 24 * 60 + 58, by: "Aarav Mehta" },
    { d: "in", type: "text", body: "👍", ago: 4 * 24 * 60 + 50 },
  ], { assigned: DEMO_IDS.agent });

  addThread(c(3), [
    { d: "out", type: "template", body: "Hi, here's a little thank-you: use the code below at checkout for 15% off your next order. Valid for 48 hours ⏳", ago: 3 * 24 * 60 + 200, payload: { template: { id: tCoupon.id, name: tCoupon.name, language: "en", values: { "body.1": "there" } } } },
    { d: "in", type: "text", body: "Can I use this on the wholesale pack too?", ago: 3 * 24 * 60 + 150 },
  ], { unread: 1 }); // window closed — shows the template-only composer

  addThread(c(4), [
    { d: "in", type: "image", body: "This is the sofa I want — do you have it in teal?", ago: 40, payload: { media: { url: "/demo/sofa.svg", mime: "image/svg+xml", caption: "This is the sofa I want — do you have it in teal?" } } },
  ], { unread: 1 });

  addThread(c(5), [
    { d: "in", type: "text", body: "Can I change the delivery address for order #4903?", ago: 62 },
    { d: "out", type: "text", body: "Yes of course! Please send the new address and PIN code.", ago: 55, by: "Aarav Mehta" },
    { d: "in", type: "text", body: "Flat 12, Lotus Heights, Baner, Pune 411045", ago: 49 },
  ], { assigned: DEMO_IDS.agent, unread: 1 });

  const stopContact = contacts.find((x) => x.opt_in === "opted_out")!;
  addThread(stopContact, [
    { d: "out", type: "template", body: "Hi, our Autumn collection just dropped 🍂 Swipe through the new arrivals and tap to shop your favourites.", ago: 6 * 24 * 60 + 30, payload: { template: { id: tCarousel.id, name: tCarousel.name, language: "en", values: { "body.1": "there" } } } },
    { d: "in", type: "text", body: "STOP", ago: 6 * 24 * 60 + 20 },
    { d: "out", type: "text", body: "You've been unsubscribed and won't receive further promotional messages. Reply START anytime to rejoin.", ago: 6 * 24 * 60 + 19, payload: { author: { id: "auto:compliance", name: "Automation" } } },
  ], { status: "resolved" });

  addThread(c(6), [
    { d: "out", type: "interactive", body: "Thanks for reaching out! How can we help today?", ago: 320, payload: { author: { name: "Automation" }, interactive: { kind: "buttons", body: "Thanks for reaching out! How can we help today?", buttons: [{ id: "demo", title: "Book a demo" }, { id: "sales", title: "Talk to sales" }] } } },
    { d: "in", type: "button", body: "Book a demo", ago: 305 },
    { d: "out", type: "text", body: "Wonderful! Which day works for a 20-minute walkthrough — tomorrow or Friday?", ago: 290, by: "Priya Nair" },
    { d: "in", type: "text", body: "Friday afternoon works. Around 3?", ago: 275 },
  ], { assigned: DEMO_IDS.admin });

  addThread(c(7), [
    { d: "out", type: "template", body: "Hello, your order #48217 has been shipped and will reach you in 2–3 days. You can track it anytime from the link below.", ago: 26 * 60, payload: { template: { id: tOrder.id, name: tOrder.name, language: "en", values: { "body.1": "there", "body.2": "48217" } } } },
    { d: "in", type: "text", body: "Thanks for the quick delivery! Packaging was great.", ago: 20 * 60 },
    { d: "out", type: "text", body: "That makes our day — thank you for the kind words! 😊", ago: 19 * 60, by: "Aarav Mehta" },
  ], { status: "resolved" });

  const vipContact = eligible.find((x) => x.tags.includes("vip") && !convFor.has(x.id))!;
  addThread(vipContact, [
    { d: "in", type: "text", body: "Hello, I'd like a quote for 200 units of the premium pack.", ago: 95 },
    { d: "out", type: "note", body: "VIP — long-time wholesale buyer. OK to offer up to 12% extra.", ago: 90, by: "Priya Nair", payload: { author: { name: "Priya Nair" } } },
  ], { unread: 1, assigned: null });

  // a few more, so the list scrolls
  const rest = eligible.filter((x) => !convFor.has(x.id)).slice(0, 5);
  const lines = ["What are your working hours on Saturday?", "Please share the catalogue again", "Is there a student discount?", "Do you ship internationally?", "Thanks, will confirm by evening"];
  rest.forEach((ct, i) => addThread(ct, [{ d: "in", type: "text", body: lines[i], ago: 130 + i * 190 }], { unread: i % 2 === 0 ? 1 : 0 }));

  // campaign replies appear in the threads of those who answered
  contacts.forEach((ct) => {
    const cm = [d1, d2, d3, d4].flatMap((d) => d.rows).find((row) => row.contact_id === ct.id && row.replied_at);
    if (cm && !convFor.has(ct.id)) {
      ct.last_inbound_at = cm.replied_at;
    }
  });

  /* ── quick replies ── */
  [
    ["hello", "Hi! Thanks for reaching out to DigiBind Media. How can I help you today?"],
    ["price", "Our packages start at ₹4,999/month. Want me to share the detailed price list?"],
    ["thanks", "Thank you! Let us know if there's anything else we can help with."],
    ["hours", "We're available Mon–Fri 9:30 AM to 6:30 PM and Sat 10 AM to 2 PM IST."],
    ["address", "Our studio: 4th Floor, Lotus Square, Baner Road, Pune 411045."],
  ].forEach(([shortcut, body]) => t.quick_replies.push({ id: id(), workspace_id: ws, shortcut, body, created_at: iso(now - 30 * DAY) }));

  /* ── automations ── */
  const rule = (r: Partial<AutomationRule> & Pick<AutomationRule, "name" | "trigger" | "actions">) =>
    t.automation_rules.push({ id: id(), workspace_id: ws, enabled: true, priority: 10, triggered_count: 0, last_triggered_at: null, created_at: iso(now - 40 * DAY), ...r });
  rule({ name: "Pricing questions", priority: 1, trigger: { type: "keyword", match: "contains", keywords: ["price", "pricing", "cost", "rates", "quote"] }, triggered_count: 86, last_triggered_at: iso(now - 3 * HOUR), actions: [{ type: "send_buttons", body: "Our packages start at ₹4,999/month. Would you like to see the plans or speak to someone?", buttons: [{ id: "plans", title: "See plans" }, { id: "human", title: "Talk to sales" }] }, { type: "add_tag", tag: "lead" }] });
  rule({ name: "Opening hours", priority: 2, trigger: { type: "keyword", match: "exact", keywords: ["hours", "timing", "timings", "open"] }, triggered_count: 31, last_triggered_at: iso(now - 9 * HOUR), actions: [{ type: "send_text", body: "We're available Mon–Fri 9:30 AM–6:30 PM and Sat 10 AM–2 PM IST." }] });
  rule({ name: "Welcome new chats", priority: 5, trigger: { type: "first_message" }, triggered_count: 112, last_triggered_at: iso(now - 26 * HOUR), actions: [{ type: "send_text", body: "Hi {{first_name}}, welcome to DigiBind Media! A teammate will be with you shortly. Meanwhile, tell us what you're looking for." }] });
  rule({ name: "After-hours reply", priority: 6, enabled: false, trigger: { type: "outside_hours" }, triggered_count: 18, last_triggered_at: iso(now - 4 * DAY), actions: [{ type: "send_text", body: "Thanks for writing in! We're away right now and will reply first thing in the morning." }] });
}
