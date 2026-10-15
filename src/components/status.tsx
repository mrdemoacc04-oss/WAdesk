import { Badge } from "@/components/ui/display";
import type { CampaignStatus, OptIn, TemplateCategory, TemplateStatus } from "@/lib/shared/types";

const CAMPAIGN: Record<CampaignStatus, { label: string; tone: "neutral" | "accent" | "warn" | "danger" | "info" | "violet" }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "accent" },
  paused: { label: "Paused", tone: "warn" },
  completed: { label: "Completed", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = CAMPAIGN[status];
  return (
    <Badge tone={s.tone} dot className={status === "sending" ? "[&>span:first-child]:animate-pulse-ring" : ""}>
      {s.label}
    </Badge>
  );
}

const TEMPLATE: Record<TemplateStatus, { label: string; tone: "neutral" | "accent" | "warn" | "danger" | "info" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING: { label: "In review", tone: "warn" },
  APPROVED: { label: "Approved", tone: "accent" },
  REJECTED: { label: "Rejected", tone: "danger" },
  PAUSED: { label: "Paused", tone: "warn" },
  DISABLED: { label: "Disabled", tone: "danger" },
};

export function TemplateStatusBadge({ status }: { status: TemplateStatus }) {
  const s = TEMPLATE[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: TemplateCategory }) {
  const label = { MARKETING: "Marketing", UTILITY: "Utility", AUTHENTICATION: "Authentication" }[category];
  const tone = category === "MARKETING" ? "violet" : category === "UTILITY" ? "info" : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

export function OptInBadge({ status }: { status: OptIn }) {
  if (status === "opted_in") return <Badge tone="accent" dot>Opted in</Badge>;
  if (status === "opted_out") return <Badge tone="danger" dot>Opted out</Badge>;
  return <Badge tone="warn" dot>Unconfirmed</Badge>;
}
