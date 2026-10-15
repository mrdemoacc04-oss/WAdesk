"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DotsThreeOutline } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/dialog";
import { useConfig } from "@/lib/client/hooks";
import { NAV_GROUPS, SETTINGS_ITEM, isActive } from "./nav";
import { cn } from "@/lib/shared/utils";

const PRIMARY = ["/", "/inbox", "/campaigns", "/contacts"];

export function MobileNav() {
  const pathname = usePathname();
  const { data: cfg } = useConfig();
  const [more, setMore] = React.useState(false);
  const all = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];
  const primary = all.filter((i) => PRIMARY.includes(i.href));
  const rest = all.filter((i) => !PRIMARY.includes(i.href));
  const inboxOpen = pathname.startsWith("/inbox");

  return (
    <>
      <nav
        aria-label="Primary"
        className={cn(
          "fixed inset-x-0 bottom-3 z-30 mx-auto flex w-max max-w-[calc(100vw-24px)] items-center gap-1 rounded-full bg-surface/90 p-1.5 shadow-pop backdrop-blur-xl hairline md:hidden",
          inboxOpen && "hidden",
        )}
      >
        {primary.map((it) => {
          const active = isActive(pathname, it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-label={it.label}
              aria-current={active ? "page" : undefined}
              className={cn("relative grid size-12 place-items-center rounded-full transition-colors duration-300", active ? "bg-ink text-bg" : "text-ink-3")}
            >
              <Icon size={21} weight={active ? "regular" : "light"} />
              {it.badge === "unread" && (cfg?.unread ?? 0) > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent-bright ring-2 ring-surface" />}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} aria-label="More" className="grid size-12 place-items-center rounded-full text-ink-3">
          <DotsThreeOutline size={21} weight="fill" />
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore} title="Menu" width={360}>
        <div className="grid gap-1">
          {rest.map((it) => (
            <Link key={it.href} href={it.href} onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] hover:bg-ink/[0.05]">
              <it.icon size={20} /> {it.label}
            </Link>
          ))}
        </div>
      </Sheet>
    </>
  );
}
