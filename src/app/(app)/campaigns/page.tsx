import type { Metadata } from "next";
import { CampaignList } from "@/components/campaigns/campaign-list";

export const metadata: Metadata = { title: "Campaigns" };

export default function Page() {
  return <CampaignList />;
}
