"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

/** `g` then a letter jumps to a page; `n` starts a campaign. Ignored while typing or when a dialog is open. */
export const GO_KEYS: Record<string, { href: string; label: string }> = {
  d: { href: "/", label: "Dashboard" },
  i: { href: "/inbox", label: "Inbox" },
  c: { href: "/contacts", label: "Contacts" },
  m: { href: "/campaigns", label: "Campaigns" },
  t: { href: "/templates", label: "Templates" },
  a: { href: "/analytics", label: "Analytics" },
  s: { href: "/settings", label: "Settings" },
};

export function useGlobalShortcuts() {
  const router = useRouter();
  React.useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[role='dialog']")) return;
      const k = e.key.toLowerCase();
      if (pending) {
        pending = false;
        const go = GO_KEYS[k];
        if (go) {
          e.preventDefault();
          router.push(go.href);
        }
        return;
      }
      if (k === "g") {
        pending = true;
        clearTimeout(timer);
        timer = setTimeout(() => (pending = false), 1200);
      } else if (k === "n") {
        e.preventDefault();
        router.push("/campaigns/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [router]);
}
