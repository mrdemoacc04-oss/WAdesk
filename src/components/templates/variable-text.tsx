"use client";
import * as React from "react";
import { Code, Plus, Smiley, TextB, TextItalic, TextStrikethrough } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Inset } from "@/components/ui/display";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/menu";
import { EMOJIS } from "@/lib/shared/constants";
import { nextVarIndex, varIndexes } from "@/lib/shared/template";
import { cn } from "@/lib/shared/utils";
import { Counter, FieldIssues, useIssues } from "./issues";
import { insertText, toggleWrap, type Edit } from "./text-ops";

const FORMATS = [
  { key: "bold", marker: "*", label: "Bold", keys: "⌘B", icon: TextB },
  { key: "italic", marker: "_", label: "Italic", keys: "⌘I", icon: TextItalic },
  { key: "strike", marker: "~", label: "Strikethrough", keys: "", icon: TextStrikethrough },
  { key: "mono", marker: "```", label: "Monospace", keys: "", icon: Code },
] as const;

/**
 * Message textarea with a WhatsApp formatting toolbar, an emoji picker and variable support.
 * Used for the template body and for carousel card text; sample values for each variable sit underneath.
 */
export function VariableText({
  id,
  value,
  onChange,
  samples,
  onSamples,
  max,
  path,
  examplePath,
  placeholder,
  minH = "min-h-[8.5rem]",
  hint,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  samples: string[];
  onSamples: (v: string[]) => void;
  max: number;
  path: string;
  examplePath: (n: number) => string;
  placeholder?: string;
  minH?: string;
  hint?: React.ReactNode;
}) {
  const { touch, invalid, readOnly } = useIssues();
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const pending = React.useRef<[number, number] | null>(null);
  const [emojiOpen, setEmojiOpen] = React.useState(false);

  // controlled textareas jump the caret to the end on every change; put it back after render
  React.useLayoutEffect(() => {
    const p = pending.current;
    const ta = ref.current;
    if (p && ta) {
      ta.setSelectionRange(p[0], p[1]);
      pending.current = null;
    }
  });

  const sel = () => {
    const ta = ref.current;
    return { s: ta?.selectionStart ?? value.length, e: ta?.selectionEnd ?? value.length };
  };
  const apply = (edit: Edit, focus = true) => {
    pending.current = [edit.start, edit.end];
    onChange(edit.value);
    touch(path);
    if (focus) ref.current?.focus();
  };
  const wrap = (marker: string) => {
    const { s, e } = sel();
    apply(toggleWrap(value, s, e, marker));
  };
  const addVariable = () => {
    const { s, e } = sel();
    apply(insertText(value, s, e, `{{${nextVarIndex(value)}}}`));
  };
  const addEmoji = (emoji: string) => {
    const { s, e } = sel();
    apply(insertText(value, s, e, emoji), false);
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === "b" || k === "i") {
      ev.preventDefault();
      wrap(k === "b" ? "*" : "_");
    }
  };

  const vars = varIndexes(value);
  const setSample = (n: number, v: string) => {
    const next = Array.from({ length: Math.max(samples.length, n) }, (_, i) => samples[i] ?? "");
    next[n - 1] = v;
    onSamples(next);
  };
  const bad = invalid(path);

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "rounded-xl bg-surface hairline transition-shadow duration-300 ease-fluid focus-within:shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_4px_color-mix(in_srgb,var(--accent)_14%,transparent)]",
          bad && "shadow-[inset_0_0_0_1.5px_var(--danger)]",
        )}
      >
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 border-b border-line px-1.5 py-1.5">
            {FORMATS.map((f) => (
              <Tooltip key={f.key} content={f.keys ? `${f.label}  ${f.keys}` : f.label}>
                <Button variant="ghost" size="icon-xs" aria-label={f.label} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(f.marker)}>
                  <f.icon size={16} />
                </Button>
              </Tooltip>
            ))}
            <span className="mx-1 h-4 w-px bg-line" aria-hidden />
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <Tooltip content="Emoji">
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Insert emoji" onMouseDown={(e) => e.preventDefault()}>
                    <Smiley size={16} />
                  </Button>
                </PopoverTrigger>
              </Tooltip>
              <PopoverContent
                className="w-[min(300px,calc(100vw-48px))] p-2"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                  ref.current?.focus();
                }}
              >
                <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto" role="listbox" aria-label="Emoji">
                  {EMOJIS.map((em, i) => (
                    <button
                      key={em + i}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => addEmoji(em)}
                      className="grid size-8 place-items-center rounded-lg text-[18px] transition-colors hover:bg-ink/[0.07] focus-visible:bg-ink/[0.07] focus-visible:outline-none"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex-1" />
            <Button variant="soft" size="xs" aria-label="Add variable" leading={<Plus size={13} weight="bold" />} onMouseDown={(e) => e.preventDefault()} onClick={addVariable}>
              <span className="sm:hidden">Variable</span>
              <span className="hidden sm:inline">Add variable</span>
            </Button>
          </div>
        )}
        <textarea
          id={id}
          ref={ref}
          value={value}
          rows={4}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            touch(path);
          }}
          onBlur={() => touch(path)}
          onKeyDown={onKeyDown}
          className={cn("field-sizing-content block max-h-[26rem] w-full resize-none bg-transparent px-3.5 py-3 text-[16px] leading-relaxed text-ink outline-none placeholder:text-ink-4 md:text-sm", minH)}
        />
        <div className="flex items-center justify-between gap-3 px-3.5 pb-2.5 pt-0.5">
          <span className="min-w-0 truncate text-xs text-ink-4">{hint}</span>
          <Counter n={value.length} max={max} />
        </div>
      </div>
      <FieldIssues path={path} />

      {vars.length > 0 && (
        <Inset className="flex flex-col gap-3 p-3.5">
          <div>
            <p className="text-[13px] font-medium">Sample values</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-3">WhatsApp reviewers need an example for each variable. In a campaign, every variable is filled from your contacts.</p>
          </div>
          {vars.map((n) => (
            <div key={n} className="flex items-start gap-3">
              <span className="mt-[9px] w-10 shrink-0 font-mono text-xs text-accent-ink">{`{{${n}}}`}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Input
                  aria-label={`Sample value for variable ${n}`}
                  value={samples[n - 1] ?? ""}
                  placeholder={n === 1 ? "e.g. Aarav" : "Sample value"}
                  maxLength={200}
                  invalid={invalid(examplePath(n))}
                  onChange={(e) => {
                    setSample(n, e.target.value);
                    touch(examplePath(n));
                  }}
                  onBlur={() => touch(examplePath(n))}
                />
                <FieldIssues path={examplePath(n)} />
              </div>
            </div>
          ))}
        </Inset>
      )}
    </div>
  );
}
