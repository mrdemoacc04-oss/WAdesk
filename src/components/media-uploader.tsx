"use client";
import * as React from "react";
import { FilePdf, FileArrowUp, ImageSquare, Play, Trash, VideoCamera } from "@phosphor-icons/react";
import { toast } from "sonner";
import { cn } from "@/lib/shared/utils";
import { ACCEPT, prettySize, uploadFile, type Uploaded } from "@/lib/client/upload";
import { errorMessage } from "@/lib/client/api";

type Format = "IMAGE" | "VIDEO" | "DOCUMENT";

const LABEL: Record<Format, string> = {
  IMAGE: "JPG, PNG or WebP · up to 5 MB",
  VIDEO: "MP4 or 3GP · up to 16 MB",
  DOCUMENT: "PDF or Office file · up to 100 MB",
};

export function isVideoUrl(url?: string | null) {
  return !!url && /\.(mp4|mov|webm|3gp)(\?|$)/i.test(url);
}

/** Drop-zone + preview for a single media file. `url` is the current value. */
export function MediaUploader({
  format,
  url,
  filename,
  onChange,
  onClear,
  compact,
  className,
  label,
}: {
  format: Format;
  url?: string | null;
  filename?: string | null;
  onChange: (u: Uploaded) => void;
  onClear?: () => void;
  compact?: boolean;
  className?: string;
  label?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);

  const handle = async (file?: File | null) => {
    if (!file) return;
    setProgress(8);
    try {
      const u = await uploadFile(file, setProgress);
      onChange(u);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const Icon = format === "IMAGE" ? ImageSquare : format === "VIDEO" ? VideoCamera : FilePdf;

  if (url && progress === null) {
    return (
      <div className={cn("group relative overflow-hidden rounded-2xl bg-surface-2 hairline", className)}>
        {format === "IMAGE" && <img src={url} alt="" className={cn("w-full object-cover", compact ? "h-28" : "h-44")} />}
        {format === "VIDEO" &&
          (isVideoUrl(url) ? (
            <video src={url} className={cn("w-full object-cover", compact ? "h-28" : "h-44")} muted playsInline />
          ) : (
            <img src={url} alt="" className={cn("w-full object-cover", compact ? "h-28" : "h-44")} />
          ))}
        {format === "DOCUMENT" && (
          <div className="flex items-center gap-3 p-4">
            <div className="grid size-11 place-items-center rounded-xl bg-danger-soft text-danger">
              <FilePdf size={22} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{filename ?? url.split("/").pop()}</p>
              <p className="text-xs text-ink-3">Document</p>
            </div>
          </div>
        )}
        {format === "VIDEO" && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
              <Play size={18} weight="fill" />
            </span>
          </span>
        )}
        <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <button type="button" onClick={() => inputRef.current?.click()} className="grid h-8 place-items-center rounded-full bg-surface px-3 text-xs font-medium shadow-card hairline">
            Replace
          </button>
          {onClear && (
            <button type="button" onClick={onClear} aria-label="Remove file" className="grid size-8 place-items-center rounded-full bg-surface text-danger shadow-card hairline">
              <Trash size={15} />
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept={ACCEPT[format]} className="sr-only" onChange={(e) => handle(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handle(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface-2/60 px-4 text-center transition-colors duration-300",
        compact ? "py-5" : "py-9",
        drag && "border-accent bg-accent-soft",
        className,
      )}
    >
      {progress !== null ? (
        <>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-ink-3">Uploading…</p>
        </>
      ) : (
        <>
          <div className="grid size-10 place-items-center rounded-full bg-surface text-ink-2 hairline">{drag ? <FileArrowUp size={20} /> : <Icon size={20} />}</div>
          <div>
            <button type="button" onClick={() => inputRef.current?.click()} className="text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              {label ?? `Upload ${format.toLowerCase()}`}
            </button>
            <span className="text-sm text-ink-3"> or drop it here</span>
          </div>
          <p className="text-xs text-ink-4">{LABEL[format]}</p>
        </>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT[format]} className="sr-only" onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  );
}

export { prettySize };
