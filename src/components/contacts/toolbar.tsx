"use client";
import * as React from "react";
import { CaretDown, MagnifyingGlass, Funnel, X, Tag as TagIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { TagChip } from "@/components/ui/tag-input";
import { useSegments, useTags } from "@/lib/client/hooks";
import { cn, fmtNum } from "@/lib/shared/utils";
import type { OptIn } from "@/lib/shared/types";
import { SOURCE_LABEL, type ContactFilters } from "./shared";

const ALL = "__all";

export type SortKey = "created_at" | "name" | "last_inbound_at";

const SORT_OPTIONS: { value: string; label: string; sort: SortKey; dir: "asc" | "desc" }[] = [
  { value: "created_at:desc", label: "Newest first", sort: "created_at", dir: "desc" },
  { value: "created_at:asc", label: "Oldest first", sort: "created_at", dir: "asc" },
  { value: "name:asc", label: "Name A to Z", sort: "name", dir: "asc" },
  { value: "name:desc", label: "Name Z to A", sort: "name", dir: "desc" },
  { value: "last_inbound_at:desc", label: "Recently active", sort: "last_inbound_at", dir: "desc" },
];

export function Toolbar({
  search,
  onSearch,
  filters,
  onFilters,
  counts,
  sort,
  dir,
  onSort,
  onManageSegments,
  onClear,
  dirty,
}: {
  search: string;
  onSearch: (v: string) => void;
  filters: ContactFilters;
  onFilters: (patch: Partial<ContactFilters>) => void;
  counts?: { total: number; opted_in: number; pending: number; opted_out: number };
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (s: SortKey, d: "asc" | "desc") => void;
  onManageSegments: () => void;
  onClear: () => void;
  dirty: boolean;
}) {
  const { data: segments } = useSegments();
  const segmentOptions = [
    { value: ALL, label: "All contacts" },
    ...(segments ?? []).map((s) => ({ value: s.id, label: s.name, description: `${fmtNum(s.count ?? 0)} opted in` })),
  ];
  const sourceOptions = [{ value: ALL, label: "All sources" }, ...Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))];

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-full min-w-0 sm:w-auto sm:min-w-[280px] sm:max-w-sm sm:flex-1"
          leading={<MagnifyingGlass size={16} />}
          trailing={
            search ? (
              <button type="button" onClick={() => onSearch("")} aria-label="Clear search" className="grid size-6 place-items-center rounded-full hover:bg-ink/[0.07]">
                <X size={13} />
              </button>
            ) : undefined
          }
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, number or email"
          aria-label="Search contacts"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
        />
        <Segmented<"all" | OptIn>
          aria-label="Filter by opt-in status"
          value={filters.opt_in}
          onValueChange={(v) => onFilters({ opt_in: v })}
          options={[
            { value: "all", label: "All" },
            { value: "opted_in", label: <Counted label="Opted in" n={counts?.opted_in} /> },
            { value: "pending", label: <Counted label="Unconfirmed" n={counts?.pending} /> },
            { value: "opted_out", label: <Counted label="Opted out" n={counts?.opted_out} /> },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TagsFilter value={filters.tags} mode={filters.tag_mode} onChange={(tags, tag_mode) => onFilters({ tags, tag_mode })} />

        <Select
          size="sm"
          aria-label="Saved segment"
          className="w-auto min-w-[168px] max-w-[220px]"
          value={filters.segment_id || ALL}
          onValueChange={(v) => onFilters({ segment_id: v === ALL ? "" : v })}
          options={segmentOptions}
        />
        <Button variant="ghost" size="sm" onClick={onManageSegments} leading={<Funnel size={15} />}>
          Manage segments
        </Button>

        <Select
          size="sm"
          aria-label="Source"
          className="w-auto min-w-[136px]"
          value={filters.source || ALL}
          onValueChange={(v) => onFilters({ source: v === ALL ? "" : v })}
          options={sourceOptions}
        />

        <Select
          size="sm"
          aria-label="Sort contacts"
          className="ml-auto w-auto min-w-[136px] md:hidden"
          value={`${sort}:${dir}`}
          onValueChange={(v) => {
            const o = SORT_OPTIONS.find((x) => x.value === v);
            if (o) onSort(o.sort, o.dir);
          }}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />

        {dirty && (
          <Button variant="ghost" size="sm" onClick={onClear} leading={<X size={14} />}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

function Counted({ label, n }: { label: string; n?: number }) {
  return (
    <>
      {label}
      {n !== undefined && <span className="tabular text-[11px] text-ink-4">{fmtNum(n)}</span>}
    </>
  );
}

/* ───────── tags filter ───────── */

function TagsFilter({
  value,
  mode,
  onChange,
}: {
  value: string[];
  mode: "any" | "all";
  onChange: (tags: string[], mode: "any" | "all") => void;
}) {
  const { data: tags } = useTags();
  const [q, setQ] = React.useState("");
  const list = (tags ?? []).filter((t) => t.name.includes(q.toLowerCase().trim()));
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((t) => t !== name) : [...value, name], mode);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={value.length ? "soft" : "secondary"}
          size="sm"
          leading={<TagIcon size={15} />}
          trailing={<CaretDown size={12} />}
          aria-label={value.length ? `Tags filter, ${value.length} selected` : "Filter by tags"}
        >
          {value.length ? `Tags · ${value.length}` : "Tags"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[290px] p-0" align="start">
        <div className="border-b border-line p-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tag" aria-label="Find a tag" leading={<MagnifyingGlass size={15} />} className="[&_input]:h-9" />
        </div>
        <div className="max-h-[260px] overflow-y-auto p-1.5" role="group" aria-label="Tags">
          {!tags && <p className="px-3 py-6 text-center text-sm text-ink-3">Loading tags…</p>}
          {tags && list.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-3">{tags.length ? "No tag matches" : "No tags yet. Add tags to a contact and they show up here."}</p>}
          {list.map((t) => {
            const on = value.includes(t.name);
            return (
              <label
                key={t.id}
                className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-ink/[0.05]", on && "bg-accent-soft/60")}
              >
                <Checkbox checked={on} onCheckedChange={() => toggle(t.name)} aria-label={t.name} />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="tabular text-xs text-ink-3">{fmtNum(t.count)}</span>
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line p-3">
          <Segmented<"any" | "all">
            size="sm"
            aria-label="Match mode"
            value={mode}
            onValueChange={(m) => onChange(value, m)}
            options={[
              { value: "any", label: "Any tag" },
              { value: "all", label: "All tags" },
            ]}
          />
          <Button variant="ghost" size="xs" disabled={!value.length} onClick={() => onChange([], mode)}>
            Clear
          </Button>
        </div>
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-line p-3">
            {value.map((t) => (
              <TagChip key={t} tag={t} onRemove={() => toggle(t)} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
