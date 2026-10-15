"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, ArrowUpRight, MagnifyingGlass, Notepad, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { post, refresh, toastError } from "@/lib/client/api";
import { useTemplates } from "@/lib/client/hooks";
import type { TemplateStatus } from "@/lib/shared/types";
import { TemplateCard, TemplateCardSkeleton } from "./template-card";

type StatusFilter = "all" | "APPROVED" | "PENDING" | "DRAFT" | "REJECTED";

export function TemplateList() {
  const router = useRouter();
  const { data, isLoading, error } = useTemplates();
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [category, setCategory] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => {
    router.prefetch("/templates/new");
  }, [router]);

  // tell the person when a review decision lands while they are looking at the list
  const seen = React.useRef<Map<string, TemplateStatus> | null>(null);
  React.useEffect(() => {
    if (!data) return;
    const prev = seen.current;
    if (prev) {
      for (const t of data) {
        if (prev.get(t.id) === "PENDING" && t.status === "APPROVED") toast.success("Template approved", { description: `${t.name} is ready to use in campaigns.` });
        if (prev.get(t.id) === "PENDING" && t.status === "REJECTED") toast.error("Template rejected", { description: `${t.name}: ${t.rejection_reason ?? "see the template for details"}` });
      }
    }
    seen.current = new Map(data.map((t) => [t.id, t.status]));
  }, [data]);

  const counts = React.useMemo(() => {
    const c = { all: 0, APPROVED: 0, PENDING: 0, DRAFT: 0, REJECTED: 0 };
    for (const t of data ?? []) {
      c.all++;
      if (t.status in c) c[t.status as keyof typeof c]++;
    }
    return c;
  }, [data]);

  const rows = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (t) =>
        (status === "all" || t.status === status) &&
        (category === "all" || t.category === category) &&
        (!term || t.name.toLowerCase().includes(term) || t.content.body.toLowerCase().includes(term)),
    );
  }, [data, status, category, q]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await post<{ imported: number; updated: number; mode: "mock" | "live" }>("/api/templates/sync");
      if (r.mode === "mock") {
        toast.info("Syncing needs a live WhatsApp connection", { description: "You're in demo mode, so there is nothing to pull from Meta. Connect your WhatsApp Business account in Settings to sync." });
      } else {
        toast.success("Templates synced", { description: `${r.imported} new, ${r.updated} updated.` });
        refresh("/api/templates");
      }
    } catch (e) {
      toastError(e);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = status !== "all" || category !== "all" || q.trim() !== "";
  const clear = () => {
    setStatus("all");
    setCategory("all");
    setQ("");
  };

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Message formats that WhatsApp has reviewed. Create one once, then reuse it in any campaign."
        actions={
          <>
            <Button variant="secondary" leading={<ArrowsClockwise size={16} className={syncing ? "animate-spin" : ""} />} onClick={sync} disabled={syncing}>
              Sync from Meta
            </Button>
            <Button trailing={<ArrowUpRight size={14} />} onClick={() => router.push("/templates/new")}>
              New template
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented<StatusFilter>
          aria-label="Filter by status"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "APPROVED", label: "Approved", count: counts.APPROVED },
            { value: "PENDING", label: "In review", count: counts.PENDING },
            { value: "DRAFT", label: "Draft", count: counts.DRAFT },
            { value: "REJECTED", label: "Rejected", count: counts.REJECTED },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            aria-label="Filter by category"
            value={category}
            onValueChange={setCategory}
            className="sm:w-44"
            options={[
              { value: "all", label: "All categories" },
              { value: "MARKETING", label: "Marketing" },
              { value: "UTILITY", label: "Utility" },
              { value: "AUTHENTICATION", label: "Authentication" },
            ]}
          />
          <Input
            aria-label="Search templates"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or text"
            leading={<MagnifyingGlass size={16} />}
            trailing={
              q ? (
                <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="grid size-6 place-items-center rounded-full hover:bg-ink/[0.07]">
                  <X size={13} />
                </button>
              ) : undefined
            }
            className="sm:w-64"
          />
        </div>
      </div>

      {error && !data ? (
        <EmptyState icon={<Notepad />} title="Couldn't load templates" description="Check your connection and try again." action={<Button variant="secondary" onClick={() => refresh("/api/templates")}>Retry</Button>} />
      ) : isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <TemplateCardSkeleton key={i} />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={<Notepad />}
          title="No templates yet"
          description="WhatsApp only lets you start conversations with approved templates. Build your first one, or start from an example."
          action={
            <Button trailing={<ArrowUpRight size={14} />} onClick={() => router.push("/templates/new")}>
              New template
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass />}
          title="No templates match"
          description={filtered ? "Try a different status, category or search term." : undefined}
          action={
            <Button variant="secondary" onClick={clear}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          {rows.map((t, i) => (
            <TemplateCard key={t.id} t={t} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
