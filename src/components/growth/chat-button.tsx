"use client";
import * as React from "react";
import { Browser, Code } from "@phosphor-icons/react";
import { Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { CopyButton } from "@/components/settings/copy-button";
import { cn } from "@/lib/shared/utils";

/** WhatsApp glyph (Simple Icons, CC0). */
const WA_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

const SWATCHES = [
  { name: "WhatsApp green", value: "#25D366" },
  { name: "Emerald", value: "#0E8A52" },
  { name: "Ink", value: "#14150F" },
  { name: "Blue", value: "#2A62C9" },
  { name: "Violet", value: "#6B5BD6" },
  { name: "Coral", value: "#C2693A" },
];

/** Black or white text, whichever reads better on the chosen colour. */
function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#14150f" : "#ffffff";
}

interface Opts {
  url: string;
  side: "left" | "right";
  label: string;
  greeting: string;
  color: string;
}

function buildSnippet(o: Opts): string {
  const cfg = JSON.stringify({ url: o.url, side: o.side, label: o.label.trim(), greeting: o.greeting.trim(), color: o.color, ink: inkFor(o.color) }, null, 2)
    .replace(/</g, "\\u003c")
    .split("\n")
    .map((l, i) => (i === 0 ? l : "  " + l))
    .join("\n");
  return `<!-- WhatsApp chat button, made with WAdesk. Paste before </body>. -->
<script>
(function () {
  var cfg = ${cfg};

  var css =
    ".wadesk-wa{position:fixed;bottom:20px;" + cfg.side + ":20px;z-index:2147483000;display:flex;flex-direction:column;gap:10px;" +
    "align-items:" + (cfg.side === "right" ? "flex-end" : "flex-start") + ";font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".wadesk-wa__bubble{max-width:240px;padding:10px 14px;border-radius:16px;background:#fff;color:#14150f;font-size:14px;line-height:1.4;" +
    "box-shadow:0 8px 28px rgba(0,0,0,.18);opacity:0;transform:translateY(6px);transition:opacity .3s,transform .3s;pointer-events:none}" +
    ".wadesk-wa__bubble.is-on{opacity:1;transform:none}" +
    ".wadesk-wa__btn{display:inline-flex;align-items:center;gap:10px;height:56px;min-width:56px;justify-content:center;padding:0 " +
    (cfg.label ? "20px" : "0") + ";border-radius:999px;background:" + cfg.color + ";color:" + cfg.ink +
    ";text-decoration:none;font-size:15px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:transform .2s}" +
    ".wadesk-wa__btn:hover{transform:translateY(-2px)}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var wrap = document.createElement("div");
  wrap.className = "wadesk-wa";

  var bubble;
  if (cfg.greeting) {
    bubble = document.createElement("div");
    bubble.className = "wadesk-wa__bubble";
    bubble.textContent = cfg.greeting;
    wrap.appendChild(bubble);
  }

  var link = document.createElement("a");
  link.className = "wadesk-wa__btn";
  link.href = cfg.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", cfg.label || "Chat on WhatsApp");
  link.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${WA_PATH}"/></svg>';
  if (cfg.label) {
    var text = document.createElement("span");
    text.textContent = cfg.label;
    link.appendChild(text);
  }
  wrap.appendChild(link);
  document.body.appendChild(wrap);

  if (bubble) {
    setTimeout(function () { bubble.classList.add("is-on"); }, 2000);
    setTimeout(function () { bubble.classList.remove("is-on"); }, 14000);
  }
})();
</script>`;
}

export function WebsiteChatButton({ url }: { url: string | null }) {
  const [side, setSide] = React.useState<"left" | "right">("right");
  const [label, setLabel] = React.useState("Chat with us");
  const [greeting, setGreeting] = React.useState("Hi! How can we help you today?");
  const [color, setColor] = React.useState("#25D366");

  const snippet = React.useMemo(() => buildSnippet({ url: url ?? "https://wa.me/YOUR_NUMBER", side, label, greeting, color }), [url, side, label, greeting, color]);
  const ink = inkFor(color);

  return (
    <Card>
      <CardHeader title="Website chat button" description="A floating WhatsApp button for your website. Customise it, then paste the code before the closing body tag." />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <Field label="Position">
            <Segmented
              aria-label="Button position"
              value={side}
              onValueChange={setSide}
              options={[
                { value: "left", label: "Bottom left" },
                { value: "right", label: "Bottom right" },
              ]}
            />
          </Field>
          <Field label="Greeting bubble" hint="Pops up above the button after two seconds. Leave empty for no bubble.">
            <Input value={greeting} onChange={(e) => setGreeting(e.target.value)} maxLength={90} placeholder="Hi! How can we help you today?" />
          </Field>
          <Field label="Button label" hint="Leave empty for a round icon-only button.">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={24} placeholder="Chat with us" />
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Button colour">
              {SWATCHES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-label={s.name}
                  aria-pressed={color.toLowerCase() === s.value.toLowerCase()}
                  onClick={() => setColor(s.value)}
                  className={cn("size-8 rounded-full ring-offset-2 ring-offset-surface transition-transform duration-300 ease-fluid hover:scale-110", color.toLowerCase() === s.value.toLowerCase() ? "ring-2 ring-ink" : "hairline-strong")}
                  style={{ background: s.value }}
                />
              ))}
              <label className="relative inline-flex h-8 cursor-pointer items-center gap-2 rounded-full bg-surface px-3 text-xs text-ink-2 hairline hover:bg-surface-2">
                <span className="size-4 rounded-full hairline-strong" style={{ background: color }} />
                Custom
                <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Pick a custom colour" />
              </label>
            </div>
          </Field>
        </div>

        <div className="min-w-0 space-y-5">
          {/* live preview */}
          <div>
            <p className="mb-2.5 flex items-center gap-2 text-[13px] font-medium text-ink-2">
              <Browser size={16} /> Live preview
            </p>
            <div className="overflow-hidden rounded-2xl bg-surface-2 hairline">
              <div className="flex items-center gap-1.5 border-b border-line px-3.5 py-2.5">
                <span className="size-2.5 rounded-full bg-ink/15" />
                <span className="size-2.5 rounded-full bg-ink/15" />
                <span className="size-2.5 rounded-full bg-ink/15" />
                <span className="ml-3 h-5 flex-1 rounded-full bg-ink/[0.06]" />
              </div>
              <div className="relative h-[270px] overflow-hidden px-5 py-5" aria-label="Preview of your website with the chat button">
                <div className="space-y-3" aria-hidden>
                  <div className="h-3 w-1/3 rounded-full bg-ink/10" />
                  <div className="h-2.5 w-2/3 rounded-full bg-ink/[0.06]" />
                  <div className="h-2.5 w-1/2 rounded-full bg-ink/[0.06]" />
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="h-20 rounded-xl bg-ink/[0.05]" />
                    <div className="h-20 rounded-xl bg-ink/[0.05]" />
                    <div className="h-20 rounded-xl bg-ink/[0.05]" />
                  </div>
                </div>
                <div className={cn("absolute bottom-4 flex flex-col gap-2.5", side === "right" ? "right-4 items-end" : "left-4 items-start")}>
                  {greeting.trim() && (
                    <div className="max-w-[210px] rounded-2xl bg-white px-3.5 py-2.5 text-[13px] leading-snug text-[#14150f] shadow-pop">
                      {greeting}
                    </div>
                  )}
                  <span
                    className={cn("inline-flex h-14 min-w-14 items-center justify-center gap-2.5 rounded-full text-[15px] font-semibold shadow-pop transition-colors", label.trim() ? "px-5" : "px-0")}
                    style={{ background: color, color: ink }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d={WA_PATH} />
                    </svg>
                    {label.trim()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* code */}
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                <Code size={16} /> Code to paste
              </p>
              <CopyButton text={snippet} label="Copy code" toastMessage="Code copied. Paste it before </body> on your site." disabled={!url} />
            </div>
            <pre className="hairline max-h-64 overflow-auto rounded-2xl bg-[#14150f] p-4 font-mono text-xs leading-relaxed text-[#d9ddd0]" tabIndex={0} aria-label="Chat button code">
              <code>{snippet}</code>
            </pre>
            {!url && <p className="mt-2 text-xs text-warn">Enter a valid WhatsApp number above to get working code.</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}
