"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/shared/safe-next";

/**
 * Where the links in Supabase emails land (signup confirmation, password reset, team invites).
 * Handles every flavour: a PKCE `?code=`, invite tokens in the `#fragment`, and error links.
 */
export default function Page() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const url = new URL(location.href);
      const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      const next = safeNext(url.searchParams.get("next"));

      const problem = url.searchParams.get("error_description") ?? hash.get("error_description");
      if (problem) return setError(problem.replace(/\+/g, " "));

      // 1) the client may already have completed the sign-in on load (PKCE code → session)
      let session = (await sb.auth.getSession()).data.session;
      // 2) invite links carry their tokens in the URL fragment
      const at = hash.get("access_token");
      const rt = hash.get("refresh_token");
      if (!session && at && rt) {
        await sb.auth.setSession({ access_token: at, refresh_token: rt });
        session = (await sb.auth.getSession()).data.session;
      }
      // 3) otherwise exchange the code ourselves
      const code = url.searchParams.get("code");
      if (!session && code) {
        await sb.auth.exchangeCodeForSession(code);
        session = (await sb.auth.getSession()).data.session;
      }

      if (cancelled) return;
      if (!session) return setError("This link is invalid, has expired, or was opened in a different browser.");
      router.replace(next);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="grain relative grid min-h-dvh place-items-center px-5">
      <div className="relative z-[2] flex max-w-md flex-col items-center text-center">
        <LogoMark size={44} />
        {error ? (
          <>
            <h1 className="mt-8 text-2xl font-medium tracking-tight">We couldn&apos;t sign you in</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{error}</p>
            <p className="mt-2 text-sm text-ink-3">If you just confirmed your email, your account is ready — try signing in.</p>
            <Link href="/login" className="mt-6 text-sm font-medium text-ink underline underline-offset-4">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-8 text-2xl font-medium tracking-tight">Signing you in…</h1>
            <p className="mt-2 text-[15px] text-ink-3">One moment.</p>
          </>
        )}
      </div>
    </div>
  );
}
