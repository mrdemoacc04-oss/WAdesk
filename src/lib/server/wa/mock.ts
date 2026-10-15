import type { Interactive, TemplateCategory } from "@/lib/shared/types";
import { randomToken } from "@/lib/shared/utils";
import type { Db } from "../db/scoped";
import type { MediaKind, MetaTemplate, PhoneInfo, Provider } from "./types";
import { scheduleSim, type SimHint } from "./sim-schedule";

/** Stand-in for Meta used when no live credentials are connected (local demo mode). */
export class MockProvider implements Provider {
  readonly mode = "mock" as const;
  constructor(private db: Db) {}

  private async accept(to: string, hint: SimHint) {
    const id = `wamid.MOCK${randomToken(24).toUpperCase()}`;
    await scheduleSim(this.db, id, to, hint);
    return { id };
  }

  sendText(to: string, body: string, opts?: { auto?: boolean }) {
    return this.accept(to, { kind: "text", text: body, replyChance: opts?.auto ? 0.12 : undefined });
  }
  sendMedia(to: string, m: { kind: MediaKind; caption?: string }) {
    return this.accept(to, { kind: "media", text: m.caption });
  }
  sendInteractive(to: string, i: Interactive, opts?: { auto?: boolean }) {
    return this.accept(to, {
      kind: "interactive",
      replyChance: opts?.auto ? 0.35 : undefined,
      text: i.body,
      buttons: i.kind === "buttons" ? i.buttons : i.kind === "list" ? i.sections.flatMap((s) => s.rows.map((r) => ({ id: r.id, title: r.title }))) : undefined,
    });
  }
  sendTemplate(to: string, t: { name: string; language: string; components: any[]; sim?: { replies: { payload: string; text: string }[] } }) {
    return this.accept(to, { kind: "template", replies: t.sim?.replies });
  }
  async markRead() {}
  async uploadMedia(_d: Buffer, _m: string, filename: string) {
    return { id: `mock-media-${randomToken(10)}-${filename}` };
  }
  async downloadMedia(): Promise<{ data: ArrayBuffer; mime: string }> {
    throw new Error("Mock provider has no remote media");
  }
  async phoneInfo(): Promise<PhoneInfo> {
    return {
      display_phone_number: "+91 80000 12345",
      verified_name: "Demo Business",
      quality_rating: "GREEN",
      messaging_limit_tier: "TIER_10K",
      throughput: "STANDARD",
      platform_type: "CLOUD_API",
    };
  }
  async listTemplates(): Promise<MetaTemplate[]> {
    return [];
  }
  async createTemplate(_p: { name: string; language: string; category: TemplateCategory; components: any[] }) {
    return { id: `mock-tpl-${randomToken(12)}`, status: "PENDING" };
  }
  async deleteTemplate() {}
  async uploadTemplateSample(_d: Buffer, _m: string, filename: string) {
    return `mock-handle:${filename}`;
  }
  async subscribeWebhooks() {}
}
