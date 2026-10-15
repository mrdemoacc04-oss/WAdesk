import {
  ChartLineUp,
  ChatCircleDots,
  Gauge,
  Gear,
  Lightning,
  Megaphone,
  QrCode,
  SquaresFour,
  UsersThree,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  badge?: "unread";
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: Gauge },
      { href: "/inbox", label: "Inbox", icon: ChatCircleDots, badge: "unread" },
      { href: "/contacts", label: "Contacts", icon: UsersThree },
    ],
  },
  {
    label: "Messaging",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/templates", label: "Templates", icon: SquaresFour },
      { href: "/automations", label: "Automations", icon: Lightning },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: ChartLineUp },
      { href: "/growth", label: "Links & QR", icon: QrCode },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Gear };

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
