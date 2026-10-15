import type { AudienceSpec, VarSource } from "@/lib/shared/types";

export interface DraftState {
  name: string;
  template_id: string | null;
  audience: AudienceSpec;
  variable_map: Record<string, VarSource>;
  media_map: Record<string, string>;
  scheduled_at: string | null;
  throttle_per_min: number;
}

export type SendMode = "now" | "schedule";

export const STEPS = [
  { id: "details", label: "Details", hint: "Name your campaign" },
  { id: "audience", label: "Audience", hint: "Who gets it" },
  { id: "message", label: "Message", hint: "Template and values" },
  { id: "schedule", label: "Schedule", hint: "When and how fast" },
  { id: "review", label: "Review", hint: "Check and send" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export const stepIndex = (id: string | null | undefined) => {
  const i = STEPS.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
};
