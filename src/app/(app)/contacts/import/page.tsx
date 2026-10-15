import type { Metadata } from "next";
import { ImportWizard } from "@/components/contacts/import/wizard";

export const metadata: Metadata = { title: "Import contacts" };

export default function Page() {
  return <ImportWizard />;
}
