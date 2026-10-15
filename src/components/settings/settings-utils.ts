import type { WaAccount } from "@/lib/shared/types";

/** Plain-language messaging limit, per Meta's tiers (unique customers you can start chats with in 24 hours). */
export function tierLabel(tier: string | null | undefined): string {
  if (!tier) return "Not available yet";
  const t = tier.toUpperCase().replace(/^TIER_/, "");
  const map: Record<string, string> = {
    "50": "50 customers / 24h",
    "250": "250 customers / 24h",
    "1K": "1,000 customers / 24h",
    "2K": "2,000 customers / 24h",
    "10K": "10,000 customers / 24h",
    "100K": "100,000 customers / 24h",
    UNLIMITED: "Unlimited customers / 24h",
  };
  return map[t] ?? tier;
}

export function tierNote(tier: string | null | undefined): string {
  const t = (tier ?? "").toUpperCase();
  if (t.includes("UNLIMITED")) return "No daily cap on new conversations.";
  if (t.includes("100K")) return "Meta raises this automatically as your quality stays high.";
  return "Meta raises this automatically as you send more with good quality.";
}

export type QualityView = { label: string; tone: "accent" | "warn" | "danger" | "neutral"; note: string };

export function qualityView(q: WaAccount["quality_rating"]): QualityView {
  switch (q) {
    case "GREEN":
      return { label: "High quality", tone: "accent", note: "Customers are responding well. Keep it up." };
    case "YELLOW":
      return { label: "Medium quality", tone: "warn", note: "Some people are blocking or reporting. Send fewer, more relevant messages." };
    case "RED":
      return { label: "Low quality", tone: "danger", note: "Your limit may drop. Pause broadcasts and review who you message." };
    default:
      return { label: "Not rated yet", tone: "neutral", note: "Meta rates a number after it has sent some messages." };
  }
}

/** Symbol for a currency code, e.g. INR → ₹. */
export function currencySymbol(code: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}
