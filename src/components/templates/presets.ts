import { Cards, ImageSquare, Package, VideoCamera } from "@phosphor-icons/react";
import type { TemplateContent } from "@/lib/shared/types";
import { withKeys, type Draft } from "./model";

export interface Preset {
  id: string;
  title: string;
  line: string;
  icon: typeof Cards;
  build: (optout: string) => Draft;
}

const draft = (name: string, category: Draft["category"], content: TemplateContent): Draft => ({ name, language: "en", category, content: withKeys(content) });

export const PRESETS: Preset[] = [
  {
    id: "offer",
    title: "Offer with image",
    line: "A festive offer with a banner and a shop link.",
    icon: ImageSquare,
    build: (optout) =>
      draft("festive_offer", "MARKETING", {
        header: { format: "IMAGE", media_url: "/demo/diwali.svg" },
        body: "Hi {{1}}, your exclusive offer is here: {{2}}. Tap below to browse the full range while it lasts.",
        body_examples: ["Aarav", "20% off on all festive collections"],
        footer: optout,
        buttons: [{ type: "URL", text: "Shop now", url: "https://example.com/offers" }],
      }),
  },
  {
    id: "webinar",
    title: "Webinar invite",
    line: "A video invite with one-tap RSVP replies.",
    icon: VideoCamera,
    build: (optout) =>
      draft("webinar_invite", "MARKETING", {
        header: { format: "VIDEO", media_url: "/demo/webinar.svg" },
        body: "Hi {{1}}, you are invited to our live session on {{2}}. Seats are limited, so reserve your spot today.",
        body_examples: ["Aarav", "growing your business with WhatsApp"],
        footer: optout,
        buttons: [
          { type: "QUICK_REPLY", text: "Count me in" },
          { type: "QUICK_REPLY", text: "Remind me later" },
          { type: "QUICK_REPLY", text: "Not interested" },
        ],
      }),
  },
  {
    id: "order",
    title: "Order update",
    line: "A shipping notice with a tracking link.",
    icon: Package,
    build: () =>
      draft("order_shipped_update", "UTILITY", {
        header: null,
        body: "Hi {{1}}, your order {{2}} has been shipped and will reach you by {{3}}. You can follow it with the button below.",
        body_examples: ["Aarav", "#DB-20481", "Friday, 18 October"],
        footer: null,
        buttons: [{ type: "URL", text: "Track order", url: "https://example.com/track/{{1}}", example: "https://example.com/track/DB20481" }],
      }),
  },
  {
    id: "carousel",
    title: "Product carousel",
    line: "Three swipeable product cards with buttons.",
    icon: Cards,
    build: () =>
      draft("product_carousel", "MARKETING", {
        header: null,
        body: "Hi {{1}}, here are this week's picks, chosen for you. Swipe to browse and tap to shop.",
        body_examples: ["Aarav"],
        footer: null,
        buttons: [],
        cards: [1, 2, 3].map((n) => ({
          media_format: "IMAGE" as const,
          media_url: `/demo/card-${n}.svg`,
          body: ["Heritage Weave Jacket, now ₹3,499", "Studio Linen Shirt, now ₹1,899", "Midnight Chino, now ₹2,299"][n - 1],
          body_examples: [],
          buttons: [
            { type: "URL" as const, text: "Shop now", url: `https://example.com/shop/${n}` },
            { type: "QUICK_REPLY" as const, text: "Tell me more" },
          ],
        })),
      }),
  },
];
