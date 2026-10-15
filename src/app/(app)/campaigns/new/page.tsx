import type { Metadata } from "next";
import { CampaignWizard } from "@/components/campaigns/wizard/wizard";

export const metadata: Metadata = { title: "New campaign" };

export default function Page() {
  return <CampaignWizard />;
}
