import { normalizePhone } from "@/lib/shared/phone";
import { slugify } from "@/lib/shared/utils";
import { looksLikePhone, type ParsedFile } from "./parse";

export type Target = "name" | "phone" | "email" | "tags" | "custom" | "skip";

export interface ColumnMap {
  target: Target;
  /** custom field name, when target is "custom" */
  field: string;
}

export const TARGET_LABEL: Record<Target, string> = {
  name: "Name",
  phone: "Phone number",
  email: "Email",
  tags: "Tags",
  custom: "Custom field",
  skip: "Don't import",
};

/* ───────── columns ───────── */

const colLetter = (i: number) => {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

export function columnHeaders(file: ParsedFile, hasHeader: boolean): string[] {
  return Array.from({ length: file.columnCount }, (_, i) => {
    const h = hasHeader ? (file.rows[0]?.[i] ?? "").trim() : "";
    return h || `Column ${colLetter(i)}`;
  });
}

export function dataRows(file: ParsedFile, hasHeader: boolean): { cells: string[]; rowNo: number }[] {
  const start = hasHeader ? 1 : 0;
  return file.rows.slice(start).map((cells, i) => ({ cells, rowNo: file.rowNos[start + i] ?? start + i + 1 }));
}

/* ───────── auto-detect ───────── */

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const PHONE_EXACT = new Set(["phone", "number", "no", "contact", "ph", "mob", "wa", "cell", "tel", "mobile", "msisdn", "whatsapp"]);
const NAME_EXACT = new Set(["name", "fullname", "customername", "contactname", "clientname", "leadname", "displayname", "firstname", "fname", "first", "givenname", "lastname", "lname", "last", "surname", "familyname", "middlename", "person", "customer", "client"]);
const EMAIL_EXACT = new Set(["email", "emailaddress", "emailid", "mail", "mailid", "eaddress", "emailadd"]);
const TAGS_EXACT = new Set(["tag", "tags", "label", "labels", "group", "groups", "list", "lists", "segment", "segments"]);
const CUSTOM_KNOWN = new Set([
  "city", "town", "state", "region", "country", "company", "companyname", "organization", "organisation", "org", "business", "designation", "jobtitle", "title", "role",
  "address", "area", "locality", "pincode", "pin", "zip", "zipcode", "postalcode", "gender", "dob", "birthday", "birthdate", "notes", "note", "remarks", "comment", "comments",
  "source", "industry", "plan", "orderid", "order", "ordernumber", "product", "course", "interest", "budget", "website", "instagram", "language",
]);

const NESTED_PREFIX = /^(attributes|attrs|custom|customfields|custom_fields|fields|properties|meta|metadata|extra)\./i;

/** JSON and some exports name nested columns like "attributes.city": the last part is the field. */
const lastPart = (h: string) => h.split(".").pop() ?? h;

function headerTarget(h: string): Target | null {
  if (NESTED_PREFIX.test(h)) return "custom";
  const n = norm(lastPart(h));
  if (!n) return null;
  if (EMAIL_EXACT.has(n) || /email|e-?mail/i.test(h)) return "email";
  if (PHONE_EXACT.has(n) || /(phone|mobile|whatsapp|msisdn|cellphone|contactnumber|contactno|telephone)/.test(n)) return "phone";
  if (NAME_EXACT.has(n)) return "name";
  if (TAGS_EXACT.has(n)) return "tags";
  if (CUSTOM_KNOWN.has(n)) return "custom";
  return null;
}

const sample = (rows: { cells: string[] }[], col: number, n = 60) => rows.slice(0, n).map((r) => r.cells[col] ?? "").filter(Boolean);

export function autoMap(file: ParsedFile, hasHeader: boolean, defaultCountry: string): ColumnMap[] {
  const headers = columnHeaders(file, hasHeader);
  const rows = dataRows(file, hasHeader);
  const map: ColumnMap[] = headers.map((h) => ({ target: "skip" as Target, field: slugify(lastPart(h)) }));
  let havePhone = false;
  let haveEmail = false;

  if (hasHeader) {
    headers.forEach((h, i) => {
      const t = headerTarget(h);
      if (!t) return;
      if (t === "phone") {
        // a second phone-like column (alternate number…) is kept as a custom field
        if (havePhone) map[i].target = "custom";
        else {
          map[i].target = "phone";
          havePhone = true;
        }
      } else if (t === "email") {
        if (haveEmail) map[i].target = "custom";
        else {
          map[i].target = "email";
          haveEmail = true;
        }
      } else map[i].target = t;
    });
  }

  // fall back to what the cells look like (headerless files, odd headers)
  if (!havePhone) {
    let best = -1;
    let bestScore = 0.5;
    headers.forEach((_, i) => {
      if (map[i].target !== "skip" && map[i].target !== "custom") return;
      const vals = sample(rows, i);
      if (!vals.length) return;
      const score = vals.filter((v) => looksLikePhone(v) && normalizePhone(v, defaultCountry).ok).length / vals.length;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      map[best].target = "phone";
      havePhone = true;
    }
  }
  if (!haveEmail) {
    headers.forEach((_, i) => {
      if (haveEmail || map[i].target !== "skip") return;
      const vals = sample(rows, i, 30);
      if (vals.length && vals.filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).length / vals.length > 0.6) {
        map[i].target = "email";
        haveEmail = true;
      }
    });
  }
  if (!hasHeader && !map.some((m) => m.target === "name")) {
    const i = headers.findIndex((_, c) => {
      if (map[c].target !== "skip") return false;
      const vals = sample(rows, c, 30);
      return vals.length > 0 && vals.filter((v) => /^[\p{L}][\p{L} .'’-]{1,}$/u.test(v)).length / vals.length > 0.6;
    });
    if (i >= 0) map[i].target = "name";
  }
  return map;
}

/* ───────── rows ───────── */

export interface PreparedRow {
  rowNo: number;
  cells: string[];
  phoneRaw: string;
  name: string;
  email: string;
  tags: string[];
  attributes: Record<string, string>;
  badEmail?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function cleanTag(t: string): string {
  return t.toLowerCase().replace(/[,"{}\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 32);
}

export function buildRows(file: ParsedFile, hasHeader: boolean, map: ColumnMap[]): PreparedRow[] {
  const phoneCol = map.findIndex((m) => m.target === "phone");
  const emailCol = map.findIndex((m) => m.target === "email");
  const nameCols = map.flatMap((m, i) => (m.target === "name" ? [i] : []));
  const tagCols = map.flatMap((m, i) => (m.target === "tags" ? [i] : []));
  const customCols = map.flatMap((m, i) => (m.target === "custom" && m.field.trim() ? [i] : []));

  const out: PreparedRow[] = [];
  for (const { cells, rowNo } of dataRows(file, hasHeader)) {
    const phoneRaw = phoneCol >= 0 ? (cells[phoneCol] ?? "").trim() : "";
    const name = nameCols.map((i) => cells[i] ?? "").filter(Boolean).join(" ").slice(0, 200);
    let email = emailCol >= 0 ? (cells[emailCol] ?? "").trim() : "";
    let badEmail = false;
    if (email && !EMAIL_RE.test(email)) {
      badEmail = true;
      email = "";
    }
    const tags = [...new Set(tagCols.flatMap((i) => (cells[i] ?? "").split(/[,;|]/)).map(cleanTag).filter(Boolean))];
    const attributes: Record<string, string> = {};
    for (const i of customCols) {
      const v = (cells[i] ?? "").trim();
      const k = map[i].field.trim().slice(0, 80);
      if (v && k) attributes[k] = v.slice(0, 500);
    }
    // a row with nothing mapped in it is just stray whitespace
    if (!phoneRaw && !name && !email && !tags.length && !Object.keys(attributes).length) continue;
    out.push({ rowNo, cells, phoneRaw, name, email, tags, attributes, badEmail });
  }
  return out;
}

/* ───────── validation ───────── */

export interface Problem {
  row: PreparedRow;
  reason: string;
}

export interface UniqueContact {
  phone: string; // E.164
  country: string | null;
  name: string;
  email: string;
  tags: string[];
  attributes: Record<string, string>;
}

export interface Validation {
  total: number;
  /** one entry per distinct phone number, later non-empty values win (same rule as the server) */
  unique: UniqueContact[];
  invalid: Problem[];
  duplicates: number;
  badEmails: number;
}

/** What Excel does to long numbers: 9.87654E+11 has lost its digits, so don't guess. */
function shortenedByExcel(raw: string): boolean {
  const m = /^(\d+)(?:\.(\d+))?e\+?(\d+)$/i.exec(raw.trim());
  if (!m) return false;
  const mantissaDigits = (m[1] + (m[2] ?? "")).replace(/0+$/, "").length;
  const totalDigits = m[1].length + Number(m[3]);
  return totalDigits - mantissaDigits >= 4;
}

function reasonFor(reason: string, raw: string): string {
  if (reason === "Empty") return "Phone number is missing";
  if (!/\d/.test(raw)) return "Not a phone number (no digits)";
  if (/[a-z]/i.test(raw.replace(/e\+?\d+$/i, ""))) return "Contains letters, not a valid phone number";
  if (reason === "Too short") return "Too short for a phone number";
  return "Not a valid phone number";
}

export function checkPhone(raw: string, country: string): { ok: true; e164: string; country: string | null } | { ok: false; reason: string } {
  if (!raw.trim()) return { ok: false, reason: reasonFor("Empty", raw) };
  if (shortenedByExcel(raw)) return { ok: false, reason: "Excel shortened this number to scientific notation. Format the column as Text and export again." };
  const first = normalizePhone(raw, country);
  if (first.ok) return { ok: true, e164: first.e164, country: first.country };
  // “98765 43210 / 98765 11111”, “…, …”: use the first part that works
  if (/[/,;&|\n]|\sor\s/i.test(raw)) {
    for (const part of raw.split(/[/,;&|\n]|\sor\s/i)) {
      const p = normalizePhone(part, country);
      if (p.ok) return { ok: true, e164: p.e164, country: p.country };
    }
  }
  return { ok: false, reason: reasonFor(first.reason, raw) };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Validates in slices so a 50,000-row file never freezes the page. */
export async function validateRows(rows: PreparedRow[], country: string, isStale: () => boolean, onProgress?: (done: number) => void): Promise<Validation | null> {
  const byPhone = new Map<string, UniqueContact>();
  const invalid: Problem[] = [];
  let duplicates = 0;
  let badEmails = 0;
  const SLICE = 1500;

  for (let start = 0; start < rows.length; start += SLICE) {
    if (isStale()) return null;
    for (const row of rows.slice(start, start + SLICE)) {
      if (row.badEmail) badEmails++;
      const p = checkPhone(row.phoneRaw, country);
      if (!p.ok) {
        invalid.push({ row, reason: p.reason });
        continue;
      }
      const prev = byPhone.get(p.e164);
      if (prev) {
        duplicates++;
        prev.name = row.name || prev.name;
        prev.email = row.email || prev.email;
        prev.tags = [...new Set([...prev.tags, ...row.tags])];
        prev.attributes = { ...prev.attributes, ...row.attributes };
      } else {
        byPhone.set(p.e164, { phone: p.e164, country: p.country, name: row.name, email: row.email, tags: row.tags, attributes: row.attributes });
      }
    }
    onProgress?.(Math.min(rows.length, start + SLICE));
    await tick();
  }
  if (isStale()) return null;
  return { total: rows.length, unique: [...byPhone.values()], invalid, duplicates, badEmails };
}

/* ───────── downloads ───────── */

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const SAMPLE_CSV = [
  "name,phone,email,tags,city,company",
  'Asha Verma,+91 90000 00001,asha@example.com,"customer, vip",Pune,Northwind Traders',
  "Rahul Mehta,90000 00002,,lead,Mumbai,",
  "Sam Carter,+1 202 555 0147,sam@example.com,newsletter,Austin,Contoso",
  "Meera Iyer,919000000004,meera@example.com,customer,Chennai,",
].join("\n");
