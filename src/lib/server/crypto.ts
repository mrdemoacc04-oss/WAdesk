import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { mode } from "./env";

/* AES-256-GCM for secrets at rest (Meta access token, app secret). */

function keyMaterial(): Buffer {
  const k = process.env.APP_ENCRYPTION_KEY;
  if (k && k.length >= 16) return crypto.createHash("sha256").update(k).digest();
  if (mode() === "supabase") {
    // Stable per-project fallback so deploys work out of the box; set APP_ENCRYPTION_KEY to own the key.
    const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!fallback) throw new Error("Set APP_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) to store credentials.");
    return crypto.createHash("sha256").update("wadesk:" + fallback).digest();
  }
  const f = path.join(process.cwd(), ".data", ".key");
  try {
    return Buffer.from(fs.readFileSync(f, "utf8"), "hex");
  } catch {
    const fresh = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, fresh.toString("hex"), { mode: 0o600 });
    return fresh;
  }
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1") throw new Error("Unknown ciphertext format");
  const d = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
