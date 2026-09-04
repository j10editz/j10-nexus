"use client";

import {
  ArrowRight,
  Bot,
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  Code2,
  FileText,
  Globe,
  Headphones,
  Image as ImageIcon,
  LayoutDashboard,
  MessageSquare,
  Network,
  Play,
  Search,
  Settings2,
  ShoppingCart,
  Sparkles,
  Store,
  Users,
  Video,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Module = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  capabilities: string[];
};

const modules: Module[] = [
  {
    id: "ai-employees",
    title: "AI Employees",
    eyebrow: "DIGITAL WORKFORCE",
    description:
      "Deploy specialized AI employees that handle real business tasks, communicate with customers, and operate around the clock.",
    icon: Bot,
    gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
    capabilities: [
      "AI Customer Support",
      "AI Sales Agent",
      "AI Receptionist",
      "AI HR Assistant",
      "AI Accounting Assistant",
      "AI Executive Assistant",
      "AI Legal Assistant",
      "AI Recruiting Assistant",
      "AI Project Manager",
      "AI Research Assistant",
      "AI Email Assistant",
      "AI Appointment Scheduler",
      "AI Voice Agent",
      "AI Phone Agent",
      "AI Knowledge Base Assistant",
      "Custom AI Employee",
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp Business AI",
    eyebrow: "COMMUNICATION",
    description:
      "A complete WhatsApp business platform for support, sales, automation, moderation, group management, and AI conversations.",
    icon: MessageSquare,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    capabilities: [
      "AI Customer Support",
      "AI Sales Assistant",
      "Product Recommendations",
      "AI FAQ",
      "Booking System",
      "Order Tracking",
      "Invoice Sender",
      "Payment Reminders",
      "Appointment Reminders",
      "Lead Capture",
      "Follow-up Campaigns",
      "Multilingual Conversations",
      "Voice Message Replies",
      "Image Understanding",
      "Document Understanding",
      "WhatsApp Group Management",
      "Anti Spam",
      "Anti Link",
      "Forbidden Link Removal",
      "Automatic Member Kicking",
      "Welcome Messages",
      "Goodbye Messages",
      "Auto Role Assignment",
      "Auto Moderation",
      "AI Content Moderation",
      "Bad Word Filter",
      "Anti Flood",
      "Anti Scam Detection",
      "Poll Creation",
      "Auto Announcements",
      "Scheduled Messages",
      "Event Reminders",
      "Member Activity Logs",
      "Custom Admin Commands",
      "Backup & Restore",
      "Analytics Dashboard",
    ],
  },
  {
    id: "ai-studio",
    title: "AI Studio",
    eyebrow: "CREATIVE ENGINE",
    description:
      "Create professional images, videos, designs, voices, music, product photography, and complete creative assets.",
    icon: Sparkles,
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    capabilities: [
      "Image Generation",
      "Video Generation",
      "AI Video Editing",
      "Motion Control",
      "Upscaling",
      "Face Swap",
      "Background Removal",
      "AI Photoshoots",
      "Product Photography",
      "AI Avatars",
      "Voice Cloning",
      "Music Generation",
      "Logo Generator",
      "Brand Kit Generator",
      "Thumbnail Generator",
      "Poster Generator",
      "Flyer Generator",
      "Business Cards",
      "Mockups",
      "Clothing Mockups",
      "Packaging Mockups",
      "Social Media Kits",
    ],
  },
  {
    id: "marketing",
    title: "Marketing AI",
    eyebrow: "GROWTH ENGINE",
    description:
      "Plan, create, optimize, and measure marketing campaigns across the channels your business uses.",
    icon: Zap,
    gradient: "from-orange-500/20 via-orange-500/5 to-transparent",
    capabilities: [
      "Content Calendar",
      "AI Copywriting",
      "Blog Writer",
      "Email Marketing",
      "SMS Campaigns",
      "Facebook Ads",
      "Google Ads",
      "TikTok Ads",
      "Instagram Ads",
      "LinkedIn Content",
      "SEO Optimization",
      "Keyword Research",
      "Landing Page Builder",
      "Funnel Builder",
      "A/B Testing",
      "AI Marketing Analytics",
    ],
  },
  {
    id: "automation",
    title: "Automation Hub",
    eyebrow: "WORKFLOW ENGINE",
    description:
      "Build intelligent workflows that connect your tools, data, employees, customers, and business processes.",
    icon: Workflow,
    gradient: "from-cyan-500/20 via-cyan-500/5 to-transparent",
    capabilities: [
      "Workflow Builder",
      "Drag & Drop Automation",
      "CRM Automation",
      "Email Automation",
      "Invoice Automation",
      "Lead Automation",
      "Inventory Automation",
      "Calendar Automation",
      "API Connections",
      "Webhooks",
      "Scheduled Tasks",
      "Database Automation",
      "Custom AI Workflows",
    ],
  },
  {
    id: "commerce",
    title: "Commerce AI",
    eyebrow: "COMMERCE ENGINE",
    description:
      "Connect your stores and automate products, inventory, orders, pricing, upselling, and customer retention.",
    icon: ShoppingCart,
    gradient: "from-pink-500/20 via-pink-500/5 to-transparent",
    capabilities: [
      "Shopify Integration",
      "WooCommerce",
      "Etsy",
      "Amazon",
      "eBay",
      "TikTok Shop",
      "Product Descriptions",
      "Inventory Management",
      "Order Tracking",
      "AI Pricing",
      "AI Upselling",
      "AI Cross-selling",
      "AI Customer Retention",
    ],
  },
  {
    id: "crm",
    title: "CRM",
    eyebrow: "CUSTOMER INTELLIGENCE",
    description:
      "Manage customers, leads, deals, meetings, opportunities, and relationships from one intelligent workspace.",
    icon: Users,
    gradient: "from-indigo-500/20 via-indigo-500/5 to-transparent",
    capabilities: [
      "Customer Database",
      "Sales Pipeline",
      "Contact Management",
      "Lead Tracking",
      "Opportunities",
      "Deals",
      "Notes",
      "Tasks",
      "Meetings",
      "AI Insights",
      "Customer Health Score",
    ],
  },
  {
    id: "finance",
    title: "Finance",
    eyebrow: "FINANCIAL INTELLIGENCE",
    description:
      "Understand your business finances with intelligent reporting, expenses, invoices, budgets, and forecasting.",
    icon: CircleDollarSign,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    capabilities: [
      "Invoice Generator",
      "Expense Tracking",
      "Budget Planning",
      "Profit Dashboard",
      "Financial Reports",
      "Tax Preparation",
      "Payroll Support",
      "AI Financial Advisor",
    ],
  },
  {
    id: "hr",
    title: "HR",
    eyebrow: "PEOPLE OPERATIONS",
    description:
      "Manage employee operations, recruitment, onboarding, training, attendance, and performance.",
    icon: BriefcaseBusiness,
    gradient: "from-fuchsia-500/20 via-fuchsia-500/5 to-transparent",
    capabilities: [
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
    title: "Analytics",
    eyebrow: "BUSINESS INTELLIGENCE",
    description:
      "Turn business data into decisions with dashboards, AI reports, forecasting, KPIs, and customer insights.",
    icon: BarChart3,
    gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
    capabilities: [
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
    title: "Knowledge Hub",
    eyebrow: "COMPANY INTELLIGENCE",
    description:
      "Turn your company's documents, procedures, and knowledge into an AI-powered source of truth.",
    icon: FileText,
    gradient: "from-yellow-500/20 via-yellow-500/5 to-transparent",
    capabilities: [
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
    title: "Website Builder",
    eyebrow: "DIGITAL PRESENCE",
    description:
      "Create websites, stores, landing pages, blogs, booking systems, and digital experiences with AI.",
    icon: Globe,
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
    capabilities: [
      "Landing Pages",
      "Websites",
      "Blogs",
      "Portfolios",
      "Online Stores",
      "AI Design Suggestions",
      "SEO Optimization",
      "Forms",
      "Booking Pages",
    ],
  },
  {
    id: "marketplace",
    title: "Marketplace",
    eyebrow: "NEXUS ECONOMY",
    description:
      "Build a new revenue stream by selling digital products, AI systems, automations, designs, and services.",
    icon: Store,
    gradient: "from-purple-500/20 via-purple-500/5 to-transparent",
    capabilities: [
      "Sell AI Bots",
      "Sell Prompt Packs",
      "Sell Templates",
      "Sell Workflows",
      "Sell AI Employees",
      "Sell Websites",
      "Sell Landing Pages",
      "Sell Automation Packages",
      "Sell Voice Agents",
      "Sell Integrations",
      "Sell Designs",
      "Sell Mockups",
      "Sell Plugins",
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    eyebrow: "CONNECTED ECOSYSTEM",
    description:
      "Connect J10 NEXUS to the platforms, AI models, communication channels, and business tools you already use.",
    icon: Network,
    gradient: "from-blue-500/20 via-violet-500/10 to-transparent",
    capabilities: [
      "WhatsApp",
      "Discord",
      "Telegram",
      "Slack",
      "Shopify",
      "Stripe",
      "Gmail",
      "Outlook",
      "Google Drive",
      "Dropbox",
      "Notion",
      "Trello",
      "Asana",
      "Monday.com",
      "HubSpot",
      "Salesforce",
      "Zapier",
      "Make",
      "Meta",
      "TikTok",
      "X",
      "LinkedIn",
      "YouTube",
      "GitHub",
      "OpenAI",
      "Anthropic",
      "Gemini",
      "Claude",
      "Hugging Face",
      "Higgsfield",
      "Runway",
      "Pika",
      "Kling",
    ],
  },
];

const moduleDestinations: Record<string, string> = {
  "ai-employees": "/dashboard/ai-employees",
  whatsapp: "/dashboard/whatsapp",
  "ai-studio": "/dashboard/website",
  marketing: "/dashboard/marketing",
  automation: "/dashboard/automation",
  commerce: "/dashboard/crm",
  crm: "/dashboard/crm",
  finance: "/dashboard/finance",
  hr: "/dashboard/hr",
  analytics: "/dashboard/analytics",
  knowledge: "/dashboard/knowledge",
  website: "/dashboard/website",
  marketplace: "/login",
  integrations: "/dashboard/settings/integrations",
};

export default function Features() {
  const [activeModule, setActiveModule] = useState("ai-employees");

  const active =
    modules.find((module) => module.id === activeModule) ?? modules[0];

  const ActiveIcon = active.icon;

  return (
    <section
      id="features"
      className="relative overflow-hidden bg-[#09090B] py-32 text-white"
    >
      {/* BACKGROUND */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-15%] top-[5%] h-[550px] w-[550px] rounded-full bg-blue-600/[0.06] blur-[150px]" />
        <div className="absolute right-[-15%] top-[30%] h-[600px] w-[600px] rounded-full bg-violet-600/[0.05] blur-[160px]" />

        <div
          className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-6 lg:px-8">

        {/* HEADER */}
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-4 py-2 text-xs font-medium text-blue-300">
            <Sparkles size={14} />
            THE J10 NEXUS ECOSYSTEM
          </div>

          <h2 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
            Everything your business needs.
            <br />
            <span className="bg-gradient-to-r from-white via-blue-200 to-violet-300 bg-clip-text text-transparent">
              Connected by AI.
            </span>
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-500 sm:text-lg">
            One intelligent operating system for your workforce, customers,
            content, automation, commerce, data, and digital infrastructure.
          </p>
        </div>

        {/* MODULE NAVIGATION */}
        <div className="mt-20 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modules.map((module) => {
            const Icon = module.icon;
            const selected = module.id === activeModule;

            return (
              <button
                key={module.id}
                onClick={() => setActiveModule(module.id)}
                className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ${
                  selected
                    ? "border-blue-500/30 bg-gradient-to-br from-blue-500/[0.09] to-[#111216]"
                    : "border-white/[0.06] bg-[#111216] hover:-translate-y-0.5 hover:border-white/[0.12]"
                }`}
              >
                {selected && (
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
                )}

                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                      selected
                        ? "border-blue-500/20 bg-blue-500/10"
                        : "border-white/[0.07] bg-white/[0.03]"
                    }`}
                  >
                    <Icon
                      size={18}
                      className={
                        selected ? "text-blue-400" : "text-zinc-500"
                      }
                    />
                  </div>

                  <ChevronRight
                    size={16}
                    className={`transition-all ${
                      selected
                        ? "translate-x-0.5 text-blue-400"
                        : "text-zinc-700 group-hover:translate-x-0.5 group-hover:text-zinc-400"
                    }`}
                  />
                </div>

                <p className="mt-5 text-sm font-semibold">{module.title}</p>

                <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600">
                  {module.description}
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      selected ? "bg-blue-400" : "bg-zinc-700"
                    }`}
                  />

                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                    {module.capabilities.length} capabilities
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ACTIVE MODULE */}
        <div className="relative mt-8 overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#0E1015]">

          {/* Glow */}
          <div
            className={`pointer-events-none absolute right-[-180px] top-[-180px] h-[500px] w-[500px] rounded-full bg-gradient-to-br ${active.gradient} blur-[100px]`}
          />

          <div className="relative grid lg:grid-cols-[0.8fr_1.2fr]">

            {/* MODULE INFO */}
            <div className="border-b border-white/[0.06] p-8 sm:p-10 lg:border-b-0 lg:border-r lg:p-12">

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                  <ActiveIcon size={21} className="text-blue-400" />
                </div>

                <div>
                  <p className="text-[10px] font-medium tracking-[0.2em] text-blue-400">
                    {active.eyebrow}
                  </p>

                  <h3 className="mt-1 text-xl font-semibold">
                    {active.title}
                  </h3>
                </div>
              </div>

              <p className="mt-8 text-sm leading-7 text-zinc-500">
                {active.description}
              </p>

              <div className="mt-8 flex items-center gap-2 text-xs text-zinc-500">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Check size={13} className="text-emerald-400" />
                </div>

                <span>
                  {active.capabilities.length} capabilities available in the
                  J10 NEXUS ecosystem
                </span>
              </div>

              <Link href={moduleDestinations[active.id] ?? "/login"} className="group mt-8 flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition-all hover:-translate-y-0.5 hover:bg-zinc-200">
                Explore {active.title}

                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-1"
                />
              </Link>
            </div>

            {/* CAPABILITY GRID */}
            <div className="p-6 sm:p-8 lg:p-10">

              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    Capabilities
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    Everything included in this module
                  </p>
                </div>

                <div className="hidden items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 sm:flex">
                  <Search size={13} className="text-zinc-600" />
                  <span className="text-xs text-zinc-600">
                    Explore
                  </span>
                </div>
              </div>

              <div className="grid max-h-[540px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {active.capabilities.map((capability, index) => (
                  <div
                    key={`${active.id}-${capability}`}
                    className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.018] px-4 py-3 transition-all duration-200 hover:border-blue-500/20 hover:bg-blue-500/[0.045]"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.035]">
                      <Check
                        size={12}
                        className="text-zinc-600 transition-colors group-hover:text-blue-400"
                      />
                    </div>

                    <span className="text-xs text-zinc-400 transition-colors group-hover:text-zinc-200">
                      {capability}
                    </span>

                    <span className="ml-auto text-[9px] text-zinc-800">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SYSTEM STATEMENT */}
        <div className="relative mt-20 overflow-hidden rounded-[28px] border border-blue-500/10 bg-gradient-to-br from-blue-500/[0.07] via-violet-500/[0.035] to-transparent p-8 text-center sm:p-12">

          <div className="absolute left-1/2 top-[-120px] h-72 w-72 -translate-x-1/2 rounded-full bg-blue-500/10 blur-[110px]" />

          <div className="relative">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <LayoutDashboard size={20} className="text-blue-400" />
            </div>

            <h3 className="mx-auto mt-6 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Not a collection of AI tools.
              <br />
              <span className="text-zinc-500">
                One operating system for your business.
              </span>
            </h3>

            <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-zinc-600">
              J10 NEXUS brings AI employees, communication, creative
              production, automation, commerce, CRM, finance, HR, analytics,
              knowledge, websites, marketplaces, and integrations into one
              connected ecosystem.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {[
                "AI",
                "Automation",
                "Business Intelligence",
                "Commerce",
                "CRM",
                "Creative",
                "Knowledge",
                "Integrations",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 text-[10px] text-zinc-600"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
