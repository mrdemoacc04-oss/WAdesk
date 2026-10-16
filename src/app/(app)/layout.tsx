import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { NoWorkspace } from "@/components/shell/no-workspace";
import { getCtx } from "@/lib/server/context";
import { mode } from "@/lib/server/env";
import { HttpError } from "@/lib/server/http";

/** The proxy already bounces signed-out visitors; this re-checks on the server so no page renders without a session
    even if the proxy matcher ever changes (the proxy is a convenience layer, not the security boundary). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (mode() === "supabase") {
    try {
      await getCtx();
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) redirect("/login");
      if (e instanceof HttpError && e.code === "NO_WORKSPACE") return <NoWorkspace />;
      throw e;
    }
  }
  return <AppShell>{children}</AppShell>;
}
