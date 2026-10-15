import { NextResponse } from "next/server";
import { api, HttpError } from "@/lib/server/http";
import { ensureSeeded } from "@/lib/server/context";
import { mode } from "@/lib/server/env";
import { resetLocalStore } from "@/lib/server/db/local";

export const POST = api(async () => {
  if (mode() !== "local") throw new HttpError(404, "NOT_FOUND", "Demo tools are only available in local mode");
  resetLocalStore();
  ensureSeeded();
  return NextResponse.json({ ok: true });
});
