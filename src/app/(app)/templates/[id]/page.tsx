import type { Metadata } from "next";
import { TemplateBuilder } from "@/components/templates/builder";

export const metadata: Metadata = { title: "Template" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateBuilder id={id} />;
}
