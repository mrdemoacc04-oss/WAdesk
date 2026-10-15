import type { BusinessHours, DayKey, WorkspaceSettings } from "./types";

export const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

export const TEMPLATE_LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "en_US", name: "English (US)" },
  { code: "en_GB", name: "English (UK)" },
  { code: "hi", name: "Hindi" },
  { code: "bn", name: "Bengali" },
  { code: "gu", name: "Gujarati" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "mr", name: "Marathi" },
  { code: "pa", name: "Punjabi" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "ur", name: "Urdu" },
  { code: "ar", name: "Arabic" },
  { code: "es", name: "Spanish" },
  { code: "pt_BR", name: "Portuguese (BR)" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "zh_CN", name: "Chinese (CN)" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "fil", name: "Filipino" },
];

export const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Dhaka",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Colombo",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "UTC",
];

export function defaultBusinessHours(tz = "Asia/Kolkata"): BusinessHours {
  const weekday = { enabled: true, open: "09:30", close: "18:30" };
  return {
    enabled: false,
    timezone: tz,
    days: {
      mon: { ...weekday },
      tue: { ...weekday },
      wed: { ...weekday },
      thu: { ...weekday },
      fri: { ...weekday },
      sat: { enabled: true, open: "10:00", close: "14:00" },
      sun: { enabled: false, open: "10:00", close: "14:00" },
    },
  };
}

export function defaultSettings(): WorkspaceSettings {
  return {
    business_hours: defaultBusinessHours(),
    rates: { currency: "INR", marketing: 0.78, utility: 0.12, authentication: 0.12 },
    compliance: {
      optout_keywords: ["stop", "unsubscribe", "opt out", "optout", "cancel"],
      optin_keywords: ["start", "subscribe", "yes please", "opt in"],
      optout_reply: "You've been unsubscribed and won't receive further promotional messages. Reply START anytime to rejoin.",
      optin_reply: "Welcome back! You'll receive our updates again. Reply STOP anytime to opt out.",
      optout_footer: true,
    },
    default_country: "IN",
  };
}

export const CONTACT_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "country", label: "Country" },
  { key: "tags", label: "Tags" },
];

export const EMOJIS = (
  "😀 😃 😄 😁 😆 😅 😂 🤣 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😎 🤗 🤔 😏 😌 😴 🥳 🤝 🙏 👍 👎 👏 🙌 💪 👋 ✌️ 🤞 👌 " +
  "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💯 ✨ ⭐ 🌟 🔥 🎉 🎊 🎁 🛍️ 🛒 💳 💰 📦 🚚 📅 ⏰ 📍 📞 💬 📣 📢 ✅ ❌ ⚠️ ℹ️ " +
  "🌸 🌼 🌞 🌙 ☕ 🍰 🍕 🏠 🏢 🚗 ✈️ 📱 💻 📷 🎬 🎵 📚 🎓 🏆 🪔 🎆 🎄 👀 🤩 😢 😭 😡 🤯"
)
  .split(" ")
  .filter(Boolean);
