import { api } from "@/lib/server/http";
import { refreshAccount } from "@/lib/server/services/account";

export const maxDuration = 30;

export const POST = api(async (ctx) => refreshAccount(ctx));
