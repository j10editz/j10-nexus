"use client";

import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Brain,
  Building2,
  Check,
  ChevronRight,
  Globe,
  Image,
  LineChart,
  MessageSquare,
  Plug,
  Search,
  Settings2,
  ShoppingCart,
  Sparkles,
  Store,
  Users,
  Workflow,
  X,
  Zap,
  Megaphone,
  Wallet,
} from "lucide-react";
import { useState } from "react";

type Module = {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  iconColor: string;
  features: string[];
};

const modules: Module[] = [
  {
    id: "ai-employees",
    name: "AI Employees",
    eyebrow: "INTELLIGENT WORKFORCE",
    description:
      "Deploy AI employees that work across your business, handling repetitive tasks, customers, sales, research, operations, and more.",
    icon: Bot,
    gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
    iconColor: "text-blue-400",
    features: [
      "AI Customer Support",
      "AI Sales Agent",
      "AI Receptionist",
      "AI HR Assistant",
      "AI Research Assistant",
      "AI Project Manager",
      "AI Executive Assistant",
      "AI Voice & Phone Agents",
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business AI",
    eyebrow: "BUSINESS COMMUNICATION",
    description:
      "Turn WhatsApp into an intelligent business channel with AI support, sales, automation, moderation, and customer management.",
    icon: MessageSquare,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    iconColor: "text-emerald-400",
    features: [
      "AI Customer Support",
      "AI Sales Assistant",
      "AI Booking System",
      "Order Tracking",
      "Lead Capture",
      "AI Voice Message Replies",
      "Anti-Spam & Anti-Link",
      "Group Moderation",
      "Auto Announcements",
      "Analytics",
    ],
  },
  {
    id: "studio",
    name: "AI Studio",
    eyebrow: "CREATIVE INTELLIGENCE",
    description:
      "Create professional images, videos, designs, product photography, branding, and marketing assets with AI.",
    icon: Image,
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    iconColor: "text-violet-400",
    features: [
      "Image Generation",
      "Video Generation",
      "AI Video Editing",
      "AI Photoshoots",
      "Product Photography",
      "AI Avatars",
      "Voice & Music Generation",
      "Logo & Brand Kits",
      "Mockups",
      "Social Media Kits",
    ],
  },
  {
    id: "automation",
    name: "Automation Hub",
    eyebrow: "BUSINESS AUTOMATION",
    description:
      "Connect your tools and automate entire business processes using visual workflows and intelligent AI actions.",
    icon: Workflow,
    gradient: "from-cyan-500/20 via-cyan-500/5 to-transparent",
    iconColor: "text-cyan-400",
    features: [
      "Visual Workflow Builder",
      "Drag & Drop Automation",
      "CRM Automation",
      "Email Automation",
      "Invoice Automation",
      "Lead Automation",
      "Inventory Automation",
      "API Connections",
      "Webhooks",
      "Custom AI Workflows",
    ],
  },
  {
    id: "marketing",
    name: "Marketing AI",
    eyebrow: "GROWTH ENGINE",
    description:
      "Plan, create, launch, optimize, and analyze marketing campaigns from one intelligent workspace.",
    icon: Megaphone,
    gradient: "from-orange-500/20 via-orange-500/5 to-transparent",
    iconColor: "text-orange-400",
    features: [
      "AI Copywriting",
      "Content Calendar",
      "Blog Writer",
      "Email Marketing",
      "SMS Campaigns",
      "Facebook Ads",
      "Google Ads",
      "TikTok Ads",
      "SEO Optimization",
      "AI Analytics",
    ],
  },
  {
    id: "commerce",
    name: "Commerce AI",
    eyebrow: "INTELLIGENT COMMERCE",
    description:
      "Manage products, customers, orders, inventory, pricing, and growth across your commerce ecosystem.",
    icon: ShoppingCart,
    gradient: "from-pink-500/20 via-pink-500/5 to-transparent",
    iconColor: "text-pink-400",
    features: [
      "Shopify Integration",
      "WooCommerce",
      "Amazon & eBay",
      "TikTok Shop",
      "Product Descriptions",
      "Inventory Management",
      "Order Tracking",
      "AI Pricing",
      "Upselling",
      "Customer Retention",
    ],
  },
  {
    id: "crm",
    name: "CRM",
    eyebrow: "CUSTOMER INTELLIGENCE",
    description:
      "Understand every customer, lead, opportunity, conversation, and deal from one centralized workspace.",
    icon: Users,
    gradient: "from-indigo-500/20 via-indigo-500/5 to-transparent",
    iconColor: "text-indigo-400",
    features: [
      "Customer Database",
      "Sales Pipeline",
      "Contact Management",
      "Lead Tracking",
      "Opportunities",
      "Deals",
      "Tasks & Meetings",
      "AI Insights",
      "Customer Health Score",
    ],
  },
  {
    id: "finance",
    name: "Finance AI",
    eyebrow: "FINANCIAL INTELLIGENCE",
    description:
      "Monitor your finances, generate reports, track expenses, and understand the financial health of your business.",
    icon: Wallet,
    gradient: "from-yellow-500/20 via-yellow-500/5 to-transparent",
    iconColor: "text-yellow-400",
    features: [
      "Invoice Generator",
      "Expense Tracking",
      "Budget Planning",
      "Profit Dashboard",
      "Financial Reports",
      "Tax Preparation Support",
      "Payroll Support",
      "AI Financial Insights",
    ],
  },
  {
    id: "hr",
    name: "HR",
    eyebrow: "PEOPLE OPERATIONS",
    description:
      "Manage employees, recruitment, onboarding, attendance, training, and performance with intelligent HR tools.",
    icon: Building2,
    gradient: "from-rose-500/20 via-rose-500/5 to-transparent",
    iconColor: "text-rose-400",
    features: [
      "Employee Records",
      "Attendance",
      "Recruitment",
      "Resume Screening",
      "Interview Scheduling",
      "Performance Reviews",
      "Employee Onboarding",
      "Training Assistant",
    ],
  },
  {
    id: "analytics",
    name: "Analytics",
    eyebrow: "BUSINESS INTELLIGENCE",
    description:
      "Turn your business data into decisions with real-time dashboards, AI reports, forecasting, and insights.",
    icon: BarChart3,
    gradient: "from-teal-500/20 via-teal-500/5 to-transparent",
    iconColor: "text-teal-400",
    features: [
      "Business Dashboard",
      "Sales Analytics",
      "Marketing Analytics",
      "AI Reports",
      "Revenue Forecasting",
      "Customer Insights",
      "KPI Tracking",
      "Real-Time Monitoring",
    ],
  },
  {
    id: "knowledge",
    name: "Knowledge Hub",
    eyebrow: "COMPANY INTELLIGENCE",
    description:
      "Turn your company documents and knowledge into an intelligent source of truth your team and AI can use.",
    icon: Brain,
    gradient: "from-purple-500/20 via-purple-500/5 to-transparent",
    iconColor: "text-purple-400",
    features: [
      "AI Search",
      "Company Wiki",
      "Internal Documents",
      "SOP Builder",
      "Training Manuals",
      "AI Chat with Documents",
      "PDF Analysis",
      "Contract Analysis",
    ],
  },
  {
    id: "website",
    name: "Website Builder",
    eyebrow: "DIGITAL PRESENCE",
    description:
      "Create websites, stores, landing pages, blogs, and business experiences without starting from scratch.",
    icon: Globe,
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
    iconColor: "text-sky-400",
    features: [
      "Landing Pages",
      "AI Websites",
      "Blogs",
      "Portfolios",
      "Online Stores",
      "AI Design Suggestions",
      "SEO Optimization",
      "Forms & Booking",
    ],
  },
  {
    id: "marketplace",
    name: "Marketplace",
    eyebrow: "J10 ECONOMY",
    description:
      "Buy and sell AI-powered digital products, automations, employees, templates, websites, and creative assets.",
    icon: Store,
    gradient: "from-fuchsia-500/20 via-fuchsia-500/5 to-transparent",
    iconColor: "text-fuchsia-400",
    features: [
      "Sell AI Bots",
      "Sell Prompt Packs",
      "Sell Templates",
      "Sell Workflows",
      "Sell AI Employees",
      "Sell Websites",
      "Sell Voice Agents",
      "Sell Integrations",
      "Sell Designs",
      "Sell Plugins",
    ],
  },
  {
    id: "integrations",
    name: "Integrations",
    eyebrow: "CONNECTED ECOSYSTEM",
    description:
      "Connect the tools your business already uses and bring everything into the J10 NEXUS ecosystem.",
    icon: Plug,
    gradient: "from-blue-500/20 via-violet-500/5 to-transparent",
    iconColor: "text-blue-400",
    features: [
      "WhatsApp",
      "Discord",
      "Telegram",
      "Slack",
      "Shopify",
      "Stripe",
      "Gmail",
      "Google Drive",
      "Notion",
      "HubSpot",
      "Salesforce",
      "Zapier & Make",
      "Meta",
      "TikTok",
      "GitHub",
      "AI Providers",
    ],
  },
];

export default function Modules() {
  const [selected, setSelected] = useState<Module | null>(null);

  return (
    <>
      <section
        id="modules"
        className="relative overflow-hidden bg-[#09090B] py-28 text-white"
      >
        {/* Background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/[0.05] blur-[140px]" />

          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,.8) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-[1500px] px-6 lg:px-8">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-400">
              <Sparkles size={14} className="text-blue-400" />
              One intelligent ecosystem
            </div>

            <h2 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl lg:text-6xl">
              Everything your business needs.
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-500 sm:text-lg">
              J10 NEXUS brings your AI workforce, operations, customers,
              marketing, commerce, creativity, and intelligence together in
              one platform.
            </p>
          </div>

          {/* Module grid */}
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {modules.map((module) => {
              const Icon = module.icon;

              return (
                <button
                  key={module.id}
                  onClick={() => setSelected(module)}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111216] p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.14] hover:bg-[#14161B]"
                >
                  {/* Glow */}
                  <div
                    className={`absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${module.gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100`}
                  />

                  <div className="relative">
                    {/* Icon */}
                    <div className="mb-7 flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] transition-all duration-300 group-hover:border-white/[0.12] group-hover:bg-white/[0.06]">
                        <Icon
                          size={20}
                          className={`${module.iconColor} transition-transform duration-300 group-hover:scale-110`}
                        />
                      </div>

                      <ArrowUpRight
                        size={17}
                        className="text-zinc-700 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-300"
                      />
                    </div>

                    {/* Content */}
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
                      {module.eyebrow}
                    </p>

                    <h3 className="mt-2 text-lg font-semibold tracking-tight">
                      {module.name}
                    </h3>

                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-500">
                      {module.description}
                    </p>

                    {/* Feature preview */}
                    <div className="mt-6 flex items-center gap-2 text-xs font-medium text-zinc-400">
                      <span>
                        {module.features.length} capabilities
                      </span>

                      <ChevronRight
                        size={13}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom statement */}
          <div className="mt-16 flex flex-col items-center justify-between gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-5 text-center sm:flex-row sm:text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Zap size={16} className="text-blue-400" />
              </div>

              <div>
                <p className="text-sm font-medium">
                  One platform. Unlimited possibilities.
                </p>

                <p className="mt-0.5 text-xs text-zinc-600">
                  Everything works together inside J10 NEXUS.
                </p>
              </div>
            </div>

            <button className="flex items-center gap-2 text-xs font-medium text-zinc-400 transition-colors hover:text-white">
              Explore the platform
              <ArrowRightSmall />
            </button>
          </div>
        </div>
      </section>

      {/* DETAIL MODAL */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl border border-white/10 bg-[#0E1015] shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Modal glow */}
            <div
              className={`pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-gradient-to-br ${selected.gradient} blur-[100px]`}
            />

            <div className="relative p-7 sm:p-9">
              {/* Close */}
              <button
                onClick={() => setSelected(null)}
                className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-zinc-500 transition hover:bg-white/[0.07] hover:text-white"
              >
                <X size={17} />
              </button>

              {/* Header */}
              <div className="flex items-start gap-4 pr-10">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                  <selected.icon
                    size={25}
                    className={selected.iconColor}
                  />
                </div>

                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
                    {selected.eyebrow}
                  </p>

                  <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                    {selected.name}
                  </h3>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                    {selected.description}
                  </p>
                </div>
              </div>

              {/* Capabilities */}
              <div className="mt-8">
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 size={15} className="text-zinc-500" />

                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
                    Capabilities
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {selected.features.map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                        <Check
                          size={13}
                          className="text-emerald-400"
                        />
                      </div>

                      <span className="text-sm text-zinc-300">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="mt-8 flex flex-col gap-3 border-t border-white/[0.06] pt-6 sm:flex-row">
                <button className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200">
                  Start Building
                  <ArrowUpRight size={15} />
                </button>

                <button
                  onClick={() => setSelected(null)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06]"
                >
                  Continue Exploring
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ArrowRightSmall() {
  return <ChevronRight size={14} />;
}