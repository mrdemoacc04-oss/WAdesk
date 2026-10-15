import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "@/lib/shared/phone";
import {
  buildSendComponents,
  fromMetaComponents,
  newCard,
  resolveSource,
  templateSlots,
  toMetaComponents,
  validateTemplate,
  varIndexes,
} from "@/lib/shared/template";
import { segmentToQuery, ruleToWhere, normTags } from "@/lib/server/services/contacts";
import { keywordMatches, withinBusinessHours } from "@/lib/server/services/automation";
import { defaultBusinessHours } from "@/lib/shared/constants";
import { waHtml } from "@/components/wa/wa-text";
import type { TemplateContent } from "@/lib/shared/types";

/* ───────── phone numbers ───────── */

test("normalizePhone handles the messy formats real spreadsheets contain", () => {
  const ok = (raw: unknown, cc = "IN") => {
    const r = normalizePhone(raw, cc);
    assert.equal(r.ok, true, `${raw} should be valid`);
    return r.ok ? r.e164 : "";
  };
  assert.equal(ok("9876543210"), "+919876543210");
  assert.equal(ok("+91 98765 43210"), "+919876543210");
  assert.equal(ok("098765 43210"), "+919876543210");
  assert.equal(ok("919876543210"), "+919876543210");
  assert.equal(ok("00919876543210"), "+919876543210");
  assert.equal(ok("9.876543210E9"), "+919876543210"); // Excel scientific notation
  assert.equal(ok(9876543210), "+919876543210"); // numeric cell
  assert.equal(ok("(415) 555-2671", "US"), "+14155552671");
  assert.equal(normalizePhone("12345", "IN").ok, false);
  assert.equal(normalizePhone("", "IN").ok, false);
  assert.equal(normalizePhone("not a number", "IN").ok, false);
});

/* ───────── templates ───────── */

const offer: TemplateContent = {
  header: { format: "IMAGE", media_url: "https://x.test/a.jpg", handle: "4:abc" },
  body: "Hi {{1}}, enjoy {{2}} off this week on all packages.",
  body_examples: ["Aarav", "25%"],
  footer: "Reply STOP to opt out",
  buttons: [
    { type: "URL", text: "Claim", url: "https://x.test/offer/{{1}}", example: "https://x.test/offer/abc" },
    { type: "QUICK_REPLY", text: "No thanks" },
  ],
};

test("validateTemplate accepts a well-formed marketing template", () => {
  const issues = validateTemplate({ name: "diwali_sale", category: "MARKETING", content: offer });
  assert.deepEqual(issues.filter((i) => i.level === "error"), []);
});

test("validateTemplate enforces Meta's rules", () => {
  const bad = (content: Partial<TemplateContent>, name = "ok_name") =>
    validateTemplate({ name, category: "MARKETING", content: { ...offer, ...content } }).filter((i) => i.level === "error").map((i) => i.path);
  assert.ok(bad({}, "Bad Name").includes("name"));
  assert.ok(bad({ body: "{{1}} starts with a variable and is long enough text here" }).includes("body"));
  assert.ok(bad({ body: "Hi {{1}} and {{3}} are skipping two in the middle ok", body_examples: ["a", "b"] }).includes("body"));
  assert.ok(bad({ body_examples: ["Aarav", ""] }).includes("body.example.2"));
  assert.ok(bad({ footer: "x".repeat(61) }).includes("footer"));
  assert.ok(bad({ buttons: [{ type: "URL", text: "a", url: "http://x.test" }, { type: "URL", text: "b", url: "https://x.test" }, { type: "URL", text: "c", url: "https://x.test" }] }).includes("buttons"));
  assert.ok(bad({ buttons: [{ type: "QUICK_REPLY", text: "a" }, { type: "URL", text: "b", url: "https://x.test" }, { type: "QUICK_REPLY", text: "c" }] }).includes("buttons")); // QR must be grouped
});

test("carousel rules: 2–10 cards, same media type and button layout", () => {
  const card = (n: number) => ({ ...newCard("IMAGE"), media_url: "https://x.test/1.jpg", body: `Card ${n} text` });
  const c: TemplateContent = { body: "Swipe through our new arrivals this season.", body_examples: [], buttons: [], cards: [card(1)] };
  const errs = (content: TemplateContent) => validateTemplate({ name: "carousel_a", category: "MARKETING", content }).filter((i) => i.level === "error").map((i) => i.path);
  assert.ok(errs(c).includes("cards"));
  assert.deepEqual(errs({ ...c, cards: [card(1), card(2)] }), []);
  assert.ok(errs({ ...c, cards: [card(1), { ...card(2), media_format: "VIDEO" }] }).some((p) => p.startsWith("cards.1")));
  assert.ok(errs({ ...c, cards: [card(1), { ...card(2), buttons: [{ type: "QUICK_REPLY", text: "Hi" }] }] }).some((p) => p.startsWith("cards.1")));
});

test("templateSlots lists every value a campaign must supply", () => {
  const keys = templateSlots(offer).map((s) => s.key);
  assert.deepEqual(keys, ["header.media", "body.1", "body.2", "button.0.1"]);
  assert.deepEqual(varIndexes("a {{1}} b {{ 2 }} c {{1}}"), [1, 2]);
});

test("buildSendComponents produces the Cloud API shape", () => {
  const comps = buildSendComponents(offer, { "header.media": "https://x.test/b.jpg", "body.1": "Aarav\nSharma", "body.2": "25%", "button.0.1": "abc" }, "c:1234");
  assert.deepEqual(comps[0], { type: "header", parameters: [{ type: "image", image: { link: "https://x.test/b.jpg" } }] });
  assert.deepEqual(comps[1], { type: "body", parameters: [{ type: "text", text: "Aarav Sharma" }, { type: "text", text: "25%" }] }); // newline stripped
  assert.deepEqual(comps[2], { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "abc" }] });
  assert.equal(comps[3].sub_type, "quick_reply");
  assert.equal(comps[3].parameters[0].payload, "c:1234:1");
  // media by Meta id when the file was uploaded to Meta
  const byId = buildSendComponents(offer, { "header.media": "id:777", "body.1": "a", "body.2": "b", "button.0.1": "c" }, "x");
  assert.deepEqual(byId[0].parameters[0], { type: "image", image: { id: "777" } });
});

test("carousel send + create payloads", () => {
  const content: TemplateContent = {
    body: "Hi {{1}}, take a look at these arrivals this season.",
    body_examples: ["Aarav"],
    buttons: [],
    cards: [
      { media_format: "IMAGE", media_url: "https://x.test/1.jpg", handle: "h1", body: "Jacket · {{1}}", body_examples: ["₹3,499"], buttons: [{ type: "URL", text: "Shop", url: "https://x.test/{{1}}", example: "https://x.test/jacket" }] },
      { media_format: "IMAGE", media_url: "https://x.test/2.jpg", handle: "h2", body: "Shirt", body_examples: [], buttons: [{ type: "URL", text: "Shop", url: "https://x.test/shirt" }] },
    ],
  };
  const send = buildSendComponents(content, { "body.1": "Aarav", "card.0.media": "https://x.test/1.jpg", "card.0.body.1": "₹3,499", "card.0.button.0.1": "jacket", "card.1.media": "https://x.test/2.jpg" }, "p");
  const carousel = send.find((c) => c.type === "carousel");
  assert.equal(carousel.cards.length, 2);
  assert.equal(carousel.cards[0].card_index, 0);
  assert.deepEqual(carousel.cards[0].components.map((c: any) => c.type), ["header", "body", "button"]);
  assert.deepEqual(carousel.cards[1].components.map((c: any) => c.type), ["header"]); // static URL needs no param

  const create = toMetaComponents(content);
  assert.deepEqual(create.map((c) => c.type), ["BODY", "CAROUSEL"]);
  assert.equal(create[1].cards[0].components[0].example.header_handle[0], "h1");
  // round trip through Meta's list format
  const back = fromMetaComponents(create);
  assert.equal(back.kind, "carousel");
  assert.equal(back.content.cards?.length, 2);
});

test("resolveSource uses fallbacks and never invents data", () => {
  const c = { name: "Aarav Sharma", phone: "+919876543210", email: null, country: "IN", attributes: { city: "Pune" } };
  assert.equal(resolveSource({ source: "first_name" }, c), "Aarav");
  assert.equal(resolveSource({ source: "email", fallback: "n/a" }, c), "n/a");
  assert.equal(resolveSource({ source: "email" }, c), null);
  assert.equal(resolveSource({ source: "attribute", key: "city" }, c), "Pune");
  assert.equal(resolveSource({ source: "static", value: "20%" }, c), "20%");
});

/* ───────── segments / tags ───────── */

test("segment rules translate to query vocabulary", () => {
  assert.deepEqual(ruleToWhere({ field: "tag", op: "has", value: "VIP" }), { tags: { has: ["vip"] } });
  assert.deepEqual(ruleToWhere({ field: "tag", op: "has_not", value: "vip" }), { tags: { notHas: ["vip"] } });
  assert.deepEqual(ruleToWhere({ field: "attribute", key: "city", op: "is", value: "Pune" }), { "attributes.city": "Pune" });
  const q = segmentToQuery({ match: "all", rules: [{ field: "tag", op: "has", value: "a" }, { field: "tag", op: "has_not", value: "b" }] });
  assert.equal(q.and?.length, 2); // two conditions on the same column survive
  assert.equal(segmentToQuery({ match: "any", rules: [{ field: "tag", op: "has", value: "a" }, { field: "tag", op: "has", value: "b" }] }).or?.length, 2);
  const rel = ruleToWhere({ field: "created_at", op: "after", value: "30d" }) as any;
  assert.ok(Date.now() - Date.parse(rel.created_at.gte) > 29 * 86400000);
  assert.deepEqual(normTags(["VIP", " vip ", 'a,"b"', "x".repeat(50)]).slice(0, 2), ["vip", "a b"]);
});

/* ───────── automation helpers ───────── */

test("keyword matching", () => {
  const t = (match: string, kws: string[], text: string) => keywordMatches(text, { match, keywords: kws });
  assert.equal(t("contains", ["price"], "What's the PRICE for 50?"), true);
  assert.equal(t("contains", ["price"], "priceless"), false); // whole words only
  assert.equal(t("exact", ["stop"], "  Stop! "), true);
  assert.equal(t("exact", ["stop"], "please stop"), false);
  assert.equal(t("starts_with", ["hi"], "Hi there"), true);
});

test("business hours respect the workspace timezone", () => {
  const h = { ...defaultBusinessHours("Asia/Kolkata"), enabled: true };
  const monday11amIST = new Date("2026-10-12T05:30:00Z"); // Mon 11:00 IST
  const monday11pmIST = new Date("2026-10-12T17:30:00Z");
  const sundayNoonIST = new Date("2026-10-11T06:30:00Z");
  assert.equal(withinBusinessHours(h, monday11amIST), true);
  assert.equal(withinBusinessHours(h, monday11pmIST), false);
  assert.equal(withinBusinessHours(h, sundayNoonIST), false); // Sunday closed
  assert.equal(withinBusinessHours({ ...h, enabled: false }, monday11pmIST), true);
});

test("WhatsApp formatting is escaped and variables highlighted", () => {
  const html = waHtml("*Hi* {{1}} <script>x</script> ~old~ _it_", (n) => (n === 1 ? "Ana" : undefined));
  assert.ok(html.includes("<strong>Hi</strong>"));
  assert.ok(html.includes('<span class="wa-var">Ana</span>'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("<s>old</s>") && html.includes("<em>it</em>"));
});
