"use client";
import * as React from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Copy text to the clipboard, with a textarea fallback for non-secure contexts (plain http on a LAN). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  toastMessage,
  variant = "secondary",
  size = "sm",
  iconOnly,
  className,
  ...rest
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  toastMessage?: string;
  iconOnly?: boolean;
} & Omit<ButtonProps, "onClick" | "children">) {
  const [done, setDone] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const onClick = async () => {
    const ok = await copyText(text);
    if (!ok) {
      toast.error("Couldn't copy. Select the text and copy it manually.");
      return;
    }
    if (toastMessage) toast.success(toastMessage);
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1800);
  };

  const Icon = done ? Check : Copy;
  return (
    <Button
      variant={variant}
      size={iconOnly ? "icon-sm" : size}
      onClick={onClick}
      aria-label={iconOnly ? (done ? copiedLabel : label) : undefined}
      className={className}
      leading={<Icon size={15} weight={done ? "bold" : "regular"} />}
      {...rest}
    >
      {iconOnly ? null : done ? copiedLabel : label}
    </Button>
  );
}
