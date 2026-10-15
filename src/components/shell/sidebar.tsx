"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Wordmark } from "@/components/logo";
import { useConfig } from "@/lib/client/hooks";
import { cn, formatPhoneSafe } from "./util";
import { NAV_GROUPS, SETTINGS_ITEM, isActive, type NavItem } from "./nav";
import { Avatar } from "@/components/ui/display";
import { Skeleton } from "@/components/ui/display";

function Item({ item, active, unread }: { item: NavItem; active: boolean; unread: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent/60",
        active ? "font-medium text-ink" : "text-ink-3 hover:text-ink",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-0 rounded-xl bg-surface-2 shadow-[inset_0_0_0_1px_var(--line),0_1px_2px_rgba(20,21,15,0.04)]"
          transition={{ type: "spring", stiffness: 520, damping: 42 }}
        />
      )}
      <Icon size={19} weight={active ? "regular" : "light"} className="relative shrink-0" />
      <span className="relative flex-1">{item.label}</span>
      {item.badge === "unread" && unread > 0 && (
        <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white tabular">{unread > 99 ? "99+" : unread}</span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: cfg } = useConfig();
  const unread = cfg?.unread ?? 0;
  const acct = cfg?.account;
  const mock = cfg?.providerMode === "mock";

  return (
    <aside className="fixed bottom-3 left-3 top-3 z-20 hidden w-[244px] md:block" aria-label="Primary">
      <div className="bezel h-full">
        <div className="bezel-core flex h-full flex-col px-3 pb-3 pt-4">
          <Link href="/" className="mb-5 flex items-center justify-between rounded-xl px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
            <Wordmark name={cfg?.appName} />
          </Link>

          <nav className="flex-1 space-y-5 overflow-y-auto pr-0.5">
            {NAV_GROUPS.map((g) => (
              <div key={g.label}>
                <p className="mb-1.5 px-3 text-xs text-ink-4">{g.label}</p>
                <div className="space-y-0.5">
                  {g.items.map((it) => (
                    <Item key={it.href} item={it} active={isActive(pathname, it.href)} unread={unread} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-3 space-y-2">
            <Item item={SETTINGS_ITEM} active={isActive(pathname, SETTINGS_ITEM.href)} unread={0} />
            <Link href="/settings" className="block rounded-2xl bg-surface-2 p-3 hairline transition-colors duration-300 hover:bg-surface-3/60">
              {!cfg ? (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", mock ? "bg-info" : acct?.status === "connected" ? "bg-accent-bright animate-pulse-ring" : "bg-warn")} />
                    <span className="text-[13px] font-medium">{mock ? "Demo connection" : acct?.status === "connected" ? "WhatsApp live" : "Not connected"}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-3">
                    {mock ? "Messages are simulated" : acct?.display_phone_number ? formatPhoneSafe(acct.display_phone_number) : "Connect your Cloud API"}
                  </p>
                  {!mock && acct?.quality_rating && <p className="mt-0.5 text-xs text-ink-3">Quality · {acct.quality_rating.toLowerCase()}</p>}
                </>
              )}
            </Link>
            {cfg && (
              <div className="flex items-center gap-2.5 px-2 pt-1">
                <Avatar name={cfg.user.name} size={28} />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[13px] font-medium">{cfg.user.name}</p>
                  <p className="truncate text-xs text-ink-3">{cfg.workspace.name}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
