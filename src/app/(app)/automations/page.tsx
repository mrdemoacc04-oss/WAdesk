import { Suspense } from "react";
import type { Metadata } from "next";
import { AutomationsPage } from "@/components/automations/automations-page";
import { Skeleton } from "@/components/ui/display";

export const metadata: Metadata = { title: "Automations" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-[26px]" />}>
      <AutomationsPage />
    </Suspense>
  );
}
