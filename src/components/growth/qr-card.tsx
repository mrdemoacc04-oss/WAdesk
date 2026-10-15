"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ArrowSquareOut, BookmarkSimple, CheckCircle, DownloadSimple, Lightning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { CopyButton } from "@/components/settings/copy-button";
import { post, refresh, toastError } from "@/lib/client/api";
import { useAutomations } from "@/lib/client/hooks";

const QR_COLORS = { dark: "#14150f", light: "#ffffff" } as const;

type SizeKey = "s" | "m" | "l";
/** Display size on screen, and the pixel size of the PNG / SVG you download. */
const SIZES: Record<SizeKey, { label: string; view: number; file: number }> = {
  s: { label: "Small", view: 156, file: 512 },
  m: { label: "Medium", view: 208, file: 1024 },
  l: { label: "Large", view: 264, file: 2048 },
};

function useQrSvg(text: string | null) {
  const [svg, setSvg] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!text) return;
    let cancelled = false;
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: QR_COLORS })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [text]);
  return text ? svg : null;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function QrCard({
  url,
  keyword,
  onSave,
  fileBase,
}: {
  url: string | null;
  keyword: string;
  onSave: (name: string) => void;
  fileBase: string;
}) {
  const router = useRouter();
  const svg = useQrSvg(url);
  const [size, setSize] = React.useState<SizeKey>("m");
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const { data: rules } = useAutomations();

  const kw = keyword.toLowerCase();
  const existing = kw ? rules?.find((r) => r.trigger.type === "keyword" && r.trigger.keywords.some((k) => k.toLowerCase() === kw)) : undefined;

  const downloadPng = async () => {
    if (!url) return;
    try {
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: SIZES[size].file, errorCorrectionLevel: "M", color: QR_COLORS });
      const blob = await (await fetch(dataUrl)).blob();
      saveBlob(blob, `${fileBase}-qr-${SIZES[size].file}.png`);
    } catch (e) {
      toastError(e);
    }
  };

  const downloadSvg = () => {
    if (!svg) return;
    const px = SIZES[size].file;
    const sized = svg.replace("<svg ", `<svg width="${px}" height="${px}" `);
    saveBlob(new Blob([sized], { type: "image/svg+xml;charset=utf-8" }), `${fileBase}-qr.svg`);
  };

  const createAutomation = async () => {
    if (!kw) return;
    setCreating(true);
    try {
      await post("/api/automations", {
        name: `Link: ${keyword.toUpperCase()}`,
        enabled: true,
        priority: 1,
        trigger: { type: "keyword", match: "contains", keywords: [kw] },
        actions: [
          { type: "add_tag", tag: kw },
          { type: "send_text", body: "Thanks for getting in touch, {{first_name}}. A teammate will reply shortly." },
        ],
      });
      await refresh("/api/automations", "/api/tags");
      toast.success(`Automation created for [${keyword.toUpperCase()}]`, {
        description: `People who use this keyword get the tag “${kw}” and a thank-you reply.`,
        action: { label: "Open", onClick: () => router.push("/automations") },
      });
    } catch (e) {
      toastError(e);
    } finally {
      setCreating(false);
    }
  };

  const submitSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    onSave(name.trim() || "Untitled link");
    setName("");
    toast.success("Link saved");
  };

  const px = SIZES[size].view;

  return (
    <Card className="h-full" coreClassName="flex h-full flex-col gap-6">
      <CardHeader className="mb-0" title="Your link" description="Anyone who taps it, or scans the code, opens a WhatsApp chat with you." />

      {/* link */}
      <div>
        <div className="rounded-2xl bg-surface-2 p-3.5 hairline" aria-live="polite">
          {url ? (
            <p className="break-all font-mono text-[13px] leading-relaxed text-ink-2">{url}</p>
          ) : (
            <p className="text-sm text-ink-3">Enter a valid WhatsApp number to see your link.</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {url ? <CopyButton text={url} label="Copy link" variant="primary" size="md" toastMessage="Link copied" /> : <Button disabled>Copy link</Button>}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-5 text-sm font-medium text-ink hairline transition-colors hover:bg-surface-2">
              Test it <ArrowSquareOut size={15} />
            </a>
          ) : (
            <Button variant="secondary" disabled>
              Test it
            </Button>
          )}
        </div>
      </div>

      {/* QR */}
      <div className="flex flex-col items-center gap-5 rounded-2xl bg-surface-2 px-4 py-6 hairline sm:flex-row sm:items-center sm:justify-center sm:gap-8">
        <div
          className="shrink-0 rounded-2xl bg-white p-3 shadow-card transition-[width,height] duration-500 ease-fluid hairline"
          style={{ width: px + 24, height: px + 24 }}
          role="img"
          aria-label="QR code for your WhatsApp link"
        >
          {svg ? <div className="size-full [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="skeleton size-full !rounded-xl" />}
        </div>
        <div className="flex w-full flex-col items-center gap-4 sm:w-auto sm:items-start">
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Size</p>
            <Segmented size="sm" aria-label="QR code size" value={size} onValueChange={setSize} options={(Object.keys(SIZES) as SizeKey[]).map((k) => ({ value: k, label: k.toUpperCase() }))} />
            <p className="tabular mt-2 text-xs text-ink-3">
              {SIZES[size].label} · {SIZES[size].file} × {SIZES[size].file} px
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" leading={<DownloadSimple size={15} />} disabled={!url} onClick={downloadPng}>
              PNG
            </Button>
            <Button variant="secondary" size="sm" leading={<DownloadSimple size={15} />} disabled={!svg} onClick={downloadSvg}>
              SVG
            </Button>
          </div>
        </div>
      </div>

      {/* keyword automation */}
      <div className="rounded-2xl bg-surface-2 p-4 hairline">
        <div className="flex items-start gap-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <Lightning size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium">Tag people who use this link</h4>
            {!kw ? (
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Add a tracking keyword on the left, then create an automation that tags everyone who messages with it.</p>
            ) : existing ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] leading-relaxed text-ink-3">
                <CheckCircle size={15} weight="fill" className="text-accent" />
                An automation already handles [{keyword.toUpperCase()}].
                <Link href="/automations" className="font-medium text-ink underline underline-offset-2">
                  View it
                </Link>
              </p>
            ) : (
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                Creates a rule that tags contacts as “{kw}” and sends a short thank-you whenever a message contains [{keyword.toUpperCase()}].
              </p>
            )}
            {kw && !existing && (
              <Button className="mt-3" variant="secondary" size="sm" loading={creating} disabled={!url} onClick={createAutomation}>
                Create automation for this keyword
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* save */}
      <form onSubmit={submitSave} className="mt-auto flex flex-col gap-2 sm:flex-row">
        <Input className="flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this link, for example Spring flyer" aria-label="Name for this link" maxLength={60} disabled={!url} />
        <Button type="submit" variant="secondary" leading={<BookmarkSimple size={16} />} disabled={!url}>
          Save link
        </Button>
      </form>
    </Card>
  );
}
