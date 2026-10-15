import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";
import { Skeleton } from "@/components/ui/display";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-[26px]" />}>
      <SettingsPage />
    </Suspense>
  );
}
