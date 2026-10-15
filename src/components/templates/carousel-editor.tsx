"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CopySimple, ImageSquare, Play, Plus, Stack, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Tooltip } from "@/components/ui/menu";
import { MediaUploader } from "@/components/media-uploader";
import { useConfirm } from "@/components/confirm";
import { LIMITS } from "@/lib/shared/template";
import { cn } from "@/lib/shared/utils";
import { ButtonsEditor } from "./buttons-editor";
import { FieldIssues, useIssues } from "./issues";
import { VariableText } from "./variable-text";
import { blankCard, cloneCard, insertButton, makeButton, moveItem, patchButton, uid, type ButtonType, type ECard } from "./model";

const isVideo = (u?: string) => !!u && /\.(mp4|mov|webm|3gp)(\?|$)/i.test(u);
const CARD_TYPES: ButtonType[] = ["QUICK_REPLY", "URL", "PHONE_NUMBER"];

export function CarouselEditor({
  cards,
  active,
  onActive,
  setCards,
}: {
  cards: ECard[];
  active: number;
  onActive: (i: number) => void;
  setCards: (fn: (cs: ECard[]) => ECard[]) => void;
}) {
  const confirm = useConfirm();
  const { issues, touched, touch, readOnly } = useIssues();
  const i = Math.min(active, cards.length - 1);
  const card = cards[i];
  const fmt = cards[0]?.media_format ?? "IMAGE";
  const atMax = cards.length >= LIMITS.cardsMax;
  const atMin = cards.length <= LIMITS.cardsMin;

  const patchCard = (idx: number, patch: Partial<ECard>) => setCards((cs) => cs.map((c, j) => (j === idx ? { ...c, ...patch } : c)));

  const changeFormat = async (f: "IMAGE" | "VIDEO") => {
    if (f === fmt) return;
    if (cards.some((c) => c.media_url)) {
      const ok = await confirm({
        title: `Switch every card to ${f.toLowerCase()}?`,
        description: `All cards in a carousel use the same media type. The ${fmt.toLowerCase()}s you uploaded will be removed.`,
        confirmLabel: `Switch to ${f.toLowerCase()}`,
        tone: "primary",
      });
      if (!ok) return;
    }
    setCards((cs) => cs.map((c) => ({ ...c, media_format: f, media_url: undefined, handle: undefined })));
    touch("cards");
  };

  const addCard = () => {
    setCards((cs) => [...cs, blankCard(fmt, cs[0]?.buttons)]);
    onActive(cards.length);
  };
  const duplicate = () => {
    setCards((cs) => [...cs.slice(0, i + 1), cloneCard(cs[i]), ...cs.slice(i + 1)]);
    onActive(i + 1);
  };
  const remove = () => {
    setCards((cs) => cs.filter((_, j) => j !== i));
    onActive(Math.max(0, i - 1));
  };
  const move = (dir: -1 | 1) => {
    setCards((cs) => moveItem(cs, i, i + dir));
    onActive(i + dir);
  };

  /* button structure is shared by every card: add / remove / reorder apply to all, text and links stay per card */
  const addButton = (type: ButtonType) => {
    const mine = makeButton(type);
    setCards((cs) => cs.map((c, j) => ({ ...c, buttons: insertButton(c.buttons, j === i ? mine : makeButton(type)) })));
    return mine._k!;
  };
  const removeButton = (b: number) => setCards((cs) => cs.map((c) => ({ ...c, buttons: c.buttons.filter((_, k) => k !== b) })));
  const moveButton = (b: number, dir: -1 | 1) => setCards((cs) => cs.map((c) => ({ ...c, buttons: moveItem(c.buttons, b, b + dir) })));
  const patchOwnButton = (b: number, patch: Record<string, unknown>) =>
    setCards((cs) => cs.map((c, j) => (j === i ? { ...c, buttons: c.buttons.map((x, k) => (k === b ? patchButton(x, patch) : x)) } : c)));

  const applyToAll = async () => {
    const ok = await confirm({
      title: "Copy these buttons to every card?",
      description: "Button types, labels and links on the other cards will be replaced with the ones from this card.",
      confirmLabel: "Copy to all cards",
      tone: "primary",
    });
    if (!ok) return;
    setCards((cs) => cs.map((c, j) => (j === i ? c : { ...c, buttons: cs[i].buttons.map((b) => ({ ...b, _k: uid() })) })));
    toast.success(`Buttons copied to ${cards.length - 1} other ${cards.length === 2 ? "card" : "cards"}`);
  };

  const cardHasError = (idx: number) => issues.some((x) => x.level === "error" && (x.path === `cards.${idx}` || x.path.startsWith(`cards.${idx}.`)) && touched(x.path));

  if (!card) return null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium">Media type</p>
          <p className="text-xs text-ink-3">Every card uses the same type.</p>
        </div>
        <Segmented
          size="sm"
          aria-label="Card media type"
          value={fmt}
          onValueChange={changeFormat}
          options={[
            { value: "IMAGE", label: "Image" },
            { value: "VIDEO", label: "Video" },
          ]}
          className={readOnly ? "pointer-events-none" : ""}
        />
      </div>
      <FieldIssues path="cards" />

      {/* strip */}
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2 pt-1" role="tablist" aria-label="Cards">
        <AnimatePresence initial={false} mode="popLayout">
          {cards.map((c, idx) => {
            const on = idx === i;
            const bad = cardHasError(idx);
            return (
              <motion.button
                key={c._k ?? idx}
                layout
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`Card ${idx + 1}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                onClick={() => onActive(idx)}
                className={cn(
                  "relative size-[68px] shrink-0 overflow-hidden rounded-2xl bg-surface-2 outline-none transition-shadow duration-300 focus-visible:ring-2 focus-visible:ring-accent/60",
                  on ? "shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--accent)]" : "hairline hover:shadow-[inset_0_0_0_1px_var(--line-strong)]",
                )}
              >
                {c.media_url ? (
                  isVideo(c.media_url) ? (
                    <video src={c.media_url} muted playsInline className="size-full object-cover" />
                  ) : (
                    <img src={c.media_url} alt="" className="size-full object-cover" />
                  )
                ) : (
                  <span className="grid size-full place-items-center text-ink-4">
                    <ImageSquare size={22} />
                  </span>
                )}
                {c.media_format === "VIDEO" && c.media_url && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid size-6 place-items-center rounded-full bg-black/45 text-white">
                      <Play size={11} weight="fill" />
                    </span>
                  </span>
                )}
                <span className="absolute bottom-1 left-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-surface/90 px-1 text-[10px] font-medium tabular text-ink shadow-[0_1px_2px_rgba(0,0,0,0.2)]">{idx + 1}</span>
                {bad && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger ring-2 ring-surface" aria-label="Has problems" />}
              </motion.button>
            );
          })}
        </AnimatePresence>
        {!readOnly && (
          <Tooltip content={atMax ? `A carousel can have up to ${LIMITS.cardsMax} cards.` : null}>
            <span tabIndex={atMax ? 0 : -1} className="shrink-0">
              <button
                type="button"
                disabled={atMax}
                onClick={addCard}
                aria-label="Add card"
                className="grid size-[68px] place-items-center rounded-2xl border border-dashed border-line-strong text-ink-3 outline-none transition-colors duration-300 hover:bg-ink/[0.04] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-45"
              >
                <Plus size={20} />
              </button>
            </span>
          </Tooltip>
        )}
      </div>

      {/* active card */}
      <div key={card._k} className="flex animate-fade-in flex-col gap-5 rounded-2xl bg-surface-2 p-4 hairline">
        <div className="flex items-center gap-2">
          <Stack size={16} className="text-ink-3" />
          <p className="text-sm font-medium">
            Card {i + 1} <span className="font-normal text-ink-3">of {cards.length}</span>
          </p>
          <div className="flex-1" />
          {!readOnly && (
            <div className="-mr-1 flex items-center">
              <Button variant="ghost" size="icon-xs" aria-label="Move card earlier" disabled={i === 0} onClick={() => move(-1)}>
                <ArrowLeft size={14} />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Move card later" disabled={i === cards.length - 1} onClick={() => move(1)}>
                <ArrowRight size={14} />
              </Button>
              <Tooltip content={atMax ? `Up to ${LIMITS.cardsMax} cards.` : "Duplicate card"}>
                <span>
                  <Button variant="ghost" size="icon-xs" aria-label="Duplicate card" disabled={atMax} onClick={duplicate}>
                    <CopySimple size={14} />
                  </Button>
                </span>
              </Tooltip>
              <Tooltip content={atMin ? `A carousel needs at least ${LIMITS.cardsMin} cards.` : "Remove card"}>
                <span>
                  <Button variant="ghost" size="icon-xs" aria-label="Remove card" disabled={atMin} className="hover:bg-danger-soft hover:text-danger" onClick={remove}>
                    <Trash size={14} />
                  </Button>
                </span>
              </Tooltip>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-ink-2">{fmt === "IMAGE" ? "Image" : "Video"}</p>
          <div className={readOnly ? "pointer-events-none" : ""}>
            <MediaUploader
              format={fmt}
              compact
              url={card.media_url}
              onChange={(u) => {
                if (u.kind !== fmt.toLowerCase()) return void toast.error(`That file is ${u.kind === "image" ? "an image" : `a ${u.kind}`}. Cards in this carousel use ${fmt.toLowerCase()}s.`);
                patchCard(i, { media_url: u.url, handle: undefined });
                touch(`cards.${i}.media`);
              }}
              onClear={() => patchCard(i, { media_url: undefined, handle: undefined })}
            />
          </div>
          <FieldIssues path={`cards.${i}.media`} />
          <FieldIssues path={`cards.${i}`} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-ink-2">Card text</p>
          <VariableText
            id={`card-${i}-body`}
            value={card.body}
            onChange={(v) => patchCard(i, { body: v })}
            samples={card.body_examples}
            onSamples={(v) => patchCard(i, { body_examples: v })}
            max={LIMITS.cardBody}
            path={`cards.${i}.body`}
            examplePath={(n) => `cards.${i}.example.${n}`}
            minH="min-h-[5.5rem]"
            placeholder="e.g. Heritage Weave Jacket, now ₹3,499"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-ink-2">Buttons</p>
            <span className="text-xs text-ink-3">Up to {LIMITS.cardButtons}, same on every card</span>
          </div>
          <ButtonsEditor
            buttons={card.buttons}
            types={CARD_TYPES}
            maxTotal={LIMITS.cardButtons}
            prefix={`cards.${i}.buttons`}
            onAdd={addButton}
            onRemove={removeButton}
            onMove={moveButton}
            onPatch={patchOwnButton}
            extra={
              cards.length > 1 && card.buttons.length > 0 ? (
                <Tooltip content="Copy this card's button types, labels and links to every card">
                  <Button variant="ghost" size="sm" leading={<CopySimple size={14} />} onClick={applyToAll}>
                    Apply to all cards
                  </Button>
                </Tooltip>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
