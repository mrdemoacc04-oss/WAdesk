import type { Metadata } from "next";
import { TemplateList } from "@/components/templates/template-list";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return <TemplateList />;
}
