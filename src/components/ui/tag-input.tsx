"use client";
import * as React from "react";
import { X } from "@phosphor-icons/react";
import { cn, hueStyle } from "@/lib/shared/utils";

export function TagChip({ tag, onRemove, className }: { tag: string; onRemove?: () => void; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium", className)} style={hueStyle(tag)}>
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${tag}`} className="-mr-1 grid size-4 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100">
          <X size={10} weight="bold" />
        </button>
      )}
    </span>
  );
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add a tag…",
  className,
  "aria-label": ariaLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const t = raw.toLowerCase().replace(/[,"{}\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 32);
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };

  const hits = suggestions.filter((s) => !value.includes(s) && s.includes(draft.toLowerCase().trim())).slice(0, 6);

  return (
    <div className={cn("relative", className)}>
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl bg-surface px-2.5 py-1.5 hairline transition-shadow duration-300",
          focus && "shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_4px_color-mix(in_srgb,var(--accent)_14%,transparent)]",
        )}
      >
        {value.map((t) => (
          <TagChip key={t} tag={t} onRemove={() => onChange(value.filter((x) => x !== t))} />
        ))}
        <input
          ref={inputRef}
          aria-label={ariaLabel ?? "Tags"}
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => {
            setFocus(false);
            if (draft.trim()) add(draft);
          }}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-24 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-4 md:text-sm"
        />
      </div>
      {focus && hits.length > 0 && (
        <div className="menu absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl bg-surface p-1.5 shadow-pop hairline" data-state="open">
          {hits.map((h) => (
            <button
              key={h}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                add(h);
              }}
              className="flex w-full items-center rounded-xl px-2.5 py-1.5 text-left text-sm hover:bg-ink/[0.06]"
            >
              {h}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
