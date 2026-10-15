"use client";
import * as React from "react";
import { ArrowUUpLeft, LinkSimple, Trash } from "@phosphor-icons/react";
import { Card, CardHeader, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/menu";
import { CopyButton } from "@/components/settings/copy-button";
import { dateOnly } from "@/lib/shared/utils";

export interface SavedLink {
  id: string;
  name: string;
  url: string;
  phone: string;
  message: string;
  keyword: string;
  created: string;
}

const KEY = "wadesk:saved-links";

const isLink = (x: unknown): x is SavedLink =>
  !!x && typeof x === "object" && typeof (x as SavedLink).id === "string" && typeof (x as SavedLink).name === "string" && typeof (x as SavedLink).url === "string";

/** Saved links live in this browser only. Reads happen in an effect so server and client markup match. */
export function useSavedLinks() {
  const [links, setLinks] = React.useState<SavedLink[] | null>(null);

  React.useEffect(() => {
    let next: SavedLink[] = [];
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) next = parsed.filter(isLink);
    } catch {
      /* storage blocked or corrupt: start empty */
    }
    setLinks(next);
  }, []);

  const persist = React.useCallback((next: SavedLink[]) => {
    setLinks(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: the list still works for this visit */
    }
  }, []);

  const add = React.useCallback(
    (l: Omit<SavedLink, "id" | "created">) => persist([{ ...l, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, created: new Date().toISOString() }, ...(links ?? [])]),
    [links, persist],
  );
  const remove = React.useCallback((id: string) => persist((links ?? []).filter((l) => l.id !== id)), [links, persist]);

  return { links, add, remove };
}

export function SavedLinks({ links, onLoad, onDelete, className }: { links: SavedLink[] | null; onLoad: (l: SavedLink) => void; onDelete: (l: SavedLink) => void; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title="Saved links" description="Kept in this browser, so they're here next time you open the page." />
      {links === null ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : links.length === 0 ? (
        <p className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-5 text-sm text-ink-3 hairline">
          <LinkSimple size={18} className="shrink-0" />
          Nothing saved yet. Name a link on the right and save it to reuse it later.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="truncate font-mono text-xs text-ink-3" title={l.url}>
                  {l.url.replace("https://", "")}
                </p>
                <p className="mt-0.5 text-xs text-ink-4">
                  Saved {dateOnly(l.created)}
                  {l.keyword && <> · tracks [{l.keyword.toUpperCase()}]</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Tooltip content="Edit this link">
                  <Button variant="ghost" size="icon-sm" aria-label={`Load ${l.name} into the form`} onClick={() => onLoad(l)}>
                    <ArrowUUpLeft size={16} />
                  </Button>
                </Tooltip>
                <CopyButton text={l.url} iconOnly variant="ghost" label={`Copy link for ${l.name}`} toastMessage="Link copied" />
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${l.name}`} onClick={() => onDelete(l)}>
                  <Trash size={16} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
