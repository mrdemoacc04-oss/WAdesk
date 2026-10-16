import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { mode, setupProblem } from "@/lib/server/env";
import { safeNext } from "@/lib/shared/safe-next";

/* Next 16 "proxy" (formerly middleware): keeps the Supabase session fresh and gates every app page.
   It fails CLOSED: a deployment that is missing its Supabase variables shows a setup page (503) —
   it never falls back to an open, unauthenticated app. Local development (demo mode) is the only exception. */

const GUEST_ONLY = ["/login", "/signup", "/forgot-password"]; // signed-in people are sent on to the app
const OPEN = ["/auth", "/setup-required"]; // email-link landing (it signs people in) and the setup page itself

const under = (path: string, bases: string[]) => bases.some((p) => path === p || path.startsWith(p + "/"));

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api");

  // Deployment self-check stays reachable so a broken deployment can be diagnosed.
  if (path === "/api/health") return NextResponse.next();

  const problem = setupProblem();
  if (problem) {
    if (isApi) {
      return NextResponse.json(
        { error: { code: "NOT_CONFIGURED", message: "This deployment isn't configured yet.", details: { missing: problem.missing } } },
        { status: 503 },
      );
    }
    if (path === "/setup-required") return NextResponse.next();
    return NextResponse.rewrite(new URL("/setup-required", req.url), { status: 503 });
  }

  // Local demo mode (development only — setupProblem() above rejects it anywhere else).
  if (mode() === "local") return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const guestOnly = under(path, GUEST_ONLY);
  const open = under(path, OPEN);

  if (!user && !isApi && !guestOnly && !open) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    const back = safeNext(path + req.nextUrl.search, "/");
    if (back !== "/") to.searchParams.set("next", back);
    return NextResponse.redirect(to);
  }
  if (user && guestOnly) {
    // safeNext() only returns same-site paths, so resolving against our own origin can't leave the site
    return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next"), "/"), req.url));
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|demo/|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"],
};
