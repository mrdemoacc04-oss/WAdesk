import type { Campaign, ConversationListItem, WaAccount } from "./types";

export interface DayPoint {
  date: string; // yyyy-MM-dd (workspace timezone)
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
}

export interface Kpi {
  value: number;
  previous: number;
  spark: number[];
}

export interface DashboardData {
  range: number;
  kpis: { sent: Kpi; delivered_rate: Kpi; read_rate: Kpi; replied: Kpi };
  series: DayPoint[];
  audience: { total: number; opted_in: number; opted_out: number; pending: number; new_week: number };
  active: Campaign[];
  recent: Campaign[];
  templates: { approved: number; pending: number; rejected: number; draft: number };
  unread: number;
  inbox: ConversationListItem[];
  account: WaAccount | null;
  top_templates: { name: string; sent: number; read_rate: number; reply_rate: number }[];
}

export interface AnalyticsData {
  range: number;
  totals: { sent: number; delivered: number; read: number; replied: number; failed: number; cost: number; currency: string };
  series: DayPoint[];
  cost_series: { date: string; cost: number }[];
  growth: { date: string; contacts: number }[];
  by_template: { name: string; sent: number; delivered: number; read: number; replied: number; failed: number }[];
  by_campaign: { id: string; name: string; sent: number; delivered: number; read: number; replied: number }[];
  heatmap: number[][]; // [weekday 0=Mon][hour] = read events
  failures: { code: string; title: string; count: number }[];
}
