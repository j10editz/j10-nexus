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
  ChevronRight,
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

    if (
      route === "/dashboard" ||
      route === "/dashboard/automation"
    ) {
      return pathname === route;
    }

    return (
      pathname === route ||
      pathname.startsWith(`${route}/`)
    );
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
      group flex w-full items-center gap-3 rounded-xl px-3 py-2.5
      text-left text-[13px] font-medium transition-all duration-200
      ${
        active
          ? "j10-gradient text-white shadow-[0_8px_20px_rgba(47,107,255,0.25)] font-semibold"
          : isJ10
            ? "bg-white/[0.04] text-white hover:bg-white/[0.08]"
            : available
              ? "text-[#8d96a8] hover:bg-white/[0.04] hover:text-white"
              : "cursor-not-allowed text-white/25"
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
            size={16}
            strokeWidth={1.8}
            className={
              active
                ? "text-white"
                : available
                  ? "text-[#8d96a8] transition-colors group-hover:text-white"
                  : "text-white/20"
            }
          />
        ) : null}

        <span className="min-w-0 flex-1 truncate">
          {item.label}
        </span>

        {item.status === "building" ? (
          <span className="rounded-full border border-amber-400/15 bg-amber-400/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-amber-300/60">
            Building
          </span>
        ) : isJ10 && !active ? (
          <span className="rounded-full bg-cyan-400/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-cyan-300">
            OS
          </span>
        ) : active ? (
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#00d9ff]" />
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
          fixed left-0 top-0 z-50 flex h-dvh w-[260px] flex-col
          border-r border-white/[0.08] bg-[#07090f]/95 backdrop-blur-2xl
          transition-transform duration-300 lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand Header */}
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
          <Link
            href="/dashboard"
            onClick={handleNavigation}
            className="flex items-center gap-3"
          >
            <div className="j10-gradient flex h-8 w-8 items-center justify-center rounded-xl p-1.5 shadow-[0_6px_16px_rgba(47,107,255,0.3)]">
              <Image
                src="/brand/j10-logo.png"
                alt="J10 monogram"
                width={22}
                height={22}
                className="h-full w-full object-contain"
              />
            </div>

            <div>
              <div className="text-[15px] font-bold tracking-tight text-white">
                J10 <span className="font-medium text-[#8d96a8]">NEXUS</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-400">
                Revenue OS
              </div>
            </div>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
          {dashboardNavigationSections.map((section) => (
            <div key={section.title} className="mb-5">
              <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5f697d]">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map(renderItem)}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer Workspace Info */}
        <div className="shrink-0 border-t border-white/[0.07] bg-[#07090f] p-3">
          {renderItem(dashboardSettingsItem)}

          <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
            <div className="j10-gradient flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm">
              W
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">
                Active Workspace
              </div>
              <div className="truncate text-[10px] text-[#8d96a8]">
                Production Tenant
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
