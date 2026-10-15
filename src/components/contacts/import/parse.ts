/* Turns any supported upload into a plain table of strings, so the rest of the wizard only ever deals with one shape. */

export const MAX_ROWS = 50_000;
export const MAX_BYTES = 30 * 1024 * 1024;

export const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.xlsb,.ods,.vcf,.vcard,.json";

export type FileKind = "csv" | "sheet" | "vcf" | "json" | "paste";

export interface ParsedFile {
  kind: FileKind;
  name: string;
  size: number;
  /** every non-blank row as text, including a header row if there is one */
  rows: string[][];
  /** the row number each entry of `rows` had in the original file (1-based) */
  rowNos: number[];
  columnCount: number;
  /** does the first row look like column titles? */
  headerGuess: boolean;
  /** vCard, JSON and pasted lists carry their own column names, so the toggle is hidden */
  headerLocked: boolean;
  note?: string;
  warnings: string[];
  sheets?: string[];
  sheet?: string;
}

export class ParseError extends Error {}

const FRIENDLY_FORMATS = "CSV, Excel (.xlsx, .xls), OpenDocument (.ods), vCard (.vcf), JSON or a plain text list";

const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/ /g, " ").trim());

export function looksLikePhone(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(t)) return true;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  const rest = t.replace(/[\s()+\-.]/g, "");
  return /^\+?\d+$/.test(rest);
}

function guessHeader(rows: string[][]): boolean {
  const first = rows[0];
  if (!first || !first.some(Boolean)) return false;
  const phoneish = (r: string[]) => r.some((c) => looksLikePhone(c) || c.includes("@"));
  if (phoneish(first)) return false;
  const second = rows[1];
  if (second && phoneish(second)) return true;
  // no second row to compare: titles are short words, not data
  return first.some((c) => /[a-z]/i.test(c));
}

function finish(partial: Omit<ParsedFile, "columnCount" | "headerGuess" | "headerLocked" | "warnings"> & Partial<Pick<ParsedFile, "headerGuess" | "headerLocked" | "warnings">>): ParsedFile {
  const width = partial.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const rows = partial.rows.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill("")]));
  const locked = partial.headerLocked ?? false;
  if (!rows.length || width === 0) throw new ParseError("We couldn't find any rows in this file. Check that it isn't empty.");
  const dataRows = rows.length - (locked || guessHeader(rows) ? 1 : 0);
  if (dataRows > MAX_ROWS) {
    throw new ParseError(`This file has ${dataRows.toLocaleString("en-IN")} rows. We import up to ${MAX_ROWS.toLocaleString("en-IN")} at a time, so split it into smaller files and import them one after the other.`);
  }
  return {
    ...partial,
    rows,
    columnCount: width,
    headerLocked: locked,
    headerGuess: partial.headerGuess ?? (locked ? true : guessHeader(rows)),
    warnings: partial.warnings ?? [],
  };
}

/** Drop blank rows but remember where each remaining row sat in the file. */
function compact(all: string[][], firstRowNo = 1): { rows: string[][]; rowNos: number[] } {
  const rows: string[][] = [];
  const rowNos: number[] = [];
  all.forEach((r, i) => {
    const cells = r.map(cell);
    if (cells.some(Boolean)) {
      rows.push(cells);
      rowNos.push(i + firstRowNo);
    }
  });
  return { rows, rowNos };
}

/* ───────── entry point ───────── */

export async function parseFile(file: File, opts: { sheet?: string } = {}): Promise<ParsedFile> {
  if (file.size === 0) throw new ParseError("This file is empty.");
  if (file.size > MAX_BYTES) throw new ParseError(`This file is ${(file.size / 1048576).toFixed(0)} MB. Please keep files under ${MAX_BYTES / 1048576} MB, or split them up.`);

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const info = { name: file.name, size: file.size };

  if (["xlsx", "xls", "xlsm", "xlsb", "ods"].includes(ext)) return parseSheet(file, info, opts.sheet);
  if (["csv", "tsv", "txt", "tab"].includes(ext)) return parseDelimited(await readText(file), info);
  if (["vcf", "vcard"].includes(ext)) return parseVcf(await readText(file), info);
  if (ext === "json") return parseJson(await readText(file), info);

  if (["pdf", "doc", "docx", "pages", "numbers", "key", "zip", "png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    throw new ParseError(`.${ext} files can't be read here. Export your contacts as CSV or Excel first, or use “Paste numbers”.`);
  }

  // unknown or missing extension: sniff the content
  const text = await readText(file);
  const head = text.trimStart().slice(0, 40).toUpperCase();
  if (head.startsWith("BEGIN:VCARD")) return parseVcf(text, info);
  if (head.startsWith("{") || head.startsWith("[")) return parseJson(text, info);
  if (/[\x00-\x08]/.test(text.slice(0, 2000))) throw new ParseError(`We don't recognise this file type. Upload ${FRIENDLY_FORMATS}.`);
  return parseDelimited(text, info);
}

async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf).replace(/^﻿/, "");
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf).replace(/^﻿/, "");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    // older Excel exports are Windows-1252, not UTF-8
    return new TextDecoder("windows-1252").decode(buf);
  }
}

type Info = { name: string; size: number };

/* ───────── csv / tsv / txt ───────── */

async function parseDelimited(text: string, info: Info): Promise<ParsedFile> {
  const Papa = (await import("papaparse")).default;
  const res = Papa.parse<string[]>(text, { delimiter: "", delimitersToGuess: [",", "\t", ";", "|"], skipEmptyLines: false });
  const warnings: string[] = [];
  for (const e of res.errors) {
    if (e.code === "UndetectableDelimiter") continue; // a single-column list is fine
    if (warnings.length < 5) warnings.push(`Row ${(e.row ?? 0) + 1}: ${e.message}`);
  }
  const { rows, rowNos } = compact(res.data);
  return finish({ kind: "csv", ...info, rows, rowNos, warnings });
}

/* ───────── excel / ods ───────── */

async function parseSheet(file: File, info: Info, wanted?: string): Promise<ParsedFile> {
  let XLSX: typeof import("xlsx");
  try {
    XLSX = await import("xlsx");
  } catch {
    throw new ParseError("The spreadsheet reader couldn't be loaded. Check your connection and try again, or upload a CSV.");
  }
  let wb;
  try {
    wb = XLSX.read(await file.arrayBuffer());
  } catch {
    throw new ParseError("We couldn't open this spreadsheet. It may be damaged or password-protected. Try saving it as .xlsx or CSV.");
  }
  const names = wb.SheetNames ?? [];
  if (!names.length) throw new ParseError("This workbook has no sheets.");

  const readSheet = (name: string) => {
    const ws = wb.Sheets[name];
    if (!ws) return null;
    // Excel shows long numbers like 919876543210 as 9.87654E+11 in General format. Keep every digit.
    for (const addr of Object.keys(ws)) {
      if (addr[0] === "!") continue;
      const c = ws[addr] as { t?: string; v?: unknown; w?: string };
      if (c?.t === "n" && typeof c.v === "number" && Number.isInteger(c.v) && Math.abs(c.v) >= 1e9 && c.w && /e[+-]?\d/i.test(c.w)) c.w = c.v.toFixed(0);
    }
    const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: true });
    return { ...compact(raw.map((r) => r.map(cell)), (ref?.s.r ?? 0) + 1) };
  };

  let chosen = wanted && names.includes(wanted) ? wanted : undefined;
  let data = chosen ? readSheet(chosen) : null;
  if (!data) {
    for (const n of names) {
      const d = readSheet(n);
      if (d && d.rows.length) {
        chosen = n;
        data = d;
        break;
      }
    }
  }
  if (!data || !data.rows.length || !chosen) throw new ParseError("We couldn't find any rows in this spreadsheet. Is the first sheet empty?");

  return finish({
    kind: "sheet",
    ...info,
    rows: data.rows,
    rowNos: data.rowNos,
    sheets: names.length > 1 ? names : undefined,
    sheet: chosen,
    note: names.length > 1 ? `Sheet “${chosen}” of ${names.length}` : undefined,
  });
}

/* ───────── vCard ───────── */

function qpDecode(s: string): string {
  const bytes: number[] = [];
  const enc = new TextEncoder();
  for (let i = 0; i < s.length; i++) {
    const hex = s.slice(i + 1, i + 3);
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else bytes.push(...enc.encode(s[i]));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const vUnescape = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

function parseVcf(text: string, info: Info): ParsedFile {
  // unfold continuation lines (and quoted-printable soft breaks)
  const logical: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    const last = logical.length - 1;
    if (last >= 0 && /^[ \t]/.test(line)) logical[last] += line.slice(1);
    else if (last >= 0 && /QUOTED-PRINTABLE/i.test(logical[last]) && logical[last].endsWith("=")) logical[last] = logical[last].slice(0, -1) + line;
    else logical.push(line);
  }

  const out: string[][] = [["Name", "Phone", "Email", "Company"]];
  const nos: number[] = [0];
  let card: { fn: string; n: string; tels: string[]; email: string; org: string } | null = null;
  let cardNo = 0;
  let noPhone = 0;

  const flush = () => {
    if (!card) return;
    const name = card.fn || card.n;
    if (!card.tels.length) {
      if (name || card.email) noPhone++;
    } else {
      for (const t of card.tels) {
        out.push([name, t, card.email, card.org]);
        nos.push(cardNo);
      }
    }
    card = null;
  };

  for (const line of logical) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") {
      flush();
      cardNo++;
      card = { fn: "", n: "", tels: [], email: "", org: "" };
      continue;
    }
    if (upper === "END:VCARD") {
      flush();
      continue;
    }
    if (!card) continue;
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const left = line.slice(0, idx);
    const [rawName, ...params] = left.split(";");
    const prop = rawName.split(".").pop()!.toUpperCase();
    let value = line.slice(idx + 1);
    if (params.some((p) => /ENCODING=QUOTED-PRINTABLE/i.test(p) || /^QUOTED-PRINTABLE$/i.test(p))) value = qpDecode(value);

    if (prop === "FN") card.fn = vUnescape(value).trim();
    else if (prop === "N") {
      const [family = "", given = "", additional = ""] = value.split(";").map((x) => vUnescape(x).trim());
      card.n = [given, additional, family].filter(Boolean).join(" ");
    } else if (prop === "TEL") {
      const tel = vUnescape(value).replace(/^tel:/i, "").trim();
      if (tel) card.tels.push(tel);
    } else if (prop === "EMAIL" && !card.email) card.email = vUnescape(value).trim();
    else if (prop === "ORG" && !card.org) card.org = value.split(";").map((x) => vUnescape(x).trim()).filter(Boolean)[0] ?? "";
  }
  flush();

  if (out.length === 1) {
    throw new ParseError(cardNo ? "None of the contacts in this vCard have a phone number." : "We couldn't find any contacts in this vCard file.");
  }
  const warnings = noPhone ? [`${noPhone} ${noPhone === 1 ? "contact has" : "contacts have"} no phone number and ${noPhone === 1 ? "was" : "were"} left out.`] : [];
  return finish({ kind: "vcf", ...info, rows: out, rowNos: nos, headerLocked: true, headerGuess: true, warnings, note: `${cardNo} ${cardNo === 1 ? "contact" : "contacts"} in the file` });
}

/* ───────── json ───────── */

function flatten(v: unknown, prefix: string, into: Record<string, string>, depth = 0) {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    into[prefix] = v.every((x) => x === null || typeof x !== "object") ? v.map(cell).filter(Boolean).join(", ") : JSON.stringify(v);
  } else if (typeof v === "object" && depth < 2) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) flatten(val, prefix ? `${prefix}.${k}` : k, into, depth + 1);
  } else if (typeof v === "object") into[prefix] = JSON.stringify(v);
  else into[prefix] = cell(v);
}

function parseJson(text: string, info: Info): ParsedFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ParseError(`This isn't valid JSON (${e instanceof Error ? e.message : "parse error"}).`);
  }
  let arr: unknown[] | null = Array.isArray(data) ? data : null;
  if (!arr && data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    arr = [o.contacts, o.data, o.rows, o.items, o.results].find((x): x is unknown[] => Array.isArray(x)) ?? null;
  }
  if (!arr) throw new ParseError("Expected a JSON array of contacts, or an object like { \"contacts\": [ … ] }.");
  if (!arr.length) throw new ParseError("This JSON file has no contacts in it.");

  // array of plain numbers or strings
  if (arr.every((x) => x === null || typeof x !== "object")) {
    const rows = [["Phone"], ...arr.map((x) => [cell(x)])];
    return finish({ kind: "json", ...info, rows, rowNos: rows.map((_, i) => i), headerLocked: true, headerGuess: true });
  }
  // array of arrays
  if (arr.every((x) => Array.isArray(x))) {
    const { rows, rowNos } = compact(arr as unknown[][] as string[][]);
    return finish({ kind: "json", ...info, rows, rowNos });
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  const flat: Record<string, string>[] = [];
  for (const item of arr) {
    const rec: Record<string, string> = {};
    flatten(item, "", rec);
    flat.push(rec);
    for (const k of Object.keys(rec)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  const rows = [keys, ...flat.map((r) => keys.map((k) => r[k] ?? ""))];
  return finish({ kind: "json", ...info, rows, rowNos: rows.map((_, i) => i), headerLocked: true, headerGuess: true });
}

/* ───────── pasted numbers ───────── */

const PHONE_IN_TEXT = /(\+?\d[\d\s().-]{5,}\d)/;

export function parsePaste(text: string): ParsedFile {
  const out: string[][] = [["Name", "Phone"]];
  const nos: number[] = [0];
  text.split(/\r\n|\n|\r/).forEach((line, i) => {
    const l = line.trim();
    if (!l) return;
    const parts = l.split(/[,\t;|]/).map((p) => p.trim()).filter(Boolean);
    let name = "";
    let phone = "";
    if (parts.length >= 2) {
      const pi = parts.findIndex((p) => looksLikePhone(p));
      if (pi >= 0) {
        phone = parts[pi];
        name = parts.filter((_, j) => j !== pi).join(" ");
      } else {
        // no part looks like a number: keep the one with the most digits so it shows up as a problem row
        const best = parts.reduce((a, b) => (b.replace(/\D/g, "").length > a.replace(/\D/g, "").length ? b : a));
        phone = best;
        name = parts.filter((p) => p !== best).join(" ");
      }
    } else {
      const only = parts[0] ?? "";
      if (looksLikePhone(only)) phone = only;
      else {
        const m = PHONE_IN_TEXT.exec(only);
        if (m) {
          phone = m[1].trim();
          name = only.replace(m[1], "").replace(/[-–:]+\s*$|^\s*[-–:]+/g, "").trim();
        } else phone = only;
      }
    }
    out.push([name, phone]);
    nos.push(i + 1);
  });
  if (out.length === 1) throw new ParseError("Paste at least one number first.");
  if (out.length - 1 > MAX_ROWS) throw new ParseError(`That's ${(out.length - 1).toLocaleString("en-IN")} lines. We import up to ${MAX_ROWS.toLocaleString("en-IN")} at a time.`);
  return {
    kind: "paste",
    name: "Pasted numbers",
    size: new Blob([text]).size,
    rows: out,
    rowNos: nos,
    columnCount: 2,
    headerGuess: true,
    headerLocked: true,
    warnings: [],
  };
}
