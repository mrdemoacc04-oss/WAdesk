export class WaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: string,
  ) {
    super(message);
    this.name = "WaError";
  }
}

export function asWaError(e: unknown): WaError {
  if (e instanceof WaError) return e;
  return new WaError("0", e instanceof Error ? e.message : "Unknown error", 500);
}
