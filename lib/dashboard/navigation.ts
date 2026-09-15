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
        id: "overview",
        label: "Overview",
        description: "Revenue command center & operations overview.",
        icon: "monogram",
        status: "ready",
        href: "/dashboard",
        featured: true,
      },
      {
        id: "ai-receptionist",
        label: "AI Receptionist",
        description: "Live simulator, prompt health & receptionist tuning.",
        icon: "bot",
        status: "ready",
        href: "/dashboard/bot-setup?tab=simulator",
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
        id: "bot-setup",
        label: "Bot Setup",
        description: "Configure AI receptionist, business profile, services & test bot.",
        icon: "sparkles",
        status: "ready",
        href: "/dashboard/bot-setup",
      },
      {
        id: "connections",
        label: "Connections",
        description: "Manage profiles, Telegram bots, WhatsApp numbers, and integrations.",
        icon: "plug",
        status: "ready",
        href: "/dashboard/connections",
      },
      {
        id: "revenue",
        label: "Revenue",
        description: "Revenue pipeline, payments, and commercial movement.",
        icon: "finance",
        status: "ready",
        href: "/dashboard/revenue",
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
