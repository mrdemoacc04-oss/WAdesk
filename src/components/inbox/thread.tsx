"use client";
import * as React from "react";
import { mutate as globalMutate } from "swr";
import { toast } from "sonner";
import { ChatCircleDots, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { api, post, qs, refresh, toastError } from "@/lib/client/api";
import { useConfig, useConversation, useMessages } from "@/lib/client/hooks";
import type { Message, Template } from "@/lib/shared/types";
import { Composer, type ComposerHandle } from "./composer";
import { useConversationActions } from "./conversation-controls";
import { buildDisplay, loadRetried, makeOptimistic, retryBody, saveRetried, useNow, usePageVisible, windowInfo, type SendBody } from "./lib";
import { MessageList } from "./message-list";
import { SimulateModal } from "./simulate-modal";
import { ThreadHeader } from "./thread-header";

export function Thread({
  id,
  templates,
  approved,
  onBack,
  panelOpen,
  onTogglePanel,
  onViewContact,
  autoFocus,
  composerRef,
}: {
  id: string;
  templates: Map<string, Template>;
  approved: Template[] | undefined;
  onBack: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onViewContact: () => void;
  autoFocus: boolean;
  composerRef: React.Ref<ComposerHandle>;
}) {
  const { data: cfg } = useConfig();
  const { data: bundle, error: bundleErr, mutate: mutateBundle } = useConversation(id);
  const { data: msgData, error: msgErr, mutate: mutateMsgs } = useMessages(id);
  const actions = useConversationActions(id);
  const visible = usePageVisible();
  const now = useNow(30_000);

  const msgsKey = `/api/conversations/${id}/messages?limit=80`;

  const [pending, setPending] = React.useState<Message[]>([]);
  const [older, setOlder] = React.useState<Message[]>([]);
  const [olderHasMore, setOlderHasMore] = React.useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [retried, setRetried] = React.useState<Set<string>>(() => new Set());
  const [simulate, setSimulate] = React.useState(false);

  React.useEffect(() => setRetried(loadRetried()), []);

  const w = windowInfo(bundle?.window_expires_at, now);
  const windowOpen = bundle ? w.open : undefined;
  const demo = cfg?.mode === "local" && cfg?.providerMode === "mock";

  /* ───────── sending ───────── */

  const send = React.useCallback(
    async (body: SendBody): Promise<boolean> => {
      if (!cfg || !bundle) return false;
      const tmp = makeOptimistic({ conversationId: id, contactId: bundle.contact.id, body, author: { id: cfg.user.id, name: cfg.user.name }, templates });
      setPending((p) => [...p, tmp]);
      try {
        const real = await post<Message>(`/api/conversations/${id}/messages`, body);
        await globalMutate(
          msgsKey,
          (cur?: { messages: Message[]; has_more: boolean }) => (cur ? { ...cur, messages: cur.messages.some((m) => m.id === real.id) ? cur.messages : [...cur.messages, real] } : cur),
          { revalidate: false },
        );
        if (body.type !== "note") void refresh("/api/conversations?");
        void mutateBundle();
        return true;
      } catch (e) {
        setPending((p) => p.filter((x) => x.id !== tmp.id));
        toastError(e);
        void mutateMsgs(); // a failed send is stored server-side, with a Retry
        void mutateBundle();
        return false;
      }
    },
    [cfg, bundle, id, templates, msgsKey, mutateBundle, mutateMsgs],
  );

  const onRetry = React.useCallback(
    async (m: Message) => {
      const body = retryBody(m);
      if (!body) {
        toast.error("This message can't be resent. Send it again from the composer.");
        return;
      }
      const ok = await send(body);
      if (ok) {
        setRetried((prev) => {
          const next = new Set(prev).add(m.id);
          saveRetried(next);
          return next;
        });
      }
    },
    [send],
  );

  /* ───────── messages ───────── */

  const serverMsgs = React.useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of older) map.set(m.id, m);
    for (const m of msgData?.messages ?? []) map.set(m.id, m);
    return [...map.values()];
  }, [older, msgData]);

  const items = React.useMemo(() => buildDisplay(serverMsgs, pending, retried), [serverMsgs, pending, retried]);
  const hasMore = olderHasMore ?? msgData?.has_more ?? false;

  const loadMore = async () => {
    const oldest = serverMsgs[0];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<{ messages: Message[]; has_more: boolean }>(`/api/conversations/${id}/messages${qs({ before: oldest.created_at, limit: 60 })}`);
      setOlder((prev) => [...res.messages, ...prev]);
      setOlderHasMore(res.has_more);
    } catch (e) {
      toastError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  /* ───────── read receipts ───────── */

  const latestInboundId = React.useMemo(() => {
    for (let i = serverMsgs.length - 1; i >= 0; i--) if (serverMsgs[i].direction === "in") return serverMsgs[i].id;
    return null;
  }, [serverMsgs]);

  const markedFor = React.useRef<string | null>(null);
  const unread = bundle?.conversation.unread_count ?? 0;
  React.useEffect(() => {
    if (!bundle || !msgData || !visible) return;
    const arrived = markedFor.current !== null && markedFor.current !== latestInboundId;
    markedFor.current = latestInboundId ?? "";
    if (unread === 0 && !arrived) return;
    void post(`/api/conversations/${id}/read`)
      .then(() => Promise.all([refresh("/api/conversations?", "/api/config"), mutateBundle()]))
      .catch(() => {});
    if (arrived) void mutateBundle(); // a fresh inbound message reopens the 24-hour window
  }, [id, bundle, msgData, visible, latestInboundId, unread, mutateBundle]);

  /* ───────── render ───────── */

  const contactName = bundle?.contact.name?.trim() || "the customer";
  const failed = (msgErr && !msgData) || (bundleErr && !bundle);
  const empty = !!msgData && items.length === 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <ThreadHeader
        bundle={bundle}
        members={cfg?.members}
        meId={cfg?.user.id}
        now={now}
        onBack={onBack}
        panelOpen={panelOpen}
        onTogglePanel={onTogglePanel}
        onViewContact={onViewContact}
        onAssign={(uid) => void actions.assign(uid)}
        onResolve={() => void actions.resolve()}
        onReopen={() => void actions.reopen()}
        demo={demo}
        onSimulate={() => setSimulate(true)}
      />

      {failed ? (
        <div className="wa-wallpaper grid min-h-0 flex-1 place-items-center p-6">
          <div className="max-w-xs rounded-2xl bg-surface p-6 text-center shadow-card hairline">
            <WarningCircle size={28} className="mx-auto text-danger" />
            <h3 className="mt-3 text-[15px] font-medium">Couldn&apos;t load this conversation</h3>
            <p className="mt-1 text-[13px] text-ink-3">It may have been removed, or your connection dropped.</p>
            <Button className="mt-4" size="sm" variant="secondary" onClick={() => { void mutateMsgs(); void mutateBundle(); }}>
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <MessageList items={items} loaded={!!msgData} conversationKey={id} templates={templates} onRetry={onRetry} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={loadMore} />
          {empty && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
              <div className="max-w-[260px] rounded-2xl bg-surface/95 px-5 py-4 text-center shadow-card hairline">
                <ChatCircleDots size={24} className="mx-auto text-ink-3" />
                <p className="mt-2 text-[14px] font-medium">No messages yet</p>
                <p className="mt-0.5 text-[13px] text-ink-3">{windowOpen === false ? `Send an approved template to start talking to ${contactName}.` : `Say hello to ${contactName}.`}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <Composer conversationId={id} contact={bundle?.contact} windowOpen={windowOpen} templates={approved} onSend={send} autoFocus={autoFocus} handleRef={composerRef} />

      <SimulateModal open={simulate} onOpenChange={setSimulate} contactId={bundle?.contact.id} name={contactName} />
    </div>
  );
}
