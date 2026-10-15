import { api } from "@/lib/server/http";
import { listTags } from "@/lib/server/services/contacts";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => listTags(ctx.db));
