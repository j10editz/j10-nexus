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

export const dashboardNavigationSections: DashboardNavigationSection[] = [
  {
    title: "WORKSPACE",
    items: [
      {
        id: "j10-ai",
        label: "J10 AI",
        description: "Revenue and operations command center.",
        icon: "monogram",
        status: "ready",
        href: "/dashboard",
        featured: true,
      },
      {
        id: "inbox",
        label: "Inbox",
        description: "Customer conversations requiring attention.",
        icon: "message",
        status: "ready",
        href: "/dashboard/inbox",
      },
      {
        id: "crm",
        label: "CRM",
        description: "Customer context, pipeline, and follow-up.",
        icon: "users",
        status: "ready",
        href: "/dashboard/crm",
      },
      {
        id: "ai-employees",
        label: "Agents",
        description: "Create, assign, and operate the J10 AI workforce.",
        icon: "bot",
        status: "ready",
        href: "/dashboard/ai-employees",
      },
      {
        id: "workflow",
        label: "Flow",
        description: "Build visual workflows with the J10 Flow canvas.",
        icon: "workflow",
        status: "ready",
        href: "/dashboard/automation/flow",
      },
      {
        id: "revenue",
        label: "Revenue",
        description: "Revenue pipeline, payments, and commercial movement.",
        icon: "finance",
        status: "ready",
        href: "/dashboard/revenue",
      },
      {
        id: "integrations",
        label: "Integrations",
        description: "Connect providers, credentials, scopes, webhooks, and actions.",
        icon: "plug",
        status: "ready",
        href: "/dashboard/settings/integrations",
      },
    ],
  },
];

export const dashboardSettingsItem: DashboardNavigationItem = {
  id: "settings",
  label: "Settings",
  description: "Manage the J10 workspace, integrations, and runtime tools.",
  icon: "settings",
  status: "ready",
  href: "/dashboard/settings",
};

export const dashboardNavigationItems = [
  ...dashboardNavigationSections.flatMap((section) => section.items),
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
