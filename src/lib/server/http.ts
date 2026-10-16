import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getCtx, type Ctx } from "./context";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, "NOT_FOUND", what);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, "BAD_REQUEST", message, details);
export const forbidden = (message = "You don't have access to this") => new HttpError(403, "FORBIDDEN", message);

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return NextResponse.json(
      { error: { code: "VALIDATION", message: `${where}${first?.message ?? "Invalid input"}`, details: e.issues } },
      { status: 422 },
    );
  }
  console.error("[api]", e);
  // Don't echo database / library internals to the browser in production — they stay in the server log.
  const message = process.env.NODE_ENV === "production" ? "Something went wrong on our side. Please try again." : e instanceof Error ? e.message : "Unexpected error";
  return NextResponse.json({ error: { code: "INTERNAL", message } }, { status: 500 });
}

type Params = Record<string, string | string[]>;

/** Wrap a route handler with auth, JSON serialisation and uniform errors. */
export function api<P extends Params = Params>(
  fn: (ctx: Ctx, req: NextRequest, params: P) => Promise<unknown>,
  opts: { minRole?: "agent" | "admin" | "owner" } = {},
) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    try {
      const ctx = await getCtx();
      if (opts.minRole) {
        const rank = { agent: 0, admin: 1, owner: 2 } as const;
        if (rank[ctx.user.role] < rank[opts.minRole]) throw forbidden("Only admins can do this");
      }
      const out = await fn(ctx, req, (await route.params) ?? ({} as P));
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  return schema.parse(raw);
}

export function query(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return {
    str: (k: string) => sp.get(k) ?? undefined,
    num: (k: string, d?: number) => {
      const v = sp.get(k);
      return v === null || v === "" || Number.isNaN(Number(v)) ? d : Number(v);
    },
    list: (k: string) => (sp.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    bool: (k: string) => sp.get(k) === "1" || sp.get(k) === "true",
  };
}
