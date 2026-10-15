import type { Metadata } from "next";
import { TemplateBuilder } from "@/components/templates/builder";

export const metadata: Metadata = { title: "New template" };

export default function NewTemplatePage() {
  return <TemplateBuilder />;
}
