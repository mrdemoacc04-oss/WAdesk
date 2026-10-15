import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export type PhoneResult =
  | { ok: true; e164: string; country: string | null; national: string }
  | { ok: false; reason: string };

/** Excel loves turning 9876543210 into 9.87654321E9 — undo that before parsing. */
function unscientific(raw: string): string {
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n.toFixed(0);
  }
  return raw;
}

export function normalizePhone(input: unknown, defaultCountry: string = "IN"): PhoneResult {
  if (input === null || input === undefined) return { ok: false, reason: "Empty" };
  let s = unscientific(String(input).trim());
  if (!s) return { ok: false, reason: "Empty" };
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.length < 7) return { ok: false, reason: "Too short" };
  const cc = (defaultCountry || "IN") as CountryCode;
  let parsed = parsePhoneNumberFromString(s, cc);
  if ((!parsed || !parsed.isValid()) && !s.startsWith("+")) {
    const alt = parsePhoneNumberFromString("+" + s);
    if (alt?.isValid()) parsed = alt;
  }
  if (!parsed || !parsed.isValid()) return { ok: false, reason: "Not a valid phone number" };
  return {
    ok: true,
    e164: parsed.number,
    country: parsed.country ?? null,
    national: parsed.formatNational(),
  };
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const p = parsePhoneNumberFromString(e164);
  return p ? p.formatInternational() : e164;
}

/** wa_id from Meta is digits-only (no +). */
export function fromWaId(waId: string): string {
  return waId.startsWith("+") ? waId : `+${waId}`;
}
export function toWaId(e164: string): string {
  return e164.replace(/[^\d]/g, "");
}

let _countries: { code: string; name: string; dial: string }[] | null = null;
export function countryList() {
  if (_countries) return _countries;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  _countries = getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return _countries;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
