"use client";
import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { useGlobalShortcuts } from "./shortcuts";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [palette, setPalette] = React.useState(false);
  useGlobalShortcuts();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="grain relative min-h-dvh">
      <Sidebar />
      <div className="relative z-[2] p-3 md:pl-[268px]">
        <main className="bezel">
          <div className="bezel-core min-h-[calc(100dvh-36px)]">
            <Topbar onSearch={() => setPalette(true)} />
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
