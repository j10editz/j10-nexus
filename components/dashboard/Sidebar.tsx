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
  sparkles: Sparkles,
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
    const isJ10 = item.id === "j10-ai" || item.icon === "monogram";

    const className = `
      group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2
      text-left text-xs font-medium transition-colors duration-150
      ${
        active
          ? "bg-[#4F7CFF] text-white font-semibold shadow-sm"
          : available
            ? "text-[#98A2B3] hover:bg-[#151922] hover:text-[#F5F7FA]"
            : "cursor-not-allowed text-[#667085]/60"
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
              className="h-full w-full object-contain"
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
                  ? "text-[#667085] transition-colors group-hover:text-[#F5F7FA]"
                  : "text-[#667085]/40"
            }
          />
        ) : null}

        <span className="min-w-0 flex-1 truncate">{item.label}</span>

        {item.status === "building" ? (
          <span className="rounded border border-[#242A35] bg-[#151922] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-[#667085]">
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
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-dvh w-[228px] flex-col
          border-r border-[#242A35] bg-[#090B10]
          transition-transform duration-200 lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand Header — Compact 56px */}
        <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-[#242A35] px-4">
          <Link
            href="/dashboard"
            onClick={handleNavigation}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md p-1 bg-[#101319] border border-[#242A35]">
              <Image
                src="/brand/j10-logo.png"
                alt="J10 monogram"
                width={18}
                height={18}
                className="h-full w-full object-contain"
              />
            </div>

            <div>
              <div className="text-sm font-bold tracking-tight text-[#F5F7FA]">
                J10 <span className="font-normal text-[#98A2B3]">NEXUS</span>
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-[#667085] transition hover:bg-[#151922] hover:text-[#F5F7FA] lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="mt-3 flex-1 overflow-y-auto px-2.5 pb-4 scrollbar-thin">
          {dashboardNavigationSections.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#667085]">
                {section.title}
              </div>
              <div className="space-y-0.5">{section.items.map(renderItem)}</div>
            </div>
          ))}
        </nav>

        {/* Footer Workspace Info */}
        <div className="shrink-0 border-t border-[#242A35] bg-[#090B10] p-2.5">
          {renderItem(dashboardSettingsItem)}

          <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-[#242A35] bg-[#101319] p-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[#151922] text-[11px] font-bold text-[#98A2B3] border border-[#242A35]">
              W
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-[#F5F7FA]">
                Active Workspace
              </div>
              <div className="truncate text-[10px] text-[#667085]">
                Production Tenant
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
