export type DashboardNavigationStatus =
  | "ready"
  | "building";

export type DashboardIconName =
  | "activity"
  | "analytics"
  | "automation"
  | "bot"
  | "brain"
  | "briefcase"
  | "commerce"
  | "dashboard"
  | "finance"
  | "globe"
  | "marketing"
  | "message"
  | "monogram"
  | "palette"
  | "plug"
  | "settings"
  | "sparkles"
  | "store"
  | "users"
  | "workflow";

export type DashboardNavigationItem = {
  id: string;
  label: string;
  description: string;
  icon: DashboardIconName;
  status: DashboardNavigationStatus;
  href?: string;
  featured?: boolean;
};

export type DashboardNavigationSection = {
  title: string;
  items: DashboardNavigationItem[];
};

/**
 * Phase 3A: Canonical J10 Dashboard Architecture
 * Exactly 7 Primary Product Areas:
 * 1. J10 Command Center (/dashboard)
 * 2. J10 Inbox (/dashboard/inbox)
 * 3. J10 Lead Center (/dashboard/crm)
 * 4. J10 Booking (/dashboard/booking)
 * 5. J10 Growth (/dashboard/growth)
 * 6. J10 AI Operator (/dashboard/ai-operator)
 * 7. J10 Pay (/dashboard/pay)
 */
export const primaryNavigationItems: DashboardNavigationItem[] = [
  {
    id: "command-center",
    label: "J10 Command Center",
    description: "Daily business summary, revenue metrics & attention items.",
    icon: "monogram",
    status: "ready",
    href: "/dashboard",
    featured: true,
  },
  {
    id: "inbox",
    label: "J10 Inbox",
    description: "Unified cross-channel conversations & human/AI handoff.",
    icon: "message",
    status: "ready",
    href: "/dashboard/inbox",
  },
  {
    id: "lead-center",
    label: "J10 Lead Center",
    description: "Contacts, pipeline qualification, and opportunity tracking.",
    icon: "users",
    status: "ready",
    href: "/dashboard/crm",
  },
  {
    id: "booking",
    label: "J10 Booking",
    description: "Appointments, availability, reminders & rescheduling.",
    icon: "activity",
    status: "ready",
    href: "/dashboard/booking",
  },
  {
    id: "growth",
    label: "J10 Growth",
    description: "J10 Campaigns, J10 Reviews, lead forms & reactivation.",
    icon: "sparkles",
    status: "ready",
    href: "/dashboard/growth",
  },
  {
    id: "ai-operator",
    label: "J10 AI Operator",
    description: "AI Receptionist, J10 Knowledge, J10 Automations & rules.",
    icon: "bot",
    status: "ready",
    href: "/dashboard/ai-operator",
  },
  {
    id: "pay",
    label: "J10 Pay",
    description: "Payment links, invoices, deposits & revenue status.",
    icon: "finance",
    status: "ready",
    href: "/dashboard/pay",
  },
];

/**
 * Supporting Areas:
 * - J10 Connections (/dashboard/connections)
 * - J10 Team (/dashboard/settings/team)
 * - J10 Brand (/dashboard/brand)
 * - Billing & Plan (/dashboard/settings/billing)
 * - Settings (/dashboard/settings)
 */
export const supportingNavigationItems: DashboardNavigationItem[] = [
  {
    id: "connections",
    label: "J10 Connections",
    description: "WhatsApp, Telegram, and business communication channels.",
    icon: "plug",
    status: "ready",
    href: "/dashboard/connections",
  },
  {
    id: "team",
    label: "J10 Team",
    description: "Workspace team members, roles & invitations.",
    icon: "briefcase",
    status: "ready",
    href: "/dashboard/settings/team",
  },
  {
    id: "brand",
    label: "J10 Brand",
    description: "Workspace identity, brand theme, and appearance.",
    icon: "palette",
    status: "ready",
    href: "/dashboard/brand",
  },
  {
    id: "billing",
    label: "Billing & Plan",
    description: "Plan entitlements, trial status, and subscription.",
    icon: "commerce",
    status: "ready",
    href: "/dashboard/settings/billing",
  },
];

export const dashboardNavigationSections: DashboardNavigationSection[] = [
  {
    title: "PRIMARY PRODUCTS",
    items: primaryNavigationItems,
  },
  {
    title: "SUPPORTING",
    items: supportingNavigationItems,
  },
];

export const dashboardSettingsItem: DashboardNavigationItem = {
  id: "settings",
  label: "Settings",
  description: "Manage workspace configurations, members, and preferences.",
  icon: "settings",
  status: "ready",
  href: "/dashboard/settings",
};

export const dashboardNavigationItems = [
  ...primaryNavigationItems,
  ...supportingNavigationItems,
  dashboardSettingsItem,
];

export const readyDashboardNavigationItems = dashboardNavigationItems.filter(
  (
    item
  ): item is DashboardNavigationItem & {
    href: string;
    status: "ready";
  } => item.status === "ready" && typeof item.href === "string"
);
