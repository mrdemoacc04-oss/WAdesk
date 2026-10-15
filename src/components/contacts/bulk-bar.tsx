"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { CaretUp, Megaphone, Tag, Trash, UserCheck, UserMinus, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Menu, MenuContent, MenuItem, Popover, PopoverContent, PopoverTrigger, MenuTrigger } from "@/components/ui/menu";
import { TagChip, TagInput } from "@/components/ui/tag-input";
import { fmtNum } from "@/lib/shared/utils";

export function BulkBar({
  count,
  total,
  pageSize,
  allMatching,
  canSelectAll,
  busy,
  tagSuggestions,
  onSelectAll,
  onClear,
  onTags,
  onOptIn,
  onOptOut,
  onCampaign,
  onDelete,
}: {
  count: number;
  total: number;
  pageSize: number;
  allMatching: boolean;
  canSelectAll: boolean;
  busy: boolean;
  tagSuggestions: string[];
  onSelectAll: () => void;
  onClear: () => void;
  onTags: (mode: "add" | "remove", tags: string[]) => Promise<boolean>;
  onOptIn: () => void;
  onOptOut: () => void;
  onCampaign: () => void;
  onDelete: () => void;
}) {
  const [tagOpen, setTagOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"add" | "remove">("add");
  const [tags, setTags] = React.useState<string[]>([]);

  const apply = async () => {
    if (!tags.length) return;
    const ok = await onTags(mode, tags);
    if (ok) {
      setTags([]);
      setTagOpen(false);
    }
  };

  const showBanner = allMatching || canSelectAll;

  // The page wrapper animates with a filter, which would make `fixed` relative to the page instead of the screen.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            key="bulk"
            role="region"
            aria-label="Bulk actions"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
            className="pointer-events-none fixed inset-x-0 bottom-[88px] z-30 flex justify-center px-3 md:bottom-6 md:pl-[268px]"
          >
            <div className="pointer-events-auto flex max-w-full flex-col overflow-hidden rounded-[26px] bg-surface/95 shadow-pop backdrop-blur-xl hairline">
              {showBanner && (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-b border-line bg-surface-2/70 px-4 py-2 text-[13px] text-ink-2" aria-live="polite">
                  {allMatching ? (
                    <>
                      <span>All {fmtNum(total)} matching contacts are selected.</span>
                      <button type="button" onClick={onClear} className="font-medium text-ink underline underline-offset-2">
                        Clear selection
                      </button>
                    </>
                  ) : (
                    <>
                      <span>All {fmtNum(pageSize)} on this page are selected.</span>
                      <button type="button" onClick={onSelectAll} className="font-medium text-accent-ink underline underline-offset-2">
                        Select all {fmtNum(total)} matching
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1 p-1.5 pl-2">
                <button
                  type="button"
                  onClick={onClear}
                  aria-label="Clear selection"
                  className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.07] hover:text-ink"
                >
                  <X size={15} />
                </button>
                <span className="tabular mr-1.5 whitespace-nowrap text-sm font-medium" aria-live="polite">
                  {fmtNum(allMatching ? total : count)} selected
                </span>

                <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" />

                <Popover open={tagOpen} onOpenChange={setTagOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={busy} aria-label="Add or remove tags" leading={<Tag size={16} />}>
                      <span className="hidden sm:inline">Tags</span>
                      <CaretUp size={11} className="hidden sm:block" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="center" className="w-[300px]">
                    <div className="grid gap-3">
                      <Segmented<"add" | "remove">
                        size="sm"
                        value={mode}
                        onValueChange={setMode}
                        className="w-full [&>button]:flex-1 [&>button]:justify-center"
                        options={[
                          { value: "add", label: "Add tags" },
                          { value: "remove", label: "Remove tags" },
                        ]}
                      />
                      <TagInput value={tags} onChange={setTags} placeholder={mode === "add" ? "Tag to add…" : "Tag to remove…"} aria-label="Tags to apply" />
                      {tagSuggestions.filter((t) => !tags.includes(t)).length > 0 && (
                        <div className="flex flex-wrap gap-1.5" aria-label="Existing tags">
                          {tagSuggestions
                            .filter((t) => !tags.includes(t))
                            .slice(0, 8)
                            .map((t) => (
                              <button key={t} type="button" onClick={() => setTags((v) => [...v, t])} className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent/60">
                                <TagChip tag={t} />
                              </button>
                            ))}
                        </div>
                      )}
                      <Button size="sm" onClick={apply} disabled={!tags.length} loading={busy} className="w-full">
                        {mode === "add" ? "Add to" : "Remove from"} {fmtNum(allMatching ? total : count)} {(allMatching ? total : count) === 1 ? "contact" : "contacts"}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={busy} aria-label="Change opt-in status" leading={<UserCheck size={16} />}>
                      <span className="hidden sm:inline">Opt-in</span>
                      <CaretUp size={11} className="hidden sm:block" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent side="top" align="center">
                    <MenuItem icon={<UserCheck size={16} />} onSelect={onOptIn}>
                      Mark as opted in
                    </MenuItem>
                    <MenuItem icon={<UserMinus size={16} />} onSelect={onOptOut}>
                      Mark as opted out
                    </MenuItem>
                  </MenuContent>
                </Menu>

                <Button variant="ghost" size="sm" disabled={busy} onClick={onCampaign} aria-label="Create a campaign" leading={<Megaphone size={16} />}>
                  <span className="hidden sm:inline">Create campaign</span>
                </Button>

                <Button variant="danger-soft" size="sm" disabled={busy} onClick={onDelete} aria-label="Delete selected contacts" leading={<Trash size={16} />}>
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  );
}
