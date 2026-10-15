import type { Provider } from "../wa";
import { buildSendComponents, templateSlots } from "@/lib/shared/template";
import type { TemplateContent } from "@/lib/shared/types";
import { loadMediaBytes } from "./templates";

export interface TemplateRef {
  name: string;
  language: string;
  content: TemplateContent;
}

/** Meta must be able to fetch the link; local/relative URLs are uploaded to Meta and sent by id instead. */
export async function resolveMedia(provider: Provider, url: string, cache?: Map<string, string>): Promise<string> {
  if (!url || provider.mode === "mock") return url;
  const publicHttps = /^https:\/\//i.test(url) && !/localhost|127\.0\.0\.1|\.local(:|\/|$)/i.test(url);
  if (publicHttps) return url;
  const hit = cache?.get(url);
  if (hit) return hit;
  const f = await loadMediaBytes(url);
  const { id } = await provider.uploadMedia(f.data, f.mime, f.filename);
  const ref = `id:${id}`;
  cache?.set(url, ref);
  return ref;
}

/** Build components for a template + resolved slot values and send it. */
export async function sendTemplateMessage(
  provider: Provider,
  to: string,
  tpl: TemplateRef,
  values: Record<string, string>,
  payloadPrefix: string,
  mediaCache?: Map<string, string>,
): Promise<{ id: string }> {
  const resolved = { ...values };
  for (const slot of templateSlots(tpl.content)) {
    if (slot.kind !== "media") continue;
    const raw = values[slot.key] || slot.sample;
    resolved[slot.key] = await resolveMedia(provider, raw, mediaCache);
  }
  const components = buildSendComponents(tpl.content, resolved, payloadPrefix);
  const replies = tpl.content.buttons.flatMap((b, i) =>
    b.type === "QUICK_REPLY" ? [{ payload: `${payloadPrefix}:${i}`.slice(0, 256), text: b.text }] : [],
  );
  return provider.sendTemplate(to, { name: tpl.name, language: tpl.language, components, sim: { replies } });
}
