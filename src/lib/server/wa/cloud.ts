import type { Interactive, TemplateCategory } from "@/lib/shared/types";
import { sleep } from "@/lib/shared/utils";
import { toWaId } from "@/lib/shared/phone";
import { graphVersion } from "../env";
import { WaError } from "./errors";
import type { MediaKind, MetaTemplate, PhoneInfo, Provider } from "./types";

const BASE = "https://graph.facebook.com";
const TRANSIENT = new Set(["1", "2", "4", "17", "131000", "131016", "130429", "80007"]);

export interface CloudConfig {
  phoneNumberId: string;
  wabaId: string;
  token: string;
  appId?: string | null;
}

type CallOpts = {
  json?: unknown;
  query?: Record<string, string | number | undefined>;
  form?: FormData;
  headers?: Record<string, string>;
  body?: BodyInit;
  retries?: number;
  absolute?: boolean;
};

export class CloudProvider implements Provider {
  readonly mode = "live" as const;
  constructor(private cfg: CloudConfig) {}

  private url(path: string, query?: CallOpts["query"]) {
    const u = new URL(path.startsWith("http") ? path : `${BASE}/${graphVersion}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    return u;
  }

  private async call<T = any>(method: string, path: string, o: CallOpts = {}): Promise<T> {
    const retries = o.retries ?? 2;
    let lastErr: WaError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res: Response;
      try {
        res = await fetch(this.url(path, o.query), {
          method,
          headers: {
            Authorization: `Bearer ${this.cfg.token}`,
            ...(o.json ? { "Content-Type": "application/json" } : {}),
            ...o.headers,
          },
          body: o.form ?? o.body ?? (o.json ? JSON.stringify(o.json) : undefined),
          cache: "no-store",
        });
      } catch (e) {
        lastErr = new WaError("NETWORK", e instanceof Error ? e.message : "Network error", 0);
        await sleep(400 * 2 ** attempt);
        continue;
      }
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      if (res.ok) return data as T;
      const err = data?.error ?? {};
      const code = String(err.code ?? res.status);
      const details = err.error_data?.details ?? err.error_user_msg ?? err.error_user_title;
      lastErr = new WaError(code, err.message ?? `HTTP ${res.status}`, res.status, details);
      const transient = TRANSIENT.has(code) || res.status >= 500 || res.status === 429;
      if (!transient || attempt === retries) break;
      await sleep(500 * 2 ** attempt);
    }
    throw lastErr ?? new WaError("0", "Request failed");
  }

  private send(payload: Record<string, unknown>) {
    return this.call<{ messages: { id: string }[] }>("POST", `${this.cfg.phoneNumberId}/messages`, {
      json: { messaging_product: "whatsapp", recipient_type: "individual", ...payload },
    }).then((r) => ({ id: r.messages[0].id }));
  }

  sendText(to: string, body: string, opts: { replyTo?: string; previewUrl?: boolean } = {}) {
    return this.send({
      to: toWaId(to),
      type: "text",
      text: { body, preview_url: opts.previewUrl ?? true },
      ...(opts.replyTo ? { context: { message_id: opts.replyTo } } : {}),
    });
  }

  sendMedia(to: string, m: { kind: MediaKind; link?: string; id?: string; caption?: string; filename?: string }) {
    const media: Record<string, string> = m.id ? { id: m.id } : { link: m.link! };
    if (m.caption && m.kind !== "audio") media.caption = m.caption;
    if (m.filename && m.kind === "document") media.filename = m.filename;
    return this.send({ to: toWaId(to), type: m.kind, [m.kind]: media });
  }

  sendInteractive(to: string, i: Interactive) {
    const header = "header" in i && i.header
      ? i.header.type === "text"
        ? { type: "text", text: i.header.text }
        : { type: i.header.type, [i.header.type]: { link: i.header.link } }
      : undefined;
    const footer = "footer" in i && i.footer ? { text: i.footer } : undefined;
    let interactive: Record<string, unknown>;
    if (i.kind === "buttons") {
      interactive = {
        type: "button",
        ...(header ? { header } : {}),
        body: { text: i.body },
        ...(footer ? { footer } : {}),
        action: { buttons: i.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
      };
    } else if (i.kind === "list") {
      interactive = {
        type: "list",
        body: { text: i.body },
        ...(footer ? { footer } : {}),
        action: {
          button: i.button,
          sections: i.sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })),
          })),
        },
      };
    } else {
      interactive = {
        type: "cta_url",
        ...(header ? { header } : {}),
        body: { text: i.body },
        ...(footer ? { footer } : {}),
        action: { name: "cta_url", parameters: { display_text: i.display_text, url: i.url } },
      };
    }
    return this.send({ to: toWaId(to), type: "interactive", interactive });
  }

  sendTemplate(to: string, t: { name: string; language: string; components: any[] }) {
    return this.send({
      to: toWaId(to),
      type: "template",
      template: { name: t.name, language: { code: t.language }, ...(t.components.length ? { components: t.components } : {}) },
    });
  }

  async markRead(wamid: string) {
    await this.call("POST", `${this.cfg.phoneNumberId}/messages`, {
      json: { messaging_product: "whatsapp", status: "read", message_id: wamid },
      retries: 0,
    });
  }

  async uploadMedia(data: Buffer, mime: string, filename: string) {
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", mime);
    form.set("file", new Blob([new Uint8Array(data)], { type: mime }), filename);
    const r = await this.call<{ id: string }>("POST", `${this.cfg.phoneNumberId}/media`, { form });
    return { id: r.id };
  }

  async downloadMedia(id: string) {
    const meta = await this.call<{ url: string; mime_type: string }>("GET", id, { query: { phone_number_id: this.cfg.phoneNumberId } });
    const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${this.cfg.token}` }, cache: "no-store" });
    if (!res.ok) throw new WaError("131052", `Media download failed (${res.status})`, res.status);
    return { data: await res.arrayBuffer(), mime: meta.mime_type };
  }

  async phoneInfo(): Promise<PhoneInfo> {
    const r = await this.call<any>("GET", this.cfg.phoneNumberId, {
      query: { fields: "display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,platform_type" },
      retries: 0,
    });
    return {
      display_phone_number: r.display_phone_number ?? null,
      verified_name: r.verified_name ?? null,
      quality_rating: (r.quality_rating as PhoneInfo["quality_rating"]) ?? "UNKNOWN",
      messaging_limit_tier: r.messaging_limit_tier ?? null,
      throughput: r.throughput?.level ?? null,
      platform_type: r.platform_type ?? null,
    };
  }

  async listTemplates(): Promise<MetaTemplate[]> {
    const out: MetaTemplate[] = [];
    let next: string | null = `${this.cfg.wabaId}/message_templates`;
    let query: CallOpts["query"] | undefined = {
      limit: 100,
      fields: "id,name,language,status,category,components,rejected_reason,quality_score",
    };
    let guard = 0;
    while (next && guard++ < 30) {
      const r: any = await this.call("GET", next, { query });
      out.push(...(r.data ?? []));
      next = r.paging?.next ?? null;
      query = undefined; // `next` is an absolute URL carrying its own cursor
    }
    return out;
  }

  async createTemplate(p: { name: string; language: string; category: TemplateCategory; components: any[] }) {
    const r = await this.call<{ id: string; status: string }>("POST", `${this.cfg.wabaId}/message_templates`, {
      json: { name: p.name, language: p.language, category: p.category, components: p.components },
      retries: 0,
    });
    return { id: r.id, status: r.status };
  }

  async deleteTemplate(name: string) {
    await this.call("DELETE", `${this.cfg.wabaId}/message_templates`, { query: { name }, retries: 0 });
  }

  async uploadTemplateSample(data: Buffer, mime: string, filename: string) {
    if (!this.cfg.appId) throw new WaError("APP_ID", "Add your Meta App ID in Settings → WhatsApp to upload template media.", 400);
    const session = await this.call<{ id: string }>("POST", `${this.cfg.appId}/uploads`, {
      query: { file_name: filename, file_length: data.byteLength, file_type: mime },
      retries: 0,
    });
    const r = await this.call<{ h: string }>("POST", session.id, {
      headers: { Authorization: `OAuth ${this.cfg.token}`, file_offset: "0", "Content-Type": "application/octet-stream" },
      body: new Uint8Array(data),
      retries: 0,
    });
    return r.h;
  }

  async subscribeWebhooks() {
    await this.call("POST", `${this.cfg.wabaId}/subscribed_apps`, { retries: 0 });
  }
}
