"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ChatCircleDots, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { useConfig, useConversations, useTemplates } from "@/lib/client/hooks";
import type { Template } from "@/lib/shared/types";
import type { ComposerHandle } from "./composer";
import { ContactPanel } from "./contact-panel";
import { ConversationList, type InboxTab } from "./conversation-list";
import { lsGet, lsSet, useDebounced } from "./lib";
import { NewChatModal } from "./new-chat-modal";
import { Thread } from "./thread";

const PANEL_KEY = "wadesk-inbox-panel";
/** inline contact panel needs list (330) + thread (≥490) + panel (310) */
const WIDE = 1130;

export function InboxWorkspace() {
  const params = useSearchParams();
  const convId = params.get("c");

  const { data: cfg } = useConfig();
  const [tab, setTab] = React.useState<InboxTab>("open");
  const [query, setQuery] = React.useState("");
  const dq = useDebounced(query.trim(), 250);
  const [limit, setLimit] = React.useState(40);
  const list = useConversations({ tab, q: dq || undefined, limit });
  const tplRes = useTemplates();

  const templates = React.useMemo(() => new Map<string, Template>((tplRes.data ?? []).map((t) => [t.id, t])), [tplRes.data]);
  const approved = React.useMemo(() => (tplRes.data ? tplRes.data.filter((t) => t.status === "APPROVED") : undefined), [tplRes.data]);

  const [newChat, setNewChat] = React.useState(false);
  const composer = React.useRef<ComposerHandle>(null);

  /* ───────── selection lives in ?c=<id> ───────── */

  const pushed = React.useRef(false);
  const [via, setVia] = React.useState<"pointer" | "key">("pointer");

  const select = React.useCallback(
    (id: string, how: "pointer" | "key" = "pointer") => {
      const url = `/inbox?c=${encodeURIComponent(id)}`;
      setVia(how);
      if (!convId) {
        window.history.pushState(null, "", url);
        pushed.current = true;
      } else {
        window.history.replaceState(null, "", url);
      }
    },
    [convId],
  );

  const back = React.useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", "/inbox");
    }
  }, []);

  /* ───────── contact panel: inline when wide, a drawer otherwise ───────── */

  const rootRef = React.useRef<HTMLDivElement>(null);
  const [rootW, setRootW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setRootW(el.clientWidth);
    const ro = new ResizeObserver(() => setRootW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const wide = rootW >= WIDE;

  const [widePref, setWidePref] = React.useState(true);
  const [drawer, setDrawer] = React.useState(false);
  React.useEffect(() => {
    if (lsGet(PANEL_KEY) === "closed") setWidePref(false);
  }, []);
  React.useEffect(() => setDrawer(false), [convId]);

  const panelOpen = !!convId && (wide ? widePref : drawer);
  const togglePanel = () => {
    if (wide) {
      const next = !widePref;
      setWidePref(next);
      lsSet(PANEL_KEY, next ? "open" : "closed");
    } else setDrawer((d) => !d);
  };
  const viewContact = () => {
    if (wide) {
      setWidePref(true);
      lsSet(PANEL_KEY, "open");
    } else setDrawer(true);
  };

  /* ───────── keyboard: "/" jumps to the composer's quick replies ───────── */

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      const typing = !!t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable);
      if (e.key === "/" && !typing && convId) {
        e.preventDefault();
        composer.current?.slash();
      } else if (e.key === "Escape" && drawer) {
        setDrawer(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [convId, drawer]);

  const rows = list.data?.rows;

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={rootRef}
        className="@container/inbox relative -mx-5 -mb-24 -mt-6 flex h-[calc(100dvh-100px)] min-h-[480px] overflow-hidden rounded-b-[20px] border-t border-line bg-surface md:-mx-9 md:-mb-12"
      >
        <ConversationList
          className={`w-full shrink-0 border-line @[700px]/inbox:w-[300px] @[700px]/inbox:border-r @[1100px]/inbox:w-[330px] ${convId ? "hidden @[700px]/inbox:flex" : "flex"}`}
          rows={rows}
          total={list.data?.total ?? 0}
          loading={list.isLoading}
          error={!!list.error}
          onRetry={() => void list.mutate()}
          selectedId={convId}
          onSelect={select}
          tab={tab}
          onTab={(t) => {
            setTab(t);
            setLimit(40);
          }}
          query={query}
          onQuery={(q) => {
            setQuery(q);
            setLimit(40);
          }}
          onMore={() => setLimit((l) => l + 40)}
          onNewChat={() => setNewChat(true)}
          members={cfg?.members}
          unreadTotal={cfg?.unread ?? 0}
        />

        <div className={`@container min-h-0 min-w-0 flex-1 flex-col ${convId ? "flex" : "hidden @[700px]/inbox:flex"}`}>
          {convId ? (
            <Thread
              key={convId}
              id={convId}
              templates={templates}
              approved={approved}
              onBack={back}
              panelOpen={panelOpen}
              onTogglePanel={togglePanel}
              onViewContact={viewContact}
              autoFocus={via === "pointer"}
              composerRef={composer}
            />
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center bg-surface-2/60">
              <EmptyState
                icon={<ChatCircleDots />}
                title="Select a conversation"
                description="Choose a chat from the list, or start a new one with any contact."
                action={
                  <Button variant="secondary" leading={<Plus size={15} weight="bold" />} onClick={() => setNewChat(true)}>
                    New chat
                  </Button>
                }
              />
            </div>
          )}
        </div>

        {convId && wide && panelOpen && <ContactPanel key={convId} conversationId={convId} className="flex w-[310px] shrink-0 border-l border-line" />}

        <AnimatePresence>
          {convId && !wide && panelOpen && (
            <>
              <motion.button
                key="scrim"
                type="button"
                aria-label="Dismiss"
                tabIndex={-1}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setDrawer(false)}
                className="absolute inset-0 z-10 hidden bg-ink/25 @[700px]/inbox:block"
              />
              <motion.div
                key="drawer"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 38 }}
                className="absolute inset-y-0 right-0 z-20 flex w-full border-l border-line bg-surface shadow-pop @[700px]/inbox:w-[360px]"
              >
                <ContactPanel key={convId} conversationId={convId} overlay onClose={() => setDrawer(false)} className="w-full" />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <NewChatModal open={newChat} onOpenChange={setNewChat} onOpened={(id) => select(id, "pointer")} />
      </div>
    </MotionConfig>
  );
}
