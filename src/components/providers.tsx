"use client";
import * as React from "react";
import { SWRConfig } from "swr";
import { IconContext } from "@phosphor-icons/react";
import { Tooltip } from "radix-ui";
import { Toaster } from "sonner";
import { ThemeProvider } from "./theme";
import { ConfirmProvider } from "./confirm";
import { fetcher } from "@/lib/client/api";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 1500 }}>
        <IconContext.Provider value={{ weight: "light", size: 18 }}>
          <Tooltip.Provider delayDuration={250} skipDelayDuration={200}>
            <ConfirmProvider>
              {children}
              <Toaster
                position="bottom-right"
                gap={10}
                toastOptions={{
                  unstyled: true,
                  classNames: {
                    toast:
                      "flex w-[356px] max-w-[calc(100vw-24px)] items-start gap-3 rounded-2xl bg-surface p-4 text-sm text-ink shadow-pop hairline",
                    title: "font-medium",
                    description: "text-ink-3",
                    success: "[&_[data-icon]]:text-accent",
                    error: "[&_[data-icon]]:text-danger",
                    actionButton: "rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-bg",
                  },
                }}
              />
            </ConfirmProvider>
          </Tooltip.Provider>
        </IconContext.Provider>
      </SWRConfig>
    </ThemeProvider>
  );
}
