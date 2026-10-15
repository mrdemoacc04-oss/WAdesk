import type { Interactive, TemplateCategory } from "@/lib/shared/types";

export interface PhoneInfo {
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  messaging_limit_tier: string | null;
  throughput?: string | null;
  platform_type?: string | null;
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
  rejected_reason?: string | null;
  quality_score?: { score?: string } | null;
}

export type MediaKind = "image" | "video" | "audio" | "document";

export interface Provider {
  readonly mode: "mock" | "live";
  sendText(to: string, body: string, opts?: { replyTo?: string; previewUrl?: boolean; auto?: boolean }): Promise<{ id: string }>;
  sendMedia(
    to: string,
    m: { kind: MediaKind; link?: string; id?: string; caption?: string; filename?: string },
  ): Promise<{ id: string }>;
  sendInteractive(to: string, i: Interactive, opts?: { auto?: boolean }): Promise<{ id: string }>;
  sendTemplate(
    to: string,
    t: { name: string; language: string; components: any[]; sim?: { replies: { payload: string; text: string }[] } },
  ): Promise<{ id: string }>;
  markRead(wamid: string): Promise<void>;
  uploadMedia(data: Buffer, mime: string, filename: string): Promise<{ id: string }>;
  downloadMedia(id: string): Promise<{ data: ArrayBuffer; mime: string }>;
  phoneInfo(): Promise<PhoneInfo>;
  listTemplates(): Promise<MetaTemplate[]>;
  createTemplate(p: { name: string; language: string; category: TemplateCategory; components: any[] }): Promise<{ id: string; status: string }>;
  deleteTemplate(name: string): Promise<void>;
  /** Resumable upload → handle usable as `header_handle` when creating templates. */
  uploadTemplateSample(data: Buffer, mime: string, filename: string): Promise<string>;
  subscribeWebhooks(): Promise<void>;
}
