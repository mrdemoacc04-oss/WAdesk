"use client";
import * as React from "react";
import {
  ArrowUpRight,
  ClockCountdown,
  CursorClick,
  FileText,
  ImageSquare,
  Lightning,
  MusicNote,
  Note,
  Paperclip,
  PaperPlaneRight,
  Prohibit,
  Smiley,
  Stack,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/menu";
import { errorMessage, toastError } from "@/lib/client/api";
import { useQuickReplies } from "@/lib/client/hooks";
import { ACCEPT, prettySize, uploadFile, type Uploaded } from "@/lib/client/upload";
import { EMOJIS } from "@/lib/shared/constants";
import { LIMITS } from "@/lib/shared/template";
import { cn } from "@/lib/shared/utils";
import type { Contact, Template } from "@/lib/shared/types";
import { drafts, type Sender } from "./lib";
import { InteractiveModal } from "./interactive-modal";
import { filterQuickReplies, ManageQuickRepliesModal, QuickReplyPanel } from "./quick-replies";
import { TemplateModal } from "./template-modal";

export interface ComposerHandle {
  focus: () => void;
  /** focus and open the quick replies list */
  slash: () => void;
}

type Kind = "image" | "video" | "audio" | "document";
interface Staged {
  file: File;
  kind: Kind;
  name: string;
  size: number;
  pct: number;
  preview?: string;
  uploaded?: Uploaded;
  error?: string;
}

const SLASH_RE = /(?:^|\s)\/([\w-]*)$/;

function detectSlash(value: string, caret: number): { start: number; query: string } | null {
  const m = SLASH_RE.exec(value.slice(0, caret));
  if (!m) return null;
  const query = m[1];
  return { start: caret - query.length - 1, query };
}

function kindForFile(f: File): Kind {
  if (f.type.startsWith("image/")) return "image";
  if (f.type.startsWith("video/")) return "video";
  if (f.type.startsWith("audio/")) return "audio";
  return "document";
}

const KIND_ICON = { image: ImageSquare, video: VideoCamera, audio: MusicNote, document: FileText } as const;

function IconButton({ label, children, onClick, disabled, active, className }: { label: string; children: React.ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string }) {
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        onClick={onClick}
        // keep the caret in the textarea
        onMouseDown={(e) => e.preventDefault()}
        disabled={disabled}
        className={cn(active && "bg-ink/[0.07] text-ink", className)}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

export function Composer({
  conversationId,
  contact,
  windowOpen,
  templates,
  onSend,
  autoFocus,
  handleRef,
}: {
  conversationId: string;
  contact: Contact | undefined;
  /** undefined while the conversation is still loading */
  windowOpen: boolean | undefined;
  /** approved templates; undefined while loading */
  templates: Template[] | undefined;
  onSend: Sender;
  autoFocus?: boolean;
  handleRef?: React.Ref<ComposerHandle>;
}) {
  const [text, setText] = React.useState(() => drafts.get(conversationId) ?? "");
  const [note, setNote] = React.useState(false);
  const [staged, setStaged] = React.useState<Staged | null>(null);
  const [slash, setSlash] = React.useState<{ start: number; query: string } | null>(null);
  const [browse, setBrowse] = React.useState(false);
  const [dismissedFor, setDismissedFor] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [tplOpen, setTplOpen] = React.useState(false);
  const [intOpen, setIntOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  const ta = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const uploadToken = React.useRef(0);
  const coarse = React.useRef(false);

  const qr = useQuickReplies();
  const optedOut = contact?.opt_in === "opted_out";

  React.useEffect(() => {
    coarse.current = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  }, []);

  /* drafts survive switching conversations */
  React.useEffect(() => {
    if (text) drafts.set(conversationId, text);
    else drafts.delete(conversationId);
  }, [text, conversationId]);

  /* autosize */
  React.useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text, note, windowOpen, staged]);

  React.useEffect(() => {
    if (autoFocus && !coarse.current) ta.current?.focus({ preventScroll: true });
  }, [autoFocus, windowOpen]);

  /* revoke object URLs */
  React.useEffect(() => {
    const url = staged?.preview;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [staged?.preview]);

  React.useImperativeHandle(handleRef, () => ({
    focus: () => ta.current?.focus(),
    slash: () => {
      const el = ta.current;
      if (!el) return;
      el.focus();
      if (!el.value) {
        setText("/");
        setSlash({ start: 0, query: "" });
        requestAnimationFrame(() => el.setSelectionRange(1, 1));
      } else {
        setBrowse(true);
      }
    },
  }));

  const items = React.useMemo(() => filterQuickReplies(qr.data, slash?.query ?? ""), [qr.data, slash?.query]);
  const panelOpen = (!!slash && text !== dismissedFor) || browse;
  React.useEffect(() => setActive(0), [slash?.query, browse]);

  const refocus = () => requestAnimationFrame(() => ta.current?.focus());

  const closePanel = () => {
    setBrowse(false);
    if (slash) setDismissedFor(text);
  };

  const syncSlash = (value: string, caret: number) => {
    setSlash(detectSlash(value, caret));
  };

  const insertAtCaret = (insert: string, replace?: { start: number; end: number }) => {
    const el = ta.current;
    const start = replace?.start ?? el?.selectionStart ?? text.length;
    const end = replace?.end ?? el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + insert + text.slice(end)).slice(0, LIMITS.textMessage);
    const caret = Math.min(start + insert.length, next.length);
    setText(next);
    setSlash(null);
    requestAnimationFrame(() => {
      const t = ta.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(caret, caret);
    });
  };

  const pickReply = (r: { body: string }) => {
    if (slash) insertAtCaret(r.body, { start: slash.start, end: slash.start + 1 + slash.query.length });
    else insertAtCaret(r.body);
    setBrowse(false);
  };

  /* ───────── attachments ───────── */

  const stage = async (file: File, forced?: Kind) => {
    const kind = forced ?? kindForFile(file);
    const token = ++uploadToken.current;
    const preview = kind === "image" ? URL.createObjectURL(file) : undefined;
    setStaged({ file, kind, name: file.name, size: file.size, pct: 0, preview });
    setNote(false);
    try {
      const up = await uploadFile(file, (pct) => {
        if (token === uploadToken.current) setStaged((s) => (s && s.file === file ? { ...s, pct } : s));
      });
      if (token !== uploadToken.current) return;
      setStaged((s) => (s && s.file === file ? { ...s, uploaded: up, pct: 100 } : s));
      ta.current?.focus();
    } catch (e) {
      if (token !== uploadToken.current) return;
      setStaged((s) => (s && s.file === file ? { ...s, error: errorMessage(e) } : s));
      toastError(e);
    }
  };

  const clearStaged = () => {
    uploadToken.current++;
    setStaged(null);
  };

  const pickFile = (kind: Kind) => {
    const input = fileRef.current;
    if (!input) return;
    input.accept = ACCEPT[kind.toUpperCase() as "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO"];
    input.dataset.kind = kind;
    input.value = "";
    input.click();
  };

  /* ───────── submit ───────── */

  const submit = async () => {
    const body = text.trim();
    if (note) {
      if (!body) return;
      setText("");
      setNote(false);
      const ok = await onSend({ type: "note", body });
      if (!ok) {
        setText((t) => t || body);
        setNote(true);
      }
      return;
    }
    if (windowOpen === false) return;
    if (staged) {
      const up = staged.uploaded;
      if (!up) return;
      const snapshot = staged;
      const caption = staged.kind === "audio" ? undefined : body || undefined;
      setStaged(null);
      if (caption) setText("");
      const ok = await onSend({ type: "media", kind: up.kind ?? staged.kind, url: up.url, mime: up.mime, caption, filename: up.filename });
      if (!ok) {
        setStaged((s) => s ?? snapshot);
        if (caption) setText((t) => t || caption);
      }
      return;
    }
    if (!body) return;
    setText("");
    setSlash(null);
    const ok = await onSend({ type: "text", body });
    if (!ok) setText((t) => t || body);
  };

  const canSend = note ? !!text.trim() : staged ? !!staged.uploaded : !!text.trim();

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (panelOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(Math.max(items.length - 1, 0), a + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        if (items[active]) {
          e.preventDefault();
          pickReply(items[active]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePanel();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !coarse.current) {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === "Escape") ta.current?.blur();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (note || windowOpen === false) return;
    const f = [...e.clipboardData.files][0];
    if (f) {
      e.preventDefault();
      void stage(f);
    }
  };

  /* ───────── render ───────── */

  const body = (
    <>
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void stage(f, (e.target.dataset.kind as Kind | undefined) ?? undefined);
          e.target.value = "";
        }}
      />
      <InteractiveModal open={intOpen} onOpenChange={setIntOpen} onSend={onSend} />
      <TemplateModal open={tplOpen} onOpenChange={setTplOpen} templates={templates} contact={contact} onSend={onSend} windowClosed={windowOpen === false} />
      <ManageQuickRepliesModal open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );

  if (windowOpen === undefined || !contact) {
    return (
      <div className="border-t border-line bg-surface px-3 pb-3 pt-3 md:px-4">
        <Skeleton className="h-[92px] rounded-2xl" />
      </div>
    );
  }

  /* window closed: free text is off, templates are the way back in */
  if (windowOpen === false && !note) {
    return (
      <div className="border-t border-line bg-surface px-3 pb-3 pt-3 md:px-4">
        {body}
        <div className="flex flex-col gap-3 rounded-2xl bg-warn-soft px-4 py-3.5 @[640px]:flex-row @[640px]:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 text-warn">{optedOut ? <Prohibit size={20} /> : <ClockCountdown size={20} />}</span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-ink">The 24-hour reply window closed.</p>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
                {optedOut ? "This contact opted out, so templates are off too. You can still leave an internal note." : "Send an approved template to start the conversation again."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button variant="ghost" size="sm" leading={<Note size={15} />} onClick={() => { setNote(true); refocus(); }}>
              Add a note
            </Button>
            {!optedOut && (
              <Button variant="primary" onClick={() => setTplOpen(true)} trailing={<ArrowUpRight size={14} />}>
                Send a template
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const placeholder = note ? "Write a note for your team…" : staged ? (staged.kind === "audio" ? "Audio is sent without a caption" : "Add a caption (optional)") : "Write a message — / for quick replies";
  const StagedIcon = staged ? KIND_ICON[staged.kind] : null;

  return (
    <div className="relative border-t border-line bg-surface px-3 pb-3 pt-3 md:px-4">
      {body}
      {optedOut && !note && (
        <p className="mb-2 flex items-center gap-2 px-1 text-[12.5px] text-ink-3">
          <Prohibit size={14} className="text-danger" /> Opted out. Templates are off; you can reply while the window is open.
        </p>
      )}

      <div className="relative">
      {panelOpen && (
        <QuickReplyPanel
          items={items}
          loading={qr.isLoading}
          active={active}
          onActive={setActive}
          onPick={pickReply}
          onManage={() => {
            closePanel();
            setManageOpen(true);
          }}
          query={slash?.query ?? ""}
        />
      )}
      <div
        onDragOver={(e) => {
          if (note || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          setDragging(false);
          if (note) return;
          const f = e.dataTransfer.files?.[0];
          if (f) {
            e.preventDefault();
            void stage(f);
          }
        }}
        className={cn(
          "rounded-2xl transition-[box-shadow,background-color] duration-300 ease-fluid",
          note
            ? "bg-warn-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--warn)_32%,transparent)] focus-within:shadow-[inset_0_0_0_1.5px_var(--warn)]"
            : "bg-surface hairline-strong focus-within:shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_4px_color-mix(in_srgb,var(--accent)_12%,transparent)]",
          dragging && "shadow-[inset_0_0_0_2px_var(--accent)]",
        )}
      >
        {note && (
          <p className="flex items-center gap-1.5 px-3.5 pt-2.5 text-[12.5px] font-medium text-warn">
            <Note size={14} /> Internal note · only your team sees this
          </p>
        )}

        {staged && !note && StagedIcon && (
          <div className="mx-2.5 mt-2.5 flex items-center gap-3 rounded-xl bg-surface-2 p-2 hairline">
            {staged.preview ? (
              <img src={staged.preview} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-ink/[0.06] text-ink-2">
                <StagedIcon size={22} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{staged.name}</p>
              {staged.error ? (
                <p className="text-xs text-danger">{staged.error}</p>
              ) : staged.uploaded ? (
                <p className="text-xs text-ink-3">{prettySize(staged.size)} · Ready to send</p>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.1]" role="progressbar" aria-valuenow={staged.pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-fluid" style={{ width: `${staged.pct}%` }} />
                  </div>
                  <span className="tabular text-xs text-ink-3">{staged.pct}%</span>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Remove attachment" onClick={clearStaged}>
              <X size={15} />
            </Button>
          </div>
        )}

        <textarea
          ref={ta}
          value={text}
          rows={1}
          maxLength={LIMITS.textMessage}
          aria-label={note ? "Internal note" : "Message"}
          placeholder={placeholder}
          enterKeyHint="send"
          onChange={(e) => {
            setText(e.target.value);
            syncSlash(e.target.value, e.target.selectionStart);
          }}
          onKeyUp={(e) => {
            if (["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key)) return;
            syncSlash(e.currentTarget.value, e.currentTarget.selectionStart);
          }}
          onClick={(e) => syncSlash(e.currentTarget.value, e.currentTarget.selectionStart)}
          onBlur={() => setBrowse(false)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="block max-h-[168px] min-h-11 w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[16px] leading-6 text-ink outline-none placeholder:text-ink-4 md:text-[14px]"
        />

        <div className="flex items-center gap-0.5 px-2 pb-2 pt-0.5">
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <Tooltip content="Emoji">
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Emoji" className={cn(emojiOpen && "bg-ink/[0.07]")}>
                  <Smiley size={19} />
                </Button>
              </PopoverTrigger>
            </Tooltip>
            <PopoverContent
              align="start"
              side="top"
              className="w-[288px] p-2"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                refocus();
              }}
            >
              <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto" role="listbox" aria-label="Emoji">
                {EMOJIS.map((em, i) => (
                  <button
                    key={`${em}${i}`}
                    type="button"
                    onClick={() => insertAtCaret(em)}
                    className="grid size-8 place-items-center rounded-lg text-[19px] leading-none transition-colors hover:bg-ink/[0.07]"
                    aria-label={em}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {!note && (
            <Menu>
              <Tooltip content="Attach a file">
                <MenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Attach a file">
                    <Paperclip size={19} />
                  </Button>
                </MenuTrigger>
              </Tooltip>
              <MenuContent align="start" side="top" className="min-w-[180px]">
                <MenuItem icon={<ImageSquare size={18} />} onSelect={() => pickFile("image")}>
                  Photo
                </MenuItem>
                <MenuItem icon={<VideoCamera size={18} />} onSelect={() => pickFile("video")}>
                  Video
                </MenuItem>
                <MenuItem icon={<FileText size={18} />} onSelect={() => pickFile("document")}>
                  Document
                </MenuItem>
                <MenuItem icon={<MusicNote size={18} />} onSelect={() => pickFile("audio")}>
                  Audio
                </MenuItem>
              </MenuContent>
            </Menu>
          )}

          <IconButton label="Quick replies" active={panelOpen} onClick={() => { setBrowse((b) => !b); refocus(); }}>
            <Lightning size={19} />
          </IconButton>

          {!note && (
            <IconButton label="Interactive message" onClick={() => setIntOpen(true)}>
              <CursorClick size={19} />
            </IconButton>
          )}
          {!note && (
            <IconButton label={optedOut ? "Templates are off for opted-out contacts" : "Send a template"} disabled={optedOut} onClick={() => setTplOpen(true)}>
              <Stack size={19} />
            </IconButton>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {text.length > LIMITS.textMessage - 600 && (
              <span className={cn("tabular text-xs", text.length >= LIMITS.textMessage ? "text-danger" : "text-ink-3")}>
                {text.length}/{LIMITS.textMessage}
              </span>
            )}
            <Tooltip content={note ? "Back to replying to the customer" : "Leave a note only your team can see"}>
              <button
                type="button"
                aria-pressed={note}
                onClick={() => {
                  setNote((n) => !n);
                  refocus();
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent/60",
                  note ? "bg-warn text-bg" : "text-ink-3 hover:bg-ink/[0.06] hover:text-ink",
                )}
              >
                <Note size={16} />
                <span className="hidden sm:inline">Note</span>
              </button>
            </Tooltip>
            <Tooltip content={note ? "Add note · Enter" : "Send · Enter"}>
              <Button
                variant={note ? "primary" : "accent"}
                size="icon-sm"
                aria-label={note ? "Add note" : "Send message"}
                disabled={!canSend}
                onClick={() => void submit()}
                className="size-9"
              >
                <PaperPlaneRight size={17} weight="fill" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
