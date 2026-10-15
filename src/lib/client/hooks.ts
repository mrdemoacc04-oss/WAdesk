"use client";
import useSWR, { type SWRConfiguration } from "swr";
import { fetcher, qs } from "./api";
import type { AnalyticsData, DashboardData } from "@/lib/shared/analytics";
import type {
  AppConfig,
  AutomationRule,
  Campaign,
  CampaignMessage,
  Contact,
  Conversation,
  ConversationListItem,
  Message,
  Page,
  QuickReply,
  Segment,
  Tag,
  Template,
  WaAccount,
} from "@/lib/shared/types";

export function useApi<T = any>(key: string | null, cfg?: SWRConfiguration<T>) {
  return useSWR<T>(key, fetcher, { keepPreviousData: true, revalidateOnFocus: false, ...cfg });
}

export const useConfig = () => useApi<AppConfig>("/api/config", { refreshInterval: 15_000 });

export const useDashboard = (range: number) => useApi<DashboardData>(`/api/dashboard?range=${range}`, { refreshInterval: 10_000 });
export const useAnalytics = (range: number) => useApi<AnalyticsData>(`/api/analytics?range=${range}`);

export type ContactQuery = {
  q?: string;
  tags?: string[];
  tag_mode?: "any" | "all";
  opt_in?: string;
  source?: string;
  segment_id?: string;
  sort?: string;
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};
export const useContacts = (q: ContactQuery) => useApi<Page<Contact>>(`/api/contacts${qs(q)}`);
export const useTags = () => useApi<(Tag & { count: number })[]>("/api/tags");
export const useSegments = () => useApi<Segment[]>("/api/segments");

export type TemplateRow = Template & { usage: { campaigns: number; sent: number; delivered: number; read: number } };
export const useTemplates = (f: { status?: string; category?: string; q?: string } = {}) => useApi<TemplateRow[]>(`/api/templates${qs(f)}`, { refreshInterval: 8_000 });
export const useTemplate = (id: string | null) => useApi<Template>(id ? `/api/templates/${id}` : null);

export const useCampaigns = (f: { status?: string; q?: string; limit?: number; offset?: number } = {}) =>
  useApi<Page<Campaign>>(`/api/campaigns${qs(f)}`, { refreshInterval: 4_000 });

export interface CampaignDetailData {
  campaign: Campaign;
  errors: { code: string; count: number; title: string; hint: string }[];
  timeline: { t: string; sent: number; delivered: number; read: number; replied: number }[];
  queued: number;
  skipped: number;
}
export const useCampaignDetail = (id: string | null, live = false) =>
  useApi<CampaignDetailData>(id ? `/api/campaigns/${id}` : null, { refreshInterval: live ? 2_500 : 0 });
export const useRecipients = (id: string | null, f: { status?: string; q?: string; limit?: number; offset?: number }, live = false) =>
  useApi<Page<CampaignMessage>>(id ? `/api/campaigns/${id}/recipients${qs(f)}` : null, { refreshInterval: live ? 3_000 : 0 });

export const useConversations = (f: { tab?: string; q?: string; limit?: number }) =>
  useApi<Page<ConversationListItem>>(`/api/conversations${qs(f)}`, { refreshInterval: 3_000 });

export interface ConversationBundle {
  conversation: Conversation;
  contact: Contact;
  window_open: boolean;
  window_expires_at: string | null;
}
export const useConversation = (id: string | null) => useApi<ConversationBundle>(id ? `/api/conversations/${id}` : null, { refreshInterval: 5_000 });
export const useMessages = (id: string | null) => useApi<{ messages: Message[]; has_more: boolean }>(id ? `/api/conversations/${id}/messages?limit=80` : null, { refreshInterval: 2_500 });
export const useQuickReplies = () => useApi<QuickReply[]>("/api/quick-replies");
export const useAutomations = () => useApi<AutomationRule[]>("/api/automations");

export interface ConnectionInfo {
  account: WaAccount | null;
  webhook_url: string;
  verify_token: string | null;
}
export const useConnection = () => useApi<ConnectionInfo>("/api/whatsapp/connection");
