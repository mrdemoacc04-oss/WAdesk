"use client";
import * as React from "react";
import { PageHeader } from "@/components/ui/display";
import { TabBar } from "@/components/ui/controls";
import { useConfig } from "@/lib/client/hooks";
import { useTabParam } from "./use-tab-param";
import { WhatsappTab } from "./whatsapp-tab";
import { TeamTab } from "./team-tab";
import { WorkspaceTab } from "./workspace-tab";
import { DataTab } from "./data-tab";

const TABS = ["whatsapp", "team", "workspace", "data"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const [tab, setTab] = useTabParam<Tab>(TABS, "whatsapp");
  const { data: cfg } = useConfig();
  const canEdit = cfg ? cfg.user.role !== "agent" : true;

  return (
    <div>
      <PageHeader title="Settings" description="Connect your WhatsApp number, manage your team and set up your workspace." />
      <TabBar
        className="mb-7"
        value={tab}
        onValueChange={setTab}
        options={[
          { value: "whatsapp", label: "WhatsApp" },
          { value: "team", label: "Team" },
          { value: "workspace", label: "Workspace" },
          { value: "data", label: "Data" },
        ]}
      />
      {tab === "whatsapp" && <WhatsappTab canEdit={canEdit} />}
      {tab === "team" && <TeamTab canEdit={canEdit} />}
      {tab === "workspace" && <WorkspaceTab canEdit={canEdit} />}
      {tab === "data" && <DataTab canEdit={canEdit} />}
    </div>
  );
}
