import { Suspense } from "react";
import type { Metadata } from "next";
import { InboxWorkspace } from "@/components/inbox/workspace";
import { InboxFallback } from "@/components/inbox/fallback";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxFallback />}>
      <InboxWorkspace />
    </Suspense>
  );
}
