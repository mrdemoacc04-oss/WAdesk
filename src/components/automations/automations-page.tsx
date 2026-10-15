"use client";
import * as React from "react";
import { Plus } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { TabBar } from "@/components/ui/controls";
import { useTabParam } from "@/components/settings/use-tab-param";
import type { AutomationRule } from "@/lib/shared/types";
import { RulesTab } from "./rules-tab";
import { RuleEditor } from "./rule-editor";
import { HoursTab } from "./hours-tab";
import { ComplianceTab } from "./compliance-tab";
import { QuickRepliesTab } from "./quick-replies-tab";
import type { RuleDraft } from "./rule-utils";

const TABS = ["rules", "hours", "consent", "quick"] as const;
type Tab = (typeof TABS)[number];

interface EditorState {
  id: number;
  rule: AutomationRule | null;
  seed: RuleDraft | null;
}

export function AutomationsPage() {
  const [tab, setTab] = useTabParam<Tab>(TABS, "rules");
  const [editor, setEditor] = React.useState<EditorState | null>(null);
  const [open, setOpen] = React.useState(false);
  const counter = React.useRef(0);

  const show = (rule: AutomationRule | null, seed: RuleDraft | null = null) => {
    setEditor({ id: ++counter.current, rule, seed });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Reply instantly, greet new contacts and tag leads without lifting a finger."
        actions={
          tab === "rules" ? (
            <Button trailing={<Plus size={14} />} onClick={() => show(null)}>
              New rule
            </Button>
          ) : undefined
        }
      />

      <TabBar
        className="mb-7"
        value={tab}
        onValueChange={setTab}
        options={[
          { value: "rules", label: "Auto-replies" },
          { value: "hours", label: "Hours & greetings" },
          { value: "consent", label: "Opt-in & opt-out" },
          { value: "quick", label: "Quick replies" },
        ]}
      />

      {tab === "rules" && <RulesTab onNew={() => show(null)} onEdit={(r) => show(r)} onSeed={(s) => show(null, s)} />}
      {tab === "hours" && <HoursTab />}
      {tab === "consent" && <ComplianceTab />}
      {tab === "quick" && <QuickRepliesTab />}

      {editor && <RuleEditor key={editor.id} open={open} onOpenChange={setOpen} rule={editor.rule} seed={editor.seed} />}
    </div>
  );
}
