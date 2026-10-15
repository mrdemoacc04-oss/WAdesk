"use client";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = any>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
    cache: "no-store",
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
       
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    }
    throw new ApiError(res.status, data?.error?.code ?? "ERROR", data?.error?.message ?? `Request failed (${res.status})`, data?.error?.details);
  }
  return data as T;
}

export const fetcher = <T = any>(url: string) => api<T>(url);

export const post = <T = any>(url: string, body?: unknown) => api<T>(url, { method: "POST", body: body ?? {} });
export const patch = <T = any>(url: string, body: unknown) => api<T>(url, { method: "PATCH", body });
export const del = <T = any>(url: string) => api<T>(url, { method: "DELETE" });

export function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Revalidate every cached SWR key that starts with one of the prefixes. */
export function refresh(...prefixes: string[]) {
  return globalMutate((key) => typeof key === "string" && prefixes.some((p) => key.startsWith(p)), undefined, { revalidate: true });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export function toastError(e: unknown) {
  toast.error(errorMessage(e));
}

/** Run an async action with a loading toast and unified error handling. */
export async function run<T>(fn: () => Promise<T>, msgs: { success?: string; error?: string } = {}): Promise<T | undefined> {
  try {
    const out = await fn();
    if (msgs.success) toast.success(msgs.success);
    return out;
  } catch (e) {
    toast.error(msgs.error ? `${msgs.error}: ${errorMessage(e)}` : errorMessage(e));
    return undefined;
  }
}
