/** Plain-language explanations for WhatsApp Cloud API error codes. */

export interface WaErrorInfo {
  title: string;
  hint: string;
  /** retrying later may succeed */
  transient?: boolean;
  /** the whole account/campaign should stop */
  fatal?: boolean;
  /** contact has blocked marketing — stop messaging them */
  suppress?: boolean;
}

const MAP: Record<string, WaErrorInfo> = {
  "0": { title: "Authentication failed", hint: "Your access token is invalid or expired. Generate a permanent system-user token in Meta Business settings.", fatal: true },
  "190": { title: "Access token expired", hint: "Create a new system-user token and paste it in Settings → WhatsApp.", fatal: true },
  "10": { title: "Permission denied", hint: "The token is missing the whatsapp_business_messaging permission.", fatal: true },
  "200": { title: "Permission denied", hint: "The token isn't allowed to message from this number. Check the system user's assets.", fatal: true },
  "100": { title: "Invalid parameter", hint: "Meta rejected part of the request. Check the template variables and media links." },
  "130429": { title: "Rate limit hit", hint: "Too many messages per second. WAdesk slows down and retries automatically.", transient: true },
  "80007": { title: "Rate limit hit", hint: "Your WhatsApp Business Account is sending too fast. Lower the campaign speed.", transient: true },
  "131048": { title: "Spam rate limit", hint: "Too many recipients blocked or reported recent messages. Improve targeting and consent.", transient: true },
  "131049": { title: "Meta limited this delivery", hint: "To keep the ecosystem healthy Meta didn't deliver this marketing message. Try again later — it's per-recipient, not an account fault.", transient: false },
  "131050": { title: "Recipient opted out of marketing", hint: "This person stopped marketing messages from your business. They've been suppressed.", suppress: true },
  "131026": { title: "Undeliverable", hint: "Number isn't on WhatsApp, or the user hasn't accepted the latest terms / is on an old version." },
  "131047": { title: "Outside the 24-hour window", hint: "Free-form messages only work within 24h of the customer's last message. Send a template instead." },
  "131051": { title: "Unsupported message type", hint: "WhatsApp can't deliver this message type." },
  "131052": { title: "Media download failed", hint: "The user's media couldn't be downloaded." },
  "131053": { title: "Media upload failed", hint: "Meta couldn't fetch your media file. Use a public HTTPS link and a supported format/size." },
  "131056": { title: "Pair rate limit", hint: "Too many messages to this one recipient too quickly.", transient: true },
  "131021": { title: "Sender and recipient are the same", hint: "You can't message your own business number." },
  "131031": { title: "Account locked", hint: "Your WhatsApp Business Account is restricted. Check Meta Business Support.", fatal: true },
  "132000": { title: "Template variables mismatch", hint: "Number of variables sent doesn't match the template." },
  "132001": { title: "Template not found", hint: "The template doesn't exist in this language or isn't approved yet." },
  "132005": { title: "Template text too long", hint: "After inserting variables the text exceeds the limit." },
  "132007": { title: "Template violates policy", hint: "Meta's content policy blocked this template." },
  "132012": { title: "Variable format mismatch", hint: "A variable value contains characters Meta doesn't allow (e.g. line breaks)." },
  "132015": { title: "Template paused", hint: "Low quality score paused this template. Edit it or wait for the pause to lift." },
  "132016": { title: "Template disabled", hint: "This template has been disabled by Meta for repeated low quality." },
  "133010": { title: "Phone number not registered", hint: "Your sending number isn't registered on the Cloud API.", fatal: true },
  "133000": { title: "Deregistration failed", hint: "Retry the phone number registration." },
  "135000": { title: "Generic user error", hint: "Meta rejected the message payload." },
  "368": { title: "Temporarily blocked", hint: "Meta blocked messaging for policy violations. Review account quality in Business Manager.", fatal: true },
  "1": { title: "Unknown Meta error", hint: "Meta had an internal problem. Safe to retry.", transient: true },
  "2": { title: "Meta service unavailable", hint: "Temporary outage on Meta's side.", transient: true },
  "4": { title: "Too many API calls", hint: "Application-level rate limit.", transient: true },
  "17": { title: "User-level rate limit", hint: "Slow down — rate limit reached.", transient: true },
  "131000": { title: "Something went wrong", hint: "Meta couldn't process the request. Retry.", transient: true },
  "131005": { title: "Access denied", hint: "The token can't access this phone number.", fatal: true },
  "131008": { title: "Required parameter missing", hint: "A required field was empty in the request." },
  "131009": { title: "Parameter value invalid", hint: "One of the parameters has an invalid value." },
  "131016": { title: "Service unavailable", hint: "Temporary issue on Meta's side.", transient: true },
  "DEMO": { title: "Demo contact", hint: "Sample contacts are never sent through a live WhatsApp connection." },
  "MISSING_VAR": { title: "Missing variable value", hint: "This contact has no value for a variable and no fallback was set." },
  "NO_CONNECTION": { title: "WhatsApp not connected", hint: "Add your Cloud API credentials in Settings → WhatsApp.", fatal: true },
  "CANCELLED": { title: "Campaign cancelled", hint: "This message was never sent because the campaign was cancelled." },
  "OPTED_OUT": { title: "Contact opted out", hint: "This contact opted out of messages." },
};

export function waErrorInfo(code: string | number | null | undefined): WaErrorInfo {
  const k = String(code ?? "");
  return MAP[k] ?? { title: k ? `Error ${k}` : "Delivery failed", hint: "Open the error details for Meta's message." };
}

export function isFatal(code: string | number | null | undefined) {
  return !!waErrorInfo(code).fatal;
}
