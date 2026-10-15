import { z } from "zod";

const str = (max = 4096) => z.string().max(max);

export const button = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: str(60) }),
  z.object({ type: z.literal("URL"), text: str(60), url: str(2000), example: str(2000).optional() }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: str(60), phone_number: str(30) }),
  z.object({ type: z.literal("COPY_CODE"), example: str(40) }),
]);

export const header = z.union([
  z.object({ format: z.literal("TEXT"), text: str(200), example: str(200).optional() }),
  z.object({
    format: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
    media_url: str(2000).optional(),
    handle: str(2000).optional(),
    filename: str(200).optional(),
  }),
]);

export const card = z.object({
  media_format: z.enum(["IMAGE", "VIDEO"]),
  media_url: str(2000).optional(),
  handle: str(2000).optional(),
  body: str(400),
  body_examples: z.array(str(200)).max(10),
  buttons: z.array(button).max(3),
});

export const templateContent = z.object({
  header: header.nullable().optional(),
  body: str(4096),
  body_examples: z.array(str(200)).max(20),
  footer: str(200).nullable().optional(),
  buttons: z.array(button).max(10),
  cards: z.array(card).max(10).optional(),
});

export const templateInput = z.object({
  name: str(512),
  language: str(12),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  content: templateContent,
});

export const audience = z.object({
  mode: z.enum(["all", "segment", "tags", "contacts", "retarget"]),
  segment_id: z.string().nullable().optional(),
  tags: z.array(str(40)).max(50).optional(),
  tag_match: z.enum(["any", "all"]).optional(),
  exclude_tags: z.array(str(40)).max(50).optional(),
  contact_ids: z.array(z.string()).max(50_000).optional(),
  source_campaign_id: z.string().nullable().optional(),
  retarget: z.enum(["not_read", "not_delivered", "failed", "read_no_reply"]).optional(),
  include_pending: z.boolean().optional(),
  skip_recent_days: z.number().int().min(0).max(365).optional(),
});

export const varSource = z.union([
  z.object({ source: z.literal("static"), value: str(1000) }),
  z.object({ source: z.enum(["name", "first_name", "phone", "email", "country"]), fallback: str(200).optional() }),
  z.object({ source: z.literal("attribute"), key: str(80), fallback: str(200).optional() }),
]);

export const campaignInput = z.object({
  name: str(120),
  template_id: z.string().nullable(),
  audience,
  variable_map: z.record(z.string(), varSource),
  media_map: z.record(z.string(), str(2000)),
  scheduled_at: z.string().nullable(),
  throttle_per_min: z.number().int().min(30).max(4800),
});

export const segmentInput = z.object({
  name: str(80).min(1),
  match: z.enum(["all", "any"]),
  rules: z
    .array(
      z.object({
        field: z.enum(["tag", "opt_in", "country", "source", "attribute", "created_at", "last_inbound_at", "name", "phone"]),
        key: str(80).optional(),
        op: z.enum(["is", "is_not", "contains", "has", "has_not", "before", "after", "exists", "not_exists"]),
        value: str(200),
      }),
    )
    .max(20),
});

export const interactive = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("buttons"),
    body: str(1024).min(1),
    header: z.union([z.object({ type: z.literal("text"), text: str(60) }), z.object({ type: z.enum(["image", "video", "document"]), link: str(2000) })]).nullable().optional(),
    footer: str(60).nullable().optional(),
    buttons: z.array(z.object({ id: str(256), title: str(20).min(1) })).min(1).max(3),
  }),
  z.object({
    kind: z.literal("list"),
    body: str(1024).min(1),
    button: str(20).min(1),
    footer: str(60).nullable().optional(),
    sections: z.array(z.object({ title: str(24), rows: z.array(z.object({ id: str(200), title: str(24).min(1), description: str(72).optional() })).min(1).max(10) })).min(1).max(10),
  }),
  z.object({
    kind: z.literal("cta_url"),
    body: str(1024).min(1),
    header: z.union([z.object({ type: z.literal("text"), text: str(60) }), z.object({ type: z.enum(["image", "video", "document"]), link: str(2000) })]).nullable().optional(),
    footer: str(60).nullable().optional(),
    display_text: str(20).min(1),
    url: str(2000),
  }),
]);

export const sendInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), body: str(4096).min(1), reply_to: z.string().optional() }),
  z.object({
    type: z.literal("media"),
    kind: z.enum(["image", "video", "audio", "document"]),
    url: str(2000),
    mime: str(120).optional(),
    caption: str(1024).optional(),
    filename: str(200).optional(),
  }),
  z.object({ type: z.literal("interactive"), interactive }),
  z.object({ type: z.literal("template"), template_id: z.string(), values: z.record(z.string(), str(1000)) }),
  z.object({ type: z.literal("note"), body: str(2000).min(1) }),
]);

export const automationInput = z.object({
  name: str(80).min(1),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(999),
  trigger: z.discriminatedUnion("type", [
    z.object({ type: z.literal("keyword"), match: z.enum(["exact", "contains", "starts_with"]), keywords: z.array(str(60)).min(1).max(30) }),
    z.object({ type: z.literal("first_message") }),
    z.object({ type: z.literal("outside_hours") }),
  ]),
  actions: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("send_text"), body: str(4096) }),
        z.object({ type: z.literal("send_buttons"), body: str(1024), buttons: z.array(z.object({ id: str(100), title: str(20) })).max(3) }),
        z.object({ type: z.literal("send_template"), template_id: z.string() }),
        z.object({ type: z.literal("add_tag"), tag: str(40) }),
        z.object({ type: z.literal("remove_tag"), tag: str(40) }),
        z.object({ type: z.literal("assign"), user_id: z.string() }),
        z.object({ type: z.literal("opt_out") }),
        z.object({ type: z.literal("opt_in") }),
      ]),
    )
    .min(1)
    .max(8),
});

export const settingsPatch = z.object({
  name: str(80).optional(),
  settings: z
    .object({
      business_hours: z.any().optional(),
      rates: z.object({ currency: str(5), marketing: z.number().min(0), utility: z.number().min(0), authentication: z.number().min(0) }).optional(),
      compliance: z
        .object({
          optout_keywords: z.array(str(40)).max(30),
          optin_keywords: z.array(str(40)).max(30),
          optout_reply: str(1000),
          optin_reply: str(1000),
          optout_footer: z.boolean(),
        })
        .optional(),
      default_country: str(2).optional(),
      sim_ambient: z.boolean().optional(),
    })
    .optional(),
});
