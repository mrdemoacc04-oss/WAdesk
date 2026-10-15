import type { Metadata } from "next";
import { GrowthPage } from "@/components/growth/growth-page";

export const metadata: Metadata = { title: "Links & QR" };

export default function Page() {
  return <GrowthPage />;
}
