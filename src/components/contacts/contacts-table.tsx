"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, CaretLeft, CaretRight, UsersThree, UploadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Avatar, Card, EmptyState, Skeleton } from "@/components/ui/display";
import { Tooltip } from "@/components/ui/menu";
import { TagChip } from "@/components/ui/tag-input";
import { OptInBadge } from "@/components/status";
import { ago, cn, dateOnly, fmtNum } from "@/lib/shared/utils";
import { flagEmoji, formatPhone } from "@/lib/shared/phone";
import type { Contact } from "@/lib/shared/types";
import { PAGE_SIZE, displayName } from "./shared";
import type { SortKey } from "./toolbar";

function Flag({ code }: { code: string | null }) {
  const f = flagEmoji(code);
  return f ? (
    <span className="text-[15px] leading-none" role="img" aria-label={code ?? undefined}>
      {f}
    </span>
  ) : (
    <span className="size-3.5 rounded-full bg-ink/10" aria-hidden />
  );
}

function TagsCell({ tags, wrap }: { tags: string[]; wrap?: boolean }) {
  if (!tags.length) return wrap ? null : <span className="text-ink-4">—</span>;
  const max = wrap ? 3 : 2;
  const shown = tags.slice(0, max);
  const rest = tags.slice(max);
  return (
    <div className={cn("flex items-center gap-1.5", wrap ? "flex-wrap" : "overflow-hidden")}>
      {shown.map((t) => (
        <TagChip key={t} tag={t} className={cn("max-w-[140px] truncate", wrap && "shrink-0")} />
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.join(", ")}>
          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-ink/[0.06] px-2 text-xs font-medium text-ink-3">+{rest.length}</span>
        </Tooltip>
      )}
    </div>
  );
}

const lastActive = (c: Contact) => c.last_inbound_at;

export function ContactsTable({
  rows,
  total,
  offset,
  loading,
  validating,
  sort,
  dir,
  onSort,
  selected,
  onToggle,
  onTogglePage,
  onOpen,
  onPage,
  filtered,
  onAdd,
  onClear,
}: {
  rows: Contact[];
  total: number;
  offset: number;
  loading: boolean;
  validating: boolean;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onTogglePage: (checked: boolean) => void;
  onOpen: (id: string) => void;
  onPage: (offset: number) => void;
  filtered: boolean;
  onAdd: () => void;
  onClear: () => void;
}) {
  const pageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pageSome = rows.some((r) => selected.has(r.id));
  const headState: boolean | "indeterminate" = pageSelected ? true : pageSome ? "indeterminate" : false;

  const empty = !loading && rows.length === 0;

  return (
    <Card padded={false}>
      {empty ? (
        filtered ? (
          <EmptyState
            icon={<MagnifyingGlass />}
            title="No contacts match"
            description="Nothing fits these filters. Try a different search, or clear the filters to see everyone."
            action={
              <Button variant="secondary" onClick={onClear}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<UsersThree />}
            title="No contacts yet"
            description="Import a spreadsheet, a vCard or a pasted list of numbers, or add your first contact by hand."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link href="/contacts/import" className={buttonVariants({ variant: "primary" })}>
                  <UploadSimple size={16} /> Import contacts
                </Link>
                <Button variant="secondary" onClick={onAdd}>
                  Add a contact
                </Button>
              </div>
            }
          />
        )
      ) : (
        <>
          {/* desktop table */}
          <div className={cn("hidden max-h-[min(70dvh,820px)] overflow-auto transition-opacity duration-300 md:block", validating && !loading && "opacity-70")}>
            <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <Th className="w-12 pl-5">
                    <Checkbox checked={headState} onCheckedChange={(c) => onTogglePage(c === true)} aria-label="Select all contacts on this page" />
                  </Th>
                  <Th sortable="name" sort={sort} dir={dir} onSort={onSort}>
                    Contact
                  </Th>
                  <Th>WhatsApp number</Th>
                  <Th>Tags</Th>
                  <Th>Opt-in</Th>
                  <Th sortable="last_inbound_at" sort={sort} dir={dir} onSort={onSort}>
                    Last active
                  </Th>
                  <Th sortable="created_at" sort={sort} dir={dir} onSort={onSort} className="pr-5">
                    Added
                  </Th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 9 }, (_, i) => <SkeletonRow key={i} />)
                  : rows.map((c) => {
                      const on = selected.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => onOpen(c.id)}
                          data-selected={on || undefined}
                          className="group h-14 cursor-pointer transition-colors duration-200 hover:bg-surface-2/80 data-[selected]:bg-accent-soft/50"
                        >
                          <Td className="w-12 pl-5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={on} onCheckedChange={() => onToggle(c.id)} aria-label={`Select ${displayName(c)}`} />
                          </Td>
                          <Td>
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar name={c.name} seed={c.phone} size={36} />
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpen(c.id);
                                  }}
                                  className="block max-w-[260px] truncate rounded-md text-left font-medium outline-none focus-visible:underline"
                                >
                                  {c.name?.trim() || <span className="text-ink-3">Unnamed</span>}
                                </button>
                                <div className="max-w-[260px] truncate text-xs text-ink-3">{c.email || "No email"}</div>
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <Flag code={c.country} />
                              <span className="tabular font-mono text-[13px]">{formatPhone(c.phone)}</span>
                            </span>
                          </Td>
                          <Td className="max-w-[240px]">
                            <TagsCell tags={c.tags} />
                          </Td>
                          <Td>
                            <OptInBadge status={c.opt_in} />
                          </Td>
                          <Td className="whitespace-nowrap text-ink-2">{lastActive(c) ? ago(lastActive(c)) : <span className="text-ink-4">—</span>}</Td>
                          <Td className="whitespace-nowrap pr-5 text-ink-2">{dateOnly(c.created_at)}</Td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <ul className={cn("divide-y divide-line md:hidden", validating && !loading && "opacity-70")}>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <li key={i} className="flex gap-3 p-4">
                    <Skeleton className="size-5" />
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </li>
                ))
              : rows.map((c) => {
                  const on = selected.has(c.id);
                  return (
                    <li key={c.id} data-selected={on || undefined} className="relative flex items-start gap-3 p-4 data-[selected]:bg-accent-soft/50">
                      <div className="pt-2.5">
                        <Checkbox checked={on} onCheckedChange={() => onToggle(c.id)} aria-label={`Select ${displayName(c)}`} />
                      </div>
                      <button type="button" onClick={() => onOpen(c.id)} className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                        <Avatar name={c.name} seed={c.phone} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate font-medium">{c.name?.trim() || <span className="text-ink-3">Unnamed</span>}</span>
                            <OptInBadge status={c.opt_in} />
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
                            <Flag code={c.country} />
                            <span className="tabular font-mono">{formatPhone(c.phone)}</span>
                          </span>
                          {c.email && <span className="block truncate text-xs text-ink-3">{c.email}</span>}
                          {c.tags.length > 0 && (
                            <span className="mt-2 block">
                              <TagsCell tags={c.tags} wrap />
                            </span>
                          )}
                          <span className="mt-2 block text-xs text-ink-3">
                            Added {dateOnly(c.created_at)}
                            {c.last_inbound_at ? ` · Active ${ago(c.last_inbound_at)}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
          </ul>

          {/* pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <p className="tabular text-[13px] text-ink-3" aria-live="polite">
              {loading ? "Loading…" : total === 0 ? "0 contacts" : `${fmtNum(offset + 1)}–${fmtNum(offset + rows.length)} of ${fmtNum(total)}`}
            </p>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" disabled={offset <= 0 || loading} onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))} leading={<CaretLeft size={14} />}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => onPage(offset + PAGE_SIZE)} trailing={<CaretRight size={13} />}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function Th({
  children,
  className,
  sortable,
  sort,
  dir,
  onSort,
}: {
  children?: React.ReactNode;
  className?: string;
  sortable?: SortKey;
  sort?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
}) {
  const active = sortable && sort === sortable;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : sortable ? "none" : undefined}
      className={cn("sticky top-0 z-10 h-11 whitespace-nowrap border-b border-line bg-surface px-3 text-left align-middle font-normal first:rounded-tl-[20px] last:rounded-tr-[20px]", className)}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort?.(sortable)}
          className={cn("-mx-2 inline-flex h-8 items-center gap-1 rounded-full px-2 outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60", active && "text-ink")}
        >
          {children}
          {active ? dir === "asc" ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" /> : <ArrowDown size={12} className="opacity-0" />}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Td({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("border-b border-line px-3 align-middle", className)} {...props}>
      {children}
    </td>
  );
}

function SkeletonRow() {
  return (
    <tr className="h-14">
      <Td className="w-12 pl-5">
        <Skeleton className="size-[18px]" />
      </Td>
      <Td>
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </Td>
      <Td>
        <Skeleton className="h-3.5 w-36" />
      </Td>
      <Td>
        <Skeleton className="h-5 w-28 rounded-full" />
      </Td>
      <Td>
        <Skeleton className="h-5 w-24 rounded-full" />
      </Td>
      <Td>
        <Skeleton className="h-3.5 w-16" />
      </Td>
      <Td className="pr-5">
        <Skeleton className="h-3.5 w-20" />
      </Td>
    </tr>
  );
}

