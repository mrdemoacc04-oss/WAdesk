/**
 * Where to send someone after they sign in. Only same-site paths are honoured, so a crafted
 * `/login?next=https://evil.example` link can't turn the login page into an open redirect.
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  // must be a single-slash absolute path: no scheme, no protocol-relative "//host", no "/\host", no control characters
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  return raw;
}
