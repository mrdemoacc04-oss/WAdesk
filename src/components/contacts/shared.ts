import * as React from "react";
import { qs } from "@/lib/client/api";
import type { ContactQuery } from "@/lib/client/hooks";
import { formatPhone } from "@/lib/shared/phone";
import type { Contact, OptIn } from "@/lib/shared/types";

export const PAGE_SIZE = 50;

export const OPT_LABEL: Record<OptIn, string> = {
  opted_in: "Opted in",
  pending: "Unconfirmed",
  opted_out: "Opted out",
};

export const OPT_OPTIONS: { value: OptIn; label: string; description: string }[] = [
  { value: "pending", label: "Unconfirmed", description: "Saved, but not messaged in campaigns" },
  { value: "opted_in", label: "Opted in", description: "Agreed to receive WhatsApp messages" },
  { value: "opted_out", label: "Opted out", description: "Asked not to be messaged" },
];

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Added manually",
  import: "Imported",
  inbound: "Inbound message",
  api: "API",
  link: "Link or QR",
  demo: "Sample data",
};

export interface ContactFilters {
  opt_in: "all" | OptIn;
  tags: string[];
  tag_mode: "any" | "all";
  segment_id: string;
  source: string;
}

export const EMPTY_FILTERS: ContactFilters = { opt_in: "all", tags: [], tag_mode: "any", segment_id: "", source: "" };

export const hasActiveFilters = (f: ContactFilters, q: string) =>
  !!q.trim() || f.opt_in !== "all" || f.tags.length > 0 || !!f.segment_id || !!f.source;

export function toQuery(f: ContactFilters, q: string): ContactQuery {
  return {
    q: q.trim() || undefined,
    tags: f.tags,
    tag_mode: f.tags.length > 1 ? f.tag_mode : undefined,
    opt_in: f.opt_in === "all" ? undefined : f.opt_in,
    source: f.source || undefined,
    segment_id: f.segment_id || undefined,
  };
}

/** The same filter in the shape `POST /api/contacts/bulk` expects. */
export function toBulkFilter(f: ContactFilters, q: string) {
  const out: Record<string, unknown> = {};
  if (q.trim()) out.q = q.trim();
  if (f.tags.length) {
    out.tags = f.tags;
    out.tag_mode = f.tag_mode;
  }
  if (f.opt_in !== "all") out.opt_in = f.opt_in;
  if (f.source) out.source = f.source;
  if (f.segment_id) out.segment_id = f.segment_id;
  return out;
}

export function exportHref(f: ContactFilters, q: string) {
  return `/api/contacts/export${qs({
    q: q.trim(),
    tags: f.tags,
    tag_mode: f.tags.length > 1 ? f.tag_mode : undefined,
    opt_in: f.opt_in === "all" ? undefined : f.opt_in,
    segment_id: f.segment_id,
  })}`;
}

export const displayName = (c: Pick<Contact, "name" | "phone">) => c.name?.trim() || formatPhone(c.phone);

/** Debounce a fast-changing value. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
