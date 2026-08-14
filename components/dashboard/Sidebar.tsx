"use client";

import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Globe,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Network,
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
} from "lucide-react";

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
};

const sections = [
  {
    title: "HOME",
    items: [
      { label: "Overview", icon: LayoutDashboard },
      { label: "Activity", icon: Activity },
      { label: "Notifications", icon: MessageSquare },
    ],
  },
  {
    title: "CREATE",
    items: [
      { label: "AI Employee", icon: Bot },
      { label: "Workflow", icon: Workflow },
      { label: "Website", icon: Globe },
      { label: "Marketing Campaign", icon: Megaphone },
      { label: "WhatsApp Bot", icon: MessageSquare },
    ],
  },
  {
    title: "BUSINESS",
    items: [
      { label: "CRM", icon: Users },
      { label: "Commerce", icon: ShoppingCart },
      { label: "Finance", icon: CircleDollarSign },
      { label: "HR", icon: BriefcaseBusiness },
      { label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "AI",
    items: [
      { label: "J10 AI", icon: Sparkles, featured: true },
      { label: "Knowledge Hub", icon: Brain },
      { label: "AI Studio", icon: Palette },
      { label: "Automation", icon: Zap },
    ],
  },
  {
    title: "CONNECT",
    items: [
      { label: "Marketplace", icon: Store },
      { label: "Integrations", icon: Plug },
    ],
  },
];

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col
          border-r border-white/[0.06]
          bg-[#09090B]/95 backdrop-blur-xl
          transition-transform duration-300
          lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo */}
        <div className="flex h-[72px] items-center justify-between border-b border-white/[0.06] px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <span className="text-sm font-black text-white">J</span>
            </div>

            <div>
              <div className="text-[15px] font-bold tracking-tight text-white">
                J10
              </div>
              <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/40">
                Operating System
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* J10 AI */}
        <div className="px-3 pt-4">
          <button className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-500/10 via-violet-500/10 to-cyan-500/10 px-3 py-3 text-left transition-all duration-300 hover:border-blue-400/40 hover:shadow-lg hover:shadow-blue-500/10">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-violet-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <Sparkles size={17} className="text-white" />
            </div>

            <div className="relative flex-1">
              <div className="text-sm font-semibold text-white">
                J10 AI
              </div>
              <div className="text-[11px] text-white/40">
                Your business intelligence
              </div>
            </div>

            <ChevronRight
              size={15}
              className="relative text-white/30 transition-transform group-hover:translate-x-1"
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              <div className="mb-2 px-2 text-[9px] font-semibold tracking-[0.18em] text-white/25">
                {section.title}
              </div>

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.label}
                      className={`
                        group flex w-full items-center gap-3 rounded-lg px-3 py-2.5
                        text-left text-[13px]
                        transition-all duration-200
                        ${
                          item.featured
                            ? "bg-white/[0.055] text-white"
                            : "text-white/50 hover:bg-white/[0.045] hover:text-white"
                        }
                      `}
                    >
                      <Icon
                        size={16}
                        strokeWidth={1.8}
                        className={`
                          transition-colors duration-200
                          ${
                            item.featured
                              ? "text-blue-400"
                              : "text-white/35 group-hover:text-white/80"
                          }
                        `}
                      />

                      <span className="flex-1">{item.label}</span>

                      {item.featured && (
                        <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-blue-400">
                          AI
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/[0.06] p-3">
          <button className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-white/50 transition hover:bg-white/[0.045] hover:text-white">
            <Settings
              size={16}
              className="text-white/35 group-hover:text-white/80"
            />

            <span>Settings</span>
          </button>

          <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-bold text-white">
              J
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-white">
                J10 Workspace
              </div>
              <div className="truncate text-[10px] text-white/35">
                Free workspace
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}