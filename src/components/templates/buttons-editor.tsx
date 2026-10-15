"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowBendUpLeft, ArrowDown, ArrowSquareOut, ArrowUp, Copy, Phone, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { Tooltip } from "@/components/ui/menu";
import { LIMITS, varIndexes } from "@/lib/shared/template";
import { countryName, flagEmoji, normalizePhone } from "@/lib/shared/phone";
import { cn } from "@/lib/shared/utils";
import { BUTTON_LABEL, addBlocker, type ButtonType, type EButton } from "./model";
import { Counter, FieldIssues, useIssues } from "./issues";

const ICON: Record<ButtonType, React.ReactNode> = {
  QUICK_REPLY: <ArrowBendUpLeft size={15} />,
  URL: <ArrowSquareOut size={15} />,
  PHONE_NUMBER: <Phone size={15} />,
  COPY_CODE: <Copy size={15} />,
};

const stripVar = (u: string) => u.replace(/\{\{\s*\d+\s*\}\}/g, "");

export function ButtonsEditor({
  buttons,
  types,
  maxTotal,
  prefix,
  onAdd,
  onRemove,
  onMove,
  onPatch,
  extra,
}: {
  buttons: EButton[];
  types: ButtonType[];
  maxTotal: number;
  /** validator path of this list, e.g. `buttons` or `cards.2.buttons` */
  prefix: string;
  /** add a button; returns its key so the new row can take focus */
  onAdd: (type: ButtonType) => string;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onPatch: (i: number, patch: Record<string, unknown>) => void;
  extra?: React.ReactNode;
}) {
  const { touch, readOnly } = useIssues();
  const [focusKey, setFocusKey] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {types.map((t) => {
            const why = addBlocker(buttons, t, maxTotal);
            return (
              <Tooltip key={t} content={why}>
                <span tabIndex={why ? 0 : -1} className={cn("inline-flex rounded-full", why && "cursor-not-allowed")}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!!why}
                    leading={<Plus size={13} weight="bold" />}
                    onClick={() => {
                      setFocusKey(onAdd(t));
                      touch(prefix);
                    }}
                  >
                    {BUTTON_LABEL[t]}
                  </Button>
                </span>
              </Tooltip>
            );
          })}
          {extra}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {buttons.map((b, i) => (
            <motion.div
              key={b._k ?? i}
              layout="position"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            >
              <ButtonRow
                b={b}
                index={i}
                total={buttons.length}
                path={`${prefix}.${i}`}
                autoFocus={focusKey === b._k}
                onRemove={() => {
                  onRemove(i);
                  touch(prefix);
                }}
                onMove={(d) => {
                  onMove(i, d);
                  touch(prefix);
                }}
                onPatch={(p) => {
                  onPatch(i, p);
                  touch(`${prefix}.${i}`, prefix);
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {!buttons.length && (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] leading-relaxed text-ink-3">
            No buttons yet. Quick replies give one-tap answers; a link sends people to your site.
          </p>
        )}
      </div>
      <FieldIssues path={prefix} />
    </div>
  );
}

function ButtonRow({
  b,
  index,
  total,
  path,
  autoFocus,
  onRemove,
  onMove,
  onPatch,
}: {
  b: EButton;
  index: number;
  total: number;
  path: string;
  autoFocus: boolean;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  onPatch: (p: Record<string, unknown>) => void;
}) {
  const { invalid, touch, readOnly } = useIssues();
  const bad = invalid(path);
  const id = React.useId();

  return (
    <div className="rounded-2xl bg-surface-2 p-3.5 hairline">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-surface text-ink-2 hairline">{ICON[b.type]}</span>
        <span className="text-[13px] font-medium">{BUTTON_LABEL[b.type]}</span>
        <span className="text-xs text-ink-4">Button {index + 1}</span>
        <div className="flex-1" />
        {!readOnly && (
          <div className="-mr-1 flex items-center">
            <Button variant="ghost" size="icon-xs" aria-label="Move button up" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp size={14} />
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Move button down" disabled={index === total - 1} onClick={() => onMove(1)}>
              <ArrowDown size={14} />
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Remove button" className="hover:bg-danger-soft hover:text-danger" onClick={onRemove}>
              <Trash size={14} />
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {b.type !== "COPY_CODE" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-text`}>Button text</Label>
            <Input
              id={`${id}-text`}
              value={b.text}
              autoFocus={autoFocus}
              maxLength={60}
              invalid={bad && (b.text.trim().length === 0 || b.text.length > LIMITS.buttonText)}
              placeholder={b.type === "QUICK_REPLY" ? "e.g. Tell me more" : b.type === "URL" ? "e.g. Shop now" : "e.g. Call us"}
              onChange={(e) => onPatch({ text: e.target.value })}
              onBlur={() => touch(path)}
              trailing={<Counter n={b.text.length} max={LIMITS.buttonText} />}
              className="[&_input]:pr-14"
            />
          </div>
        )}

        {b.type === "URL" && <UrlFields b={b} id={id} bad={bad} onPatch={onPatch} onBlur={() => touch(path)} />}

        {b.type === "PHONE_NUMBER" && <PhoneField value={b.phone_number} id={id} bad={bad} onPatch={onPatch} onBlur={() => touch(path)} />}

        {b.type === "COPY_CODE" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-code`}>Example offer code</Label>
            <Input
              id={`${id}-code`}
              value={b.example}
              autoFocus={autoFocus}
              maxLength={20}
              invalid={bad}
              placeholder="e.g. DIWALI20"
              className="font-mono [&_input]:pr-14"
              onChange={(e) => onPatch({ example: e.target.value })}
              onBlur={() => touch(path)}
              trailing={<Counter n={b.example.length} max={15} />}
            />
            <p className="text-xs leading-relaxed text-ink-3">People tap the button to copy the code. Each campaign can send a different code.</p>
          </div>
        )}
        <FieldIssues path={path} />
      </div>
    </div>
  );
}

function UrlFields({ b, id, bad, onPatch, onBlur }: { b: Extract<EButton, { type: "URL" }>; id: string; bad: boolean; onPatch: (p: Record<string, unknown>) => void; onBlur: () => void }) {
  const dynamic = varIndexes(b.url).length > 0;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-url`}>Link</Label>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          value={b.url}
          invalid={bad && !/^https?:\/\//i.test(b.url)}
          placeholder="https://example.com/offer"
          className="font-mono [&_input]:text-[16px] md:[&_input]:text-[13px]"
          onChange={(e) => onPatch({ url: e.target.value })}
          onBlur={onBlur}
        />
      </div>
      <div className="flex items-start gap-3">
        <Switch
          id={`${id}-dyn`}
          checked={dynamic}
          onCheckedChange={(on) => onPatch(on ? { url: stripVar(b.url) + "{{1}}" } : { url: stripVar(b.url), example: undefined })}
          aria-label="Add a variable to the end of the link"
          className="mt-0.5"
        />
        <div className="min-w-0">
          <Label htmlFor={`${id}-dyn`} className="cursor-pointer">
            Different ending per message
          </Label>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
            Adds <span className="font-mono text-accent-ink">{"{{1}}"}</span> to the end of the link, so a campaign can send each person to their own page, such as order tracking.
          </p>
        </div>
      </div>
      {dynamic && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-ex`}>Example full link</Label>
          <Input
            id={`${id}-ex`}
            type="url"
            inputMode="url"
            value={b.example ?? ""}
            placeholder="https://example.com/track/DB20481"
            invalid={bad && !(b.example ?? "").trim()}
            className="font-mono [&_input]:text-[16px] md:[&_input]:text-[13px]"
            onChange={(e) => onPatch({ example: e.target.value })}
            onBlur={onBlur}
          />
        </div>
      )}
    </>
  );
}

function PhoneField({ value, id, bad, onPatch, onBlur }: { value: string; id: string; bad: boolean; onPatch: (p: Record<string, unknown>) => void; onBlur: () => void }) {
  const parsed = value.trim().startsWith("+") ? normalizePhone(value) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-tel`}>Phone number</Label>
      <Input
        id={`${id}-tel`}
        type="tel"
        inputMode="tel"
        value={value}
        invalid={bad && !/^\+\d{7,15}$/.test(value.replace(/[\s-]/g, ""))}
        placeholder="+91 98765 43210"
        className="font-mono"
        onChange={(e) => onPatch({ phone_number: e.target.value })}
        onBlur={onBlur}
      />
      <p className="text-xs leading-relaxed text-ink-3">
        {parsed?.ok ? (
          <span className="text-accent-ink">
            {flagEmoji(parsed.country)} {countryName(parsed.country) || "Valid number"} · {parsed.national}
          </span>
        ) : (
          "Start with the country code, for example +91 for India."
        )}
      </p>
    </div>
  );
}
