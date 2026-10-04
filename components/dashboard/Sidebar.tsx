"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  CircleDollarSign,
  Globe,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Palette,
  Plug,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Users,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  dashboardNavigationSections,
  dashboardSettingsItem,
  type DashboardIconName,
  type DashboardNavigationItem,
} from "@/lib/dashboard/navigation";

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
};

const iconMap: Record<DashboardIconName, LucideIcon | null> = {
  activity: Activity,
  analytics: BarChart3,
  automation: Zap,
  bot: Bot,
  brain: Brain,
  briefcase: BriefcaseBusiness,
  commerce: ShoppingCart,
  dashboard: LayoutDashboard,
  finance: CircleDollarSign,
  globe: Globe,
  marketing: Megaphone,
  message: MessageSquare,
  monogram: null, // Renders official J10 logo
  palette: Palette,
  plug: Plug,
  settings: Settings,
  sparkles: Megaphone, // Neutral marketing icon instead of sparkle
  store: Store,
  users: Users,
  workflow: Workflow,
};

function cleanRoute(href: string) {
  return href.split(/[?#]/)[0];
}

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();

  function isActive(item: DashboardNavigationItem) {
    if (!item.href || item.href.includes("#")) {
      return false;
    }

    const route = cleanRoute(item.href);

    if (route === "/dashboard" || route === "/dashboard/automation") {
      return pathname === route;
    }

    return pathname === route || pathname.startsWith(`${route}/`);
  }

  function handleNavigation() {
    onClose?.();
  }

  function renderItem(item: DashboardNavigationItem) {
    const Icon = iconMap[item.icon];
    const active = isActive(item);
    const available = item.status === "ready" && Boolean(item.href);
    const isJ10 = item.id === "command-center" || item.icon === "monogram";

    const className = `
      group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2
      text-left text-xs font-medium transition-all duration-150
      ${
        active
          ? "border-l-2 border-[#D8B565] bg-[var(--j10-dashboard-accent-soft)] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(124,58,237,0.38)]"
          : available
            ? "text-[var(--j10-dashboard-text-secondary)] hover:bg-[var(--j10-dashboard-hover)] hover:text-[var(--j10-dashboard-text)]"
            : "cursor-not-allowed text-[var(--j10-dashboard-text-muted)] opacity-60"
      }
    `;

    const content = (
      <>
        {isJ10 ? (
          <div className="flex h-4 w-4 shrink-0 items-center justify-center">
            <Image
              src="/brand/j10-logo.png"
              alt="J10 monogram"
              width={16}
              height={16}
              className={`h-full w-full object-contain ${active ? "brightness-0" : ""}`}
            />
          </div>
        ) : Icon ? (
          <Icon
            size={15}
            strokeWidth={1.8}
            className={
              active
                ? "text-white"
                : available
                  ? "text-[var(--j10-dashboard-text-secondary)] transition-colors group-hover:text-[var(--j10-dashboard-text)]"
                  : "text-[var(--j10-dashboard-text-muted)] opacity-50"
            }
          />
        ) : null}

        <span className="min-w-0 flex-1 truncate">{item.label}</span>

        {item.status === "building" ? (
          <span className="rounded border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface-elevated)] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-[var(--j10-dashboard-text-secondary)]">
            Soon
          </span>
        ) : null}
      </>
    );

    if (available && item.href) {
      return (
        <Link
          key={item.id}
          href={item.href}
          onClick={handleNavigation}
          className={className}
          title={item.description}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        disabled
        aria-disabled="true"
        className={className}
        title={`${item.label}: ${item.description}`}
      >
        {content}
      </button>
    );
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-dvh w-[228px] flex-col
          border-r border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)]
          transition-transform duration-200 lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand Header — Compact 56px */}
        <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--j10-dashboard-border)] px-4">
          <Link
            href="/dashboard"
            onClick={handleNavigation}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface-elevated)] p-1">
              <Image
                src="/brand/j10-logo.png"
                alt="J10 monogram"
                width={18}
                height={18}
                className="h-full w-full object-contain"
              />
            </div>

            <div>
              <div className="text-sm font-bold tracking-tight text-[var(--j10-dashboard-text)]">
                J10 <span className="font-normal text-[var(--j10-dashboard-text-secondary)]">NEXUS</span>
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-[var(--j10-dashboard-text-secondary)] transition hover:bg-[var(--j10-dashboard-hover)] hover:text-[var(--j10-dashboard-text)] lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="mt-3 flex-1 overflow-y-auto px-2.5 pb-4 scrollbar-thin">
          {dashboardNavigationSections.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--j10-dashboard-text-muted)]">
                {section.title}
              </div>
              <div className="space-y-0.5">{section.items.map(renderItem)}</div>
            </div>
          ))}
        </nav>

        {/* Footer Workspace Info */}
        <div className="shrink-0 border-t border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] p-2.5">
          {renderItem(dashboardSettingsItem)}

          <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface-elevated)] p-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] text-[11px] font-bold text-[#D8B565]">
              W
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-[var(--j10-dashboard-text)]">
                Active Workspace
              </div>
              <div className="truncate text-[10px] text-[var(--j10-dashboard-text-secondary)]">
                Production Tenant
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
