/* Domain types shared by server, API and UI. Column names match the Postgres schema 1:1. */

export type Id = string;
export type Iso = string;

/* ───────── Workspace ───────── */

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface BusinessHours {
  enabled: boolean;
  timezone: string;
  days: Record<DayKey, { enabled: boolean; open: string; close: string }>;
}

export interface WorkspaceSettings {
  business_hours: BusinessHours;
  rates: { currency: string; marketing: number; utility: number; authentication: number };
  compliance: {
    optout_keywords: string[];
    optin_keywords: string[];
    optout_reply: string;
    optin_reply: string;
    optout_footer: boolean;
  };
  default_country: string;
  /** demo mode only: let the simulator send occasional inbound messages */
  sim_ambient?: boolean;
}

export interface Workspace {
  id: Id;
  name: string;
  settings: WorkspaceSettings;
  created_at: Iso;
}

export type Role = "owner" | "admin" | "agent";

export interface Member {
  id: Id;
  workspace_id: Id;
  user_id: Id;
  role: Role;
  name: string;
  email: string;
  color: string;
  created_at: Iso;
}

/* ───────── WhatsApp connection ───────── */

export interface WaAccount {
  id: Id;
  workspace_id: Id;
  phone_number_id: string;
  waba_id: string;
  app_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | null;
  messaging_limit_tier: string | null;
  status: "connected" | "error" | "disconnected";
  status_message: string | null;
  webhook_verify_token: string;
  has_token: boolean;
  has_app_secret: boolean;
  last_checked_at: Iso | null;
  created_at: Iso;
}

/* ───────── Contacts ───────── */

export type OptIn = "opted_in" | "opted_out" | "pending";
export type ContactSource = "manual" | "import" | "inbound" | "api" | "link" | "demo";

export interface Contact {
  id: Id;
  workspace_id: Id;
  phone: string; // E.164, always with leading +
  name: string | null;
  email: string | null;
  country: string | null; // ISO-3166 alpha-2
  tags: string[];
  attributes: Record<string, string>;
  opt_in: OptIn;
  opt_in_source: string | null;
  opted_in_at: Iso | null;
  opted_out_at: Iso | null;
  source: ContactSource;
  notes: string | null;
  last_inbound_at: Iso | null;
  last_outbound_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

export type SegmentField =
  | "tag"
  | "opt_in"
  | "country"
  | "source"
  | "attribute"
  | "created_at"
  | "last_inbound_at"
  | "name"
  | "phone";
export type SegmentOp =
  | "is"
  | "is_not"
  | "contains"
  | "has"
  | "has_not"
  | "before"
  | "after"
  | "exists"
  | "not_exists";

export interface SegmentRule {
  field: SegmentField;
  key?: string; // attribute name
  op: SegmentOp;
  value: string;
}

export interface Segment {
  id: Id;
  workspace_id: Id;
  name: string;
  match: "all" | "any";
  rules: SegmentRule[];
  created_at: Iso;
  /** hydrated by the API */
  count?: number;
}

export interface Tag {
  id: Id;
  workspace_id: Id;
  name: string;
  created_at: Iso;
}

/* ───────── Templates ───────── */

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
export type MediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";

export type TemplateHeader =
  | { format: "TEXT"; text: string; example?: string }
  | { format: MediaFormat; media_url?: string; handle?: string; filename?: string };

export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string; example?: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  | { type: "COPY_CODE"; example: string };

export interface CarouselCard {
  media_format: "IMAGE" | "VIDEO";
  media_url?: string;
  handle?: string;
  body: string;
  body_examples: string[];
  buttons: TemplateButton[];
}

export interface TemplateContent {
  header?: TemplateHeader | null;
  body: string;
  body_examples: string[];
  footer?: string | null;
  buttons: TemplateButton[];
  cards?: CarouselCard[];
}

export interface Template {
  id: Id;
  workspace_id: Id;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  kind: "standard" | "carousel";
  content: TemplateContent;
  rejection_reason: string | null;
  meta_template_id: string | null;
  quality: string | null;
  submitted_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
}

/* ───────── Campaigns ───────── */

export type CampaignStatus = "draft" | "scheduled" | "sending" | "paused" | "completed" | "failed" | "cancelled";

export interface AudienceSpec {
  mode: "all" | "segment" | "tags" | "contacts" | "retarget";
  segment_id?: Id | null;
  tags?: string[];
  tag_match?: "any" | "all";
  exclude_tags?: string[];
  contact_ids?: Id[];
  source_campaign_id?: Id | null;
  retarget?: "not_read" | "not_delivered" | "failed" | "read_no_reply";
  /** include contacts whose consent is still "pending" */
  include_pending?: boolean;
  /** skip contacts already messaged in the last N days */
  skip_recent_days?: number;
}

export type VarSource =
  | { source: "static"; value: string }
  | { source: "name" | "first_name" | "phone" | "email" | "country"; fallback?: string }
  | { source: "attribute"; key: string; fallback?: string };

export interface Campaign {
  id: Id;
  workspace_id: Id;
  name: string;
  status: CampaignStatus;
  template_id: Id | null;
  template_name: string | null;
  template_language: string | null;
  template_category: TemplateCategory | null;
  template_snapshot: TemplateContent | null;
  audience: AudienceSpec;
  variable_map: Record<string, VarSource>;
  media_map: Record<string, string>; // slot key -> url
  scheduled_at: Iso | null;
  started_at: Iso | null;
  completed_at: Iso | null;
  throttle_per_min: number;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  clicked: number;
  cost_estimate: number;
  last_error: string | null;
  created_by: Id | null;
  created_at: Iso;
  updated_at: Iso;
}

export type CampaignMessageStatus = "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "skipped";

export interface CampaignMessage {
  id: Id;
  workspace_id: Id;
  campaign_id: Id;
  contact_id: Id;
  phone: string;
  contact_name: string | null;
  status: CampaignMessageStatus;
  wa_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  claimed_at: Iso | null;
  sent_at: Iso | null;
  delivered_at: Iso | null;
  read_at: Iso | null;
  replied_at: Iso | null;
  failed_at: Iso | null;
  created_at: Iso;
}

/* ───────── Inbox ───────── */

export interface Conversation {
  id: Id;
  workspace_id: Id;
  contact_id: Id;
  status: "open" | "resolved";
  assigned_to: Id | null;
  unread_count: number;
  last_message_at: Iso | null;
  last_message_preview: string | null;
  last_message_direction: "in" | "out" | null;
  last_message_status: MessageStatus | null;
  last_inbound_at: Iso | null;
  created_at: Iso;
}

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "template"
  | "interactive"
  | "button"
  | "reaction"
  | "note"
  | "system"
  | "unsupported";

export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "received";

export type Interactive =
  | {
      kind: "buttons";
      body: string;
      header?: { type: "text"; text: string } | { type: "image" | "video" | "document"; link: string } | null;
      footer?: string | null;
      buttons: { id: string; title: string }[];
    }
  | {
      kind: "list";
      body: string;
      button: string;
      footer?: string | null;
      sections: { title: string; rows: { id: string; title: string; description?: string }[] }[];
    }
  | {
      kind: "cta_url";
      body: string;
      header?: { type: "text"; text: string } | { type: "image" | "video" | "document"; link: string } | null;
      footer?: string | null;
      display_text: string;
      url: string;
    };

export interface MessagePayload {
  media?: { id?: string; url?: string; mime?: string; filename?: string; caption?: string };
  interactive?: Interactive;
  reply?: { id: string; title: string; kind: "button" | "list" };
  template?: {
    id?: Id;
    name: string;
    language: string;
    /** omitted on bulk sends to keep rows small — look the template up by id */
    content?: TemplateContent;
    values?: Record<string, string>;
    media?: Record<string, string>;
  };
  location?: { lat: number; lng: number; name?: string; address?: string };
  reaction?: { emoji: string; message_id?: string };
  context?: { message_id?: string };
  author?: { id?: Id; name?: string };
}

export interface Message {
  id: Id;
  workspace_id: Id;
  conversation_id: Id;
  contact_id: Id;
  direction: "in" | "out";
  type: MessageType;
  body: string | null;
  payload: MessagePayload;
  status: MessageStatus;
  wa_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  campaign_id: Id | null;
  sent_by: Id | null;
  created_at: Iso;
  sent_at: Iso | null;
  delivered_at: Iso | null;
  read_at: Iso | null;
}

export interface QuickReply {
  id: Id;
  workspace_id: Id;
  shortcut: string;
  body: string;
  created_at: Iso;
}

/* ───────── Automations ───────── */

export type AutomationTrigger =
  | { type: "keyword"; match: "exact" | "contains" | "starts_with"; keywords: string[] }
  | { type: "first_message" }
  | { type: "outside_hours" };

export type AutomationAction =
  | { type: "send_text"; body: string }
  | { type: "send_buttons"; body: string; buttons: { id: string; title: string }[] }
  | { type: "send_template"; template_id: Id }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "assign"; user_id: Id }
  | { type: "opt_out" }
  | { type: "opt_in" };

export interface AutomationRule {
  id: Id;
  workspace_id: Id;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  priority: number;
  triggered_count: number;
  last_triggered_at: Iso | null;
  created_at: Iso;
}

/* ───────── API envelopes ───────── */

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface ConversationListItem extends Conversation {
  contact: Pick<Contact, "id" | "name" | "phone" | "tags" | "opt_in" | "country">;
}

export type CampaignListItem = Campaign;

export interface ProviderMode {
  mode: "mock" | "live";
}

export interface AppConfig {
  mode: "local" | "supabase";
  appName: string;
  /** "mock" = the demo simulator (local development only); "live" = a connected number; "none" = real workspace, nothing connected yet */
  providerMode: "mock" | "live" | "none";
  user: { id: Id; name: string; email: string; role: Role; color: string };
  workspace: { id: Id; name: string; settings: WorkspaceSettings };
  account: WaAccount | null;
  members: Member[];
  unread: number;
}
