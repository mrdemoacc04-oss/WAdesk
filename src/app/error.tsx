"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grain relative grid min-h-dvh place-items-center px-5">
      <div className="relative z-[2] flex max-w-md flex-col items-center text-center">
        <LogoMark size={44} />
        <h1 className="mt-8 text-2xl font-medium tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{error.message || "An unexpected error occurred."}</p>
        {error.digest && <p className="mt-3 font-mono text-xs text-ink-4">ref {error.digest}</p>}
        <div className="mt-8 flex gap-2">
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
          <Button size="lg" variant="secondary" onClick={() => window.location.assign("/")}>
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
