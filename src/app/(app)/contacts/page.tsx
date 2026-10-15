import { Suspense } from "react";
import type { Metadata } from "next";
import { ContactsView } from "@/components/contacts/contacts-view";
import { ContactsSkeleton } from "@/components/contacts/contacts-skeleton";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <ContactsView />
    </Suspense>
  );
}
