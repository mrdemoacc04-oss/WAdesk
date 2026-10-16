import { api } from "@/lib/server/http";
import { mode } from "@/lib/server/env";
import { appName } from "@/lib/server/env";
import { getAccount, getWorkspace, listMembers } from "@/lib/server/services/workspace";
import { unreadCount } from "@/lib/server/services/inbox";
import { providerMode } from "@/lib/server/wa";
import type { AppConfig } from "@/lib/shared/types";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx): Promise<AppConfig> => {
  const [ws, account, members, unread, pm] = await Promise.all([
    getWorkspace(ctx.db),
    getAccount(ctx.db),
    listMembers(ctx.db),
    unreadCount(ctx.db),
    providerMode(ctx.ws),
  ]);
  return {
    mode: mode(),
    appName,
    // Report the truth: only the local demo simulates messages. A real workspace with no number connected is "none".
    providerMode: pm,
    user: ctx.user,
    workspace: { id: ws.id, name: ws.name, settings: ws.settings },
    account,
    members,
    unread,
  };
});
