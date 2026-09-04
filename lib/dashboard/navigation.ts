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

export const dashboardNavigationSections:
  DashboardNavigationSection[] = [
    {
      title: "HOME",
      items: [
        {
          id: "overview",
          label: "Overview",
          description:
            "Business command center and live operating summary.",
          icon: "dashboard",
          status: "ready",
          href: "/dashboard",
        },
        {
          id: "activity",
          label: "Activity",
          description:
            "Search real actions across the J10 workspace.",
          icon: "activity",
          status: "ready",
          href: "/dashboard/activity",
        },
        {
          id: "notifications",
          label: "Notifications",
          description:
            "Review workflow failures, approvals, and completions.",
          icon: "message",
          status: "ready",
          href: "/dashboard/notifications",
        },
      ],
    },
    {
      title: "CREATE",
      items: [
        {
          id: "ai-employees",
          label: "AI Employee",
          description:
            "Create, assign, and operate the J10 AI workforce.",
          icon: "bot",
          status: "ready",
          href: "/dashboard/ai-employees",
        },
        {
          id: "workflow",
          label: "Workflow",
          description:
            "Build visual workflows with the J10 Flow canvas.",
          icon: "workflow",
          status: "ready",
          href: "/dashboard/automation/flow",
        },
        {
          id: "website",
          label: "Website",
          description:
            "Launch high-converting landing pages with WhatsApp capture.",
          icon: "globe",
          status: "ready",
          href: "/dashboard/website",
        },
        {
          id: "marketing",
          label: "Marketing Campaign",
          description:
            "Design campaigns, AI copy studio, and CRM broadcasts.",
          icon: "marketing",
          status: "ready",
          href: "/dashboard/marketing",
        },
        {
          id: "whatsapp",
          label: "WhatsApp Bot",
          description:
            "Configure WhatsApp operations and production readiness.",
          icon: "message",
          status: "ready",
          href: "/dashboard/whatsapp",
        },
      ],
    },
    {
      title: "BUSINESS",
      items: [
        {
          id: "crm",
          label: "CRM",
          description:
            "Manage contacts, pipeline value, status, and AI analysis.",
          icon: "users",
          status: "ready",
          href: "/dashboard/crm",
        },
        {
          id: "commerce",
          label: "Commerce",
          description:
            "Products, orders, and customers are scheduled for a later sprint.",
          icon: "commerce",
          status: "building",
        },
        {
          id: "finance",
          label: "Finance",
          description:
            "Track closed deals, generate invoices, and monitor cashflow.",
          icon: "finance",
          status: "ready",
          href: "/dashboard/finance",
        },
        {
          id: "hr",
          label: "HR",
          description:
            "Orchestrate human specialists paired with AI employees.",
          icon: "briefcase",
          status: "ready",
          href: "/dashboard/hr",
        },
        {
          id: "analytics",
          label: "Analytics",
          description:
            "Inspect live integration and operational analytics.",
          icon: "analytics",
          status: "ready",
          href: "/dashboard/analytics",
        },
      ],
    },
    {
      title: "AI",
      items: [
        {
          id: "j10-ai",
          label: "J10 AI",
          description:
            "Open the business intelligence command center.",
          icon: "sparkles",
          status: "ready",
          href: "/dashboard#j10-ai",
          featured: true,
        },
        {
          id: "knowledge",
          label: "Knowledge Hub",
          description:
            "Ground AI agents with company docs and verified facts.",
          icon: "brain",
          status: "ready",
          href: "/dashboard/knowledge",
        },
        {
          id: "ai-studio",
          label: "AI Studio",
          description:
            "Creative AI production tools are scheduled for a later sprint.",
          icon: "palette",
          status: "building",
        },
        {
          id: "automation",
          label: "Automation",
          description:
            "Manage automation performance, approvals, and execution history.",
          icon: "automation",
          status: "ready",
          href: "/dashboard/automation",
        },
      ],
    },
    {
      title: "CONNECT",
      items: [
        {
          id: "marketplace",
          label: "Marketplace",
          description:
            "Installable J10 solutions are scheduled for a later sprint.",
          icon: "store",
          status: "building",
        },
        {
          id: "integrations",
          label: "Integrations",
          description:
            "Connect providers, credentials, scopes, webhooks, and actions.",
          icon: "plug",
          status: "ready",
          href: "/dashboard/settings/integrations",
        },
      ],
    },
  ];

export const dashboardSettingsItem:
  DashboardNavigationItem = {
    id: "settings",
    label: "Settings",
    description:
      "Manage the J10 workspace, integrations, and runtime tools.",
    icon: "settings",
    status: "ready",
    href: "/dashboard/settings",
  };

export const dashboardNavigationItems = [
  ...dashboardNavigationSections.flatMap(
    (section) => section.items
  ),
  dashboardSettingsItem,
];

export const readyDashboardNavigationItems =
  dashboardNavigationItems.filter(
    (
      item
    ): item is DashboardNavigationItem & {
      href: string;
      status: "ready";
    } =>
      item.status === "ready" &&
      typeof item.href === "string"
  );
