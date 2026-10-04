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
    title: "PRIMARY PRODUCTS",
    items: [
      {
        id: "overview",
        label: "Command Center",
        description: "Revenue command center & operations overview.",
        icon: "monogram",
        status: "ready",
        href: "/dashboard",
        featured: true,
      },
      {
        id: "inbox",
        label: "J10 Inbox",
        description: "Customer conversations requiring attention.",
        icon: "message",
        status: "ready",
        href: "/dashboard/inbox",
      },
      {
        id: "crm",
        label: "Lead Center",
        description: "Customer context, pipeline, and follow-up.",
        icon: "users",
        status: "ready",
        href: "/dashboard/crm",
      },
      {
        id: "booking",
        label: "J10 Booking",
        description: "Appointments, reminders, rescheduling, and no-show recovery.",
        icon: "activity",
        status: "ready",
        href: "/dashboard/booking",
      },
      {
        id: "ai-receptionist",
        label: "AI Receptionist",
        description: "Calls, messages, qualification, and missed-call recovery.",
        icon: "bot",
        status: "ready",
        href: "/dashboard/bot-setup?tab=simulator",
      },
      {
        id: "ai-operator",
        label: "J10 AI Operator",
        description: "Knowledge, rules, approvals, and agent activity.",
        icon: "monogram",
        status: "ready",
        href: "/dashboard/bot-setup",
      },
      {
        id: "pay",
        label: "J10 Pay",
        description: "Payments, invoices, deposits, and financial movement.",
        icon: "finance",
        status: "ready",
        href: "/dashboard/finance",
      },
    ],
  },
  {
    title: "SUPPORTING",
    items: [
      { id: "connections", label: "Connections", description: "Connect messaging, email, calendars, and payments.", icon: "plug", status: "ready", href: "/dashboard/connections" },
      { id: "knowledge", label: "Knowledge", description: "Services, prices, policies, and business answers.", icon: "brain", status: "ready", href: "/dashboard/knowledge" },
      { id: "automations", label: "Automations", description: "Triggers, actions, and reusable workflows.", icon: "workflow", status: "ready", href: "/dashboard/automation" },
      { id: "campaigns", label: "Campaigns", description: "Reactivation, offers, broadcasts, and follow-up.", icon: "marketing", status: "ready", href: "/dashboard/marketing" },
      { id: "reviews", label: "Reviews", description: "Review requests, replies, and reputation alerts.", icon: "sparkles", status: "ready", href: "/dashboard/reviews" },
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
