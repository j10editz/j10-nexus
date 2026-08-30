"use client";

import Link from "next/link";
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

const iconMap: Record<
  DashboardIconName,
  LucideIcon
> = {
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
    const available =
      item.status === "ready" && Boolean(item.href);

    const className = `
      group flex w-full items-center gap-3 rounded-lg px-3 py-2.5
      text-left text-[13px] transition-all duration-200
      ${
        active
          ? "bg-gradient-to-r from-blue-500/15 via-violet-500/10 to-transparent text-white"
          : item.featured
            ? "bg-white/[0.055] text-white hover:bg-white/[0.075]"
            : available
              ? "text-white/55 hover:bg-white/[0.045] hover:text-white"
              : "cursor-not-allowed text-white/25"
      }
    `;

    const content = (
      <>
        <Icon
          size={16}
          strokeWidth={1.8}
          className={
            active || item.featured
              ? "text-blue-400"
              : available
                ? "text-white/35 transition-colors group-hover:text-white/80"
                : "text-white/20"
          }
        />

        <span className="min-w-0 flex-1 truncate">
          {item.label}
        </span>

        {item.status === "building" ? (
          <span className="rounded-full border border-amber-400/15 bg-amber-400/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-amber-300/60">
            Building
          </span>
        ) : item.featured ? (
          <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-blue-400">
            AI
          </span>
        ) : active ? (
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
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
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-dvh w-[260px] flex-col
          border-r border-white/[0.06] bg-[#09090B]/98 backdrop-blur-xl
          transition-transform duration-300 lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.06] px-5">
          <Link
            href="/dashboard"
            onClick={handleNavigation}
            className="flex items-center gap-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <span className="text-sm font-black text-white">
                J
              </span>
            </div>

            <div>
              <div className="text-[15px] font-bold tracking-tight text-white">
                J10
              </div>
              <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/40">
                Operating System
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

        <div className="px-3 pt-4">
          <Link
            href="/dashboard#j10-ai"
            onClick={handleNavigation}
            className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-500/10 via-violet-500/10 to-cyan-500/10 px-3 py-3 text-left transition-all duration-300 hover:border-blue-400/40 hover:shadow-lg hover:shadow-blue-500/10"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-violet-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <Sparkles size={17} className="text-white" />
            </div>

            <div className="relative min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">
                J10 AI
              </div>
              <div className="truncate text-[11px] text-white/40">
                Your business intelligence
              </div>
            </div>

            <ChevronRight
              size={15}
              className="relative text-white/30 transition-transform group-hover:translate-x-1"
            />
          </Link>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
          {dashboardNavigationSections.map((section) => (
            <div key={section.title} className="mb-5">
              <div className="mb-2 px-2 text-[9px] font-semibold tracking-[0.18em] text-white/25">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map(renderItem)}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/[0.06] bg-[#09090B] p-3">
          {renderItem(dashboardSettingsItem)}

          <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-bold text-white">
              J
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-white">
                J10 Workspace
              </div>
              <div className="truncate text-[10px] text-white/35">
                Development workspace
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
