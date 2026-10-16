"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Desktop, Gear, MagnifyingGlass, Moon, SignOut, Sun } from "@phosphor-icons/react";
import { Avatar, Kbd } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useTheme } from "@/components/theme";
import { useConfig } from "@/lib/client/hooks";
import { Wordmark } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/shared/utils";

export function Topbar({ onSearch }: { onSearch: () => void }) {
  const { data: cfg } = useConfig();
  const { theme, setTheme, resolved } = useTheme();
  const router = useRouter();

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-5 md:px-9">
      <div className="md:hidden">
        <Wordmark name={cfg?.appName} />
      </div>
      <button
        onClick={onSearch}
        className="group hidden h-10 w-full max-w-[380px] items-center gap-2.5 rounded-full bg-surface-2 px-4 text-sm text-ink-3 hairline outline-none transition-colors duration-300 hover:bg-surface-3/70 focus-visible:ring-2 focus-visible:ring-accent/60 md:flex"
      >
        <MagnifyingGlass size={16} />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="flex items-center gap-1.5">
        <button onClick={onSearch} aria-label="Search" className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/[0.06] md:hidden">
          <MagnifyingGlass size={19} />
        </button>
        {cfg?.providerMode === "mock" && (
          <span className="mr-1 hidden h-8 items-center gap-2 rounded-full bg-info-soft px-3 text-xs font-medium text-info lg:inline-flex">
            <span className="size-1.5 rounded-full bg-info" />
            Demo mode · messages are simulated
          </span>
        )}
        {cfg?.providerMode === "none" && (
          <Link href="/settings" className="mr-1 hidden h-8 items-center gap-2 rounded-full bg-warn-soft px-3 text-xs font-medium text-warn outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent/60 lg:inline-flex">
            <span className="size-1.5 rounded-full bg-warn" />
            WhatsApp not connected · connect to start sending
          </Link>
        )}
        <button
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
          aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/[0.06]"
        >
          {resolved === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button aria-label="Account" className="rounded-full outline-none ring-offset-2 ring-offset-surface transition-shadow focus-visible:ring-2 focus-visible:ring-accent/60">
              <Avatar name={cfg?.user.name ?? "…"} size={36} />
            </button>
          </MenuTrigger>
          <MenuContent>
            <div className="px-2.5 pb-2 pt-1.5">
              <p className="text-sm font-medium">{cfg?.user.name}</p>
              <p className="text-xs text-ink-3">{cfg?.user.email}</p>
            </div>
            <MenuSeparator />
            <MenuItem icon={<Gear size={17} />} onSelect={() => router.push("/settings")}>
              Settings
            </MenuItem>
            <MenuLabel>Theme</MenuLabel>
            {([
              ["light", "Light", <Sun key="s" size={17} />],
              ["dark", "Dark", <Moon key="m" size={17} />],
              ["system", "System", <Desktop key="d" size={17} />],
            ] as const).map(([v, label, icon]) => (
              <MenuItem key={v} icon={icon} onSelect={() => setTheme(v)} className={cn(theme === v && "font-medium")}>
                {label}
                {theme === v && <span className="ml-auto size-1.5 rounded-full bg-accent" />}
              </MenuItem>
            ))}
            {cfg?.mode === "supabase" && (
              <>
                <MenuSeparator />
                <MenuItem icon={<SignOut size={17} />} onSelect={signOut}>
                  Sign out
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}
