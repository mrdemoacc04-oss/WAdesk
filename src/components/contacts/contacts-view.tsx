"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DownloadSimple, Plus, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";
import { useConfirm } from "@/components/confirm";
import { post, qs, refresh, toastError, api } from "@/lib/client/api";
import { useApi, useContacts, useTags } from "@/lib/client/hooks";
import type { DashboardData } from "@/lib/shared/analytics";
import type { Contact, OptIn, Page } from "@/lib/shared/types";
import { fmtNum, pluralize } from "@/lib/shared/utils";
import { AddContactModal } from "./add-contact-modal";
import { BulkBar } from "./bulk-bar";
import { ContactSheet } from "./contact-sheet";
import { ContactsTable } from "./contacts-table";
import { SegmentsManager } from "./segments-manager";
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  exportHref,
  hasActiveFilters,
  toBulkFilter,
  toQuery,
  useDebounced,
  type ContactFilters,
} from "./shared";
import { StatTiles } from "./stat-tiles";
import { Toolbar, type SortKey } from "./toolbar";

const OPT_VALUES = ["opted_in", "opted_out", "pending"];

function filtersFromParams(p: URLSearchParams): { filters: ContactFilters; q: string } {
  const tags = (p.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const opt = p.get("opt_in") ?? "";
  return {
    q: p.get("q") ?? "",
    filters: {
      ...EMPTY_FILTERS,
      tags,
      tag_mode: p.get("tag_mode") === "all" ? "all" : "any",
      opt_in: OPT_VALUES.includes(opt) ? (opt as OptIn) : "all",
      segment_id: p.get("segment") ?? p.get("segment_id") ?? "",
      source: p.get("source") ?? "",
    },
  };
}

export function ContactsView() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const confirm = useConfirm();
  const { data: tagList } = useTags();
  const { data: dash } = useApi<DashboardData>("/api/dashboard?range=14");

  /* ───── filters ───── */
  const initial = React.useMemo(() => filtersFromParams(params), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [filters, setFilters] = React.useState<ContactFilters>(initial.filters);
  const [search, setSearch] = React.useState(initial.q);
  const q = useDebounced(search, 250);
  const [sort, setSort] = React.useState<SortKey>("created_at");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");
  const [offset, setOffset] = React.useState(0);

  /* ───── selection ───── */
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const clearSelection = React.useCallback(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, []);

  // follow links like /contacts?tags=import-2026-10-15 while the page is already open
  const filterSig = ["tags", "tag_mode", "opt_in", "segment", "segment_id", "source", "q"].map((k) => params.get(k) ?? "").join("|");
  const firstSig = React.useRef(filterSig);
  React.useEffect(() => {
    if (firstSig.current === filterSig) return;
    firstSig.current = filterSig;
    const next = filtersFromParams(params);
    setFilters(next.filters);
    setSearch(next.q);
    setOffset(0);
    clearSelection();
  }, [filterSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilters = (patch: Partial<ContactFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
    clearSelection();
  };
  const onSearch = (v: string) => {
    setSearch(v);
    setOffset(0);
    clearSelection();
  };
  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setSearch("");
    setOffset(0);
    clearSelection();
  };

  /* ───── data ───── */
  const query = { ...toQuery(filters, q), sort, dir, limit: PAGE_SIZE, offset };
  const { data, isLoading, isValidating } = useContacts(query);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  // deleting the last rows of the last page: step back
  React.useEffect(() => {
    if (data && data.rows.length === 0 && data.total > 0 && offset > 0) setOffset(Math.max(0, Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE));
  }, [data, offset]);

  const onSort = (key: SortKey, d?: "asc" | "desc") => {
    if (d) {
      setSort(key);
      setDir(d);
    } else if (sort === key) setDir((x) => (x === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
    setOffset(0);
  };

  /* ───── sheet and modal, kept in step with ?open= and ?add=1 ───── */
  const [openId, setOpenId] = React.useState<string | null>(() => params.get("open"));
  const [addOpen, setAddOpen] = React.useState(() => params.get("add") === "1");
  const openParam = params.get("open");
  const addParam = params.get("add");
  // links from elsewhere (inbox, command palette) can land here with these params
  React.useEffect(() => {
    setOpenId(openParam);
  }, [openParam]);
  React.useEffect(() => {
    setAddOpen(addParam === "1");
  }, [addParam]);

  const setUrlParam = React.useCallback(
    (key: string, value: string | null) => {
      const sp = new URLSearchParams(window.location.search);
      if (value === null) sp.delete(key);
      else sp.set(key, value);
      const s = sp.toString();
      window.history.replaceState(window.history.state, "", s ? `${pathname}?${s}` : pathname);
    },
    [pathname],
  );
  const openContact = (id: string | null) => {
    setOpenId(id);
    setUrlParam("open", id);
  };
  const openAdd = (o: boolean) => {
    setAddOpen(o);
    setUrlParam("add", o ? "1" : null);
  };

  /* ───── selection handlers ───── */
  const pageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const canSelectAll = pageSelected && total > rows.length && !allMatching;
  const selectedCount = allMatching ? total : selected.size;

  const toggle = (id: string) => {
    setAllMatching(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const togglePage = (checked: boolean) => {
    setAllMatching(false);
    setSelected((s) => {
      const n = new Set(s);
      for (const r of rows) {
        if (checked) n.add(r.id);
        else n.delete(r.id);
      }
      return n;
    });
  };

  /* ───── bulk actions ───── */
  const bulkFilter = () => (allMatching ? toBulkFilter(filters, q) : { ids: [...selected] });
  const noun = (n: number) => (n === 1 ? "1 contact" : `${fmtNum(n)} contacts`);

  const runBulk = async (action: Record<string, unknown>, done: (affected: number) => string): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await post<{ affected: number }>("/api/contacts/bulk", { filter: bulkFilter(), action });
      toast.success(done(r.affected));
      await refresh("/api/contacts", "/api/tags", "/api/segments", "/api/dashboard");
      clearSelection();
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const bulkTags = (mode: "add" | "remove", tags: string[]) =>
    runBulk({ type: mode === "add" ? "add_tags" : "remove_tags", tags }, (n) => `${mode === "add" ? "Tagged" : "Untagged"} ${noun(n)}`);

  const bulkOpt = async (type: "opt_in" | "opt_out") => {
    const n = selectedCount;
    const ok =
      type === "opt_in"
        ? await confirm({
            title: `Mark ${noun(n)} as opted in?`,
            description: "Only do this if these people have agreed to receive WhatsApp messages from your business. Anyone who already opted out stays opted out. They can only rejoin by messaging START or from their own contact card.",
            confirmLabel: "Mark as opted in",
            tone: "primary",
          })
        : await confirm({
            title: `Mark ${noun(n)} as opted out?`,
            description: "They stop receiving campaigns. You can switch them back later, but only with their consent.",
            confirmLabel: "Mark as opted out",
            tone: "primary",
          });
    if (ok) await runBulk({ type }, (a) => `${noun(a)} marked as ${type === "opt_in" ? "opted in" : "opted out"}`);
  };

  const bulkDelete = async () => {
    const n = selectedCount;
    const everyone = allMatching && !hasActiveFilters(filters, q);
    const ok = await confirm({
      title: everyone ? `Delete all ${fmtNum(n)} contacts?` : `Delete ${noun(n)}?`,
      description: "They are removed together with their chat history. Past campaign stats keep their counts. This can't be undone.",
      confirmLabel: everyone ? "Delete everyone" : `Delete ${noun(n)}`,
      tone: "danger",
    });
    if (ok) await runBulk({ type: "delete" }, (a) => `Deleted ${noun(a)}`);
  };

  const [segmentsOpen, setSegmentsOpen] = React.useState(false);

  const bulkCampaign = async () => {
    const explain = () =>
      confirm({
        title: "Too many to pick one by one",
        description: "A campaign can take up to 100 hand-picked contacts. For a bigger audience, filter by tag or save a segment, then select all matching.",
        confirmLabel: "Manage segments",
        tone: "primary",
      }).then((go) => go && setSegmentsOpen(true));

    // a saved segment or a tag filter can be sent as-is
    if (allMatching) {
      const plainOpt = filters.opt_in === "all" || filters.opt_in === "opted_in";
      const noExtras = !q.trim() && !filters.source && plainOpt;
      if (filters.segment_id && !filters.tags.length && noExtras) return void router.push(`/campaigns/new?segment=${filters.segment_id}`);
      if (filters.tags.length && !filters.segment_id && noExtras) {
        return void router.push(`/campaigns/new${qs({ tags: filters.tags, tag_match: filters.tag_mode === "all" ? "all" : undefined })}`);
      }
      if (total > 100) return void explain();
      setBusy(true);
      try {
        const all = await api<Page<Contact>>(`/api/contacts${qs({ ...toQuery(filters, q), sort, dir, limit: 100 })}`);
        router.push(`/campaigns/new?contacts=${all.rows.map((r) => r.id).join(",")}`);
      } catch (e) {
        toastError(e);
        setBusy(false);
      }
      return;
    }
    if (selected.size > 100) return void explain();
    router.push(`/campaigns/new?contacts=${[...selected].join(",")}`);
  };

  const filtered = hasActiveFilters(filters, q);
  const audience = dash?.audience;

  return (
    <div>
      <PageHeader
        title="Contacts"
        description={
          audience
            ? audience.opted_in > 0
              ? `${pluralize(audience.opted_in, "person", "people")} can be messaged on WhatsApp right now.`
              : "Add or import people to start messaging them on WhatsApp."
            : "Everyone you can reach on WhatsApp, and whether they've agreed to hear from you."
        }
        actions={
          <>
            <a href={exportHref(filters, q)} download aria-label="Export contacts as CSV" className={buttonVariants({ variant: "secondary", className: "max-sm:size-10 max-sm:px-0" })}>
              <DownloadSimple size={16} /> <span className="max-sm:hidden">Export</span>
            </a>
            <Link href="/contacts/import" className={buttonVariants({ variant: "secondary" })}>
              <UploadSimple size={16} /> Import
            </Link>
            <Button trailing={<Plus size={14} />} onClick={() => openAdd(true)}>
              Add contact
            </Button>
          </>
        }
      />

      <StatTiles audience={audience} active={filters.opt_in} onPick={(f) => updateFilters({ opt_in: f })} />

      <Toolbar
        search={search}
        onSearch={onSearch}
        filters={filters}
        onFilters={updateFilters}
        counts={audience}
        sort={sort}
        dir={dir}
        onSort={(s, d) => onSort(s, d)}
        onManageSegments={() => setSegmentsOpen(true)}
        onClear={clearAll}
        dirty={filtered}
      />

      <ContactsTable
        rows={rows}
        total={total}
        offset={offset}
        loading={isLoading && !data}
        validating={isValidating}
        sort={sort}
        dir={dir}
        onSort={(k) => onSort(k)}
        selected={selected}
        onToggle={toggle}
        onTogglePage={togglePage}
        onOpen={(id) => openContact(id)}
        onPage={(o) => {
          setOffset(o);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        filtered={filtered}
        onAdd={() => openAdd(true)}
        onClear={clearAll}
      />

      <BulkBar
        count={selectedCount}
        total={total}
        pageSize={rows.length}
        allMatching={allMatching}
        canSelectAll={canSelectAll}
        busy={busy}
        tagSuggestions={(tagList ?? []).map((t) => t.name)}
        onSelectAll={() => setAllMatching(true)}
        onClear={clearSelection}
        onTags={bulkTags}
        onOptIn={() => bulkOpt("opt_in")}
        onOptOut={() => bulkOpt("opt_out")}
        onCampaign={bulkCampaign}
        onDelete={bulkDelete}
      />

      <ContactSheet id={openId} onClose={() => openContact(null)} />
      <AddContactModal open={addOpen} onOpenChange={openAdd} />
      <SegmentsManager
        open={segmentsOpen}
        onOpenChange={setSegmentsOpen}
        onApply={(id) => updateFilters({ segment_id: id })}
        onDeleted={(id) => filters.segment_id === id && updateFilters({ segment_id: "" })}
      />
    </div>
  );
}
