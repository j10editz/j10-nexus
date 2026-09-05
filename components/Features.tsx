"use client";

import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cpu,
  Database,
  Eye,
  FileText,
  Globe,
  Headphones,
  KeyRound,
  Layers,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Network,
  Radio,
  Search,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Terminal,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export type ModuleCategory =
  | "all"
  | "intelligence"
  | "communication"
  | "operations"
  | "infrastructure";

export type Module = {
  id: string;
  title: string;
  category: ModuleCategory;
  eyebrow: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  accentColor: string;
  statusBadge: string;
  specs: { label: string; value: string }[];
  pipeline: { step: string; detail: string }[];
  capabilities: string[];
};

export const modules: Module[] = [
  {
    id: "ai-employees",
    title: "AI Employees",
    category: "intelligence",
    eyebrow: "AUTONOMOUS WORKFORCE",
    description:
      "Deploy specialized, persistent AI team members that execute real operations, qualify inbound prospects, triage customer needs, and run 24/7 with human-in-the-loop oversight.",
    icon: Bot,
    gradient: "from-blue-500/25 via-blue-600/10 to-transparent",
    accentColor: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    statusBadge: "WORKFORCE READY",
    specs: [
      { label: "Deployment", value: "Instant Pod" },
      { label: "Execution SLA", value: "< 1.4s" },
      { label: "Context Memory", value: "Persistent Graph" },
      { label: "Safety Gating", value: "Dual Approval" },
    ],
    pipeline: [
      { step: "Role Assignment", detail: "Configured with precise job scope and verified company facts" },
      { step: "Task Ingestion", detail: "Triggered via Webhook, CRM event, WhatsApp message, or schedule" },
      { step: "Dual-Mode Reasoning", detail: "Evaluates context through deterministic rules or high-reasoning LLMs" },
      { step: "Gated Execution", detail: "Protected actions require operator approval before side-effects occur" },
    ],
    capabilities: [
      "AI Customer Support Agent",
      "AI Sales Executive",
      "AI Front-Desk Receptionist",
      "AI HR & People Assistant",
      "AI Accounting & Invoice Auditor",
      "AI Executive Operations Assistant",
      "AI Legal & Compliance Analyst",
      "AI Technical Recruiting Assistant",
      "AI Project & Sprint Manager",
      "AI Market Research Specialist",
      "AI Email Communications Assistant",
      "AI Calendar & Appointment Scheduler",
      "AI Real-time Voice Agent",
      "AI Interactive Phone Agent",
      "AI Knowledge Base Specialist",
      "Custom Autonomous Agent Builder",
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp Business AI",
    category: "communication",
    eyebrow: "OMNICHANNEL MESSAGING",
    description:
      "The official Meta Cloud API enterprise hub. Connect your real business phone number via official Coexistence onboarding, generate supervised AI replies, and manage customer conversations securely.",
    icon: MessageSquare,
    gradient: "from-emerald-500/25 via-emerald-600/10 to-transparent",
    accentColor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    statusBadge: "META COEXISTENCE READY",
    specs: [
      { label: "API Protocol", value: "Meta Cloud v26.0" },
      { label: "Onboarding", value: "Embedded Signup" },
      { label: "Delivery Mode", value: "Supervised & Gated" },
      { label: "Data Integrity", value: "AES-256 Vault" },
    ],
    pipeline: [
      { step: "Signed Webhook", detail: "Meta delivers incoming messages with HMAC SHA256 signature verification" },
      { step: "Event Normalization", detail: "Payload parsed into canonical whatsapp.message.received format" },
      { step: "Company Brain Grounding", detail: "AI drafts replies strictly anchored in your verified business knowledge" },
      { step: "Human Approval Gate", detail: "Operator reviews, edits, and signs off with an expiring HMAC token" },
      { step: "Cloud Delivery", detail: "Idempotent dispatch to Meta Graph API with retry & delivery tracking" },
    ],
    capabilities: [
      "Official Meta Cloud API v26.0 Integration",
      "Embedded Signup Coexistence Flow",
      "AI Customer Support Automation",
      "Conversational Sales Agent",
      "Real-time AI Reply Suggestions",
      "Expiring Operator Approval Gates",
      "Customer Inbox & Multi-thread Triage",
      "Verified Business Knowledge Grounding",
      "Automated Appointment Reminders",
      "Order Tracking & Dispatch Updates",
      "Inbound Voice Message Transcription",
      "Media & Document Understanding",
      "Multi-Language Auto-Translation",
      "Product Catalog Recommendations",
      "Meta Approved Template Sender",
      "Community Broadcast Engine",
      "Anti-Spam & Anti-Flood Protection",
      "Zero-Leakage Credential Vault",
    ],
  },
  {
    id: "automation",
    title: "J10 Flow Automation",
    category: "operations",
    eyebrow: "EVENT-DRIVEN WORKFLOWS",
    description:
      "A resilient visual DAG workflow engine. Connect webhooks, CRM triggers, scheduled crons, and AI actions into self-healing, immutable pipelines with atomic versioning and human approval stops.",
    icon: Workflow,
    gradient: "from-cyan-500/25 via-cyan-600/10 to-transparent",
    accentColor: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
    statusBadge: "DAG ENGINE LIVE",
    specs: [
      { label: "Topology", value: "Directed Graph" },
      { label: "Snapshotting", value: "Immutable Versions" },
      { label: "Execution Lock", value: "Pessimistic DB" },
      { label: "Fail-over", value: "Exponential Retry" },
    ],
    pipeline: [
      { step: "Trigger Match", detail: "Ingests external webhook, cron schedule, or CRM database event" },
      { step: "Version Snapshot", detail: "Executes against an immutable, validated published workflow version" },
      { step: "Branching Logic", detail: "Evaluates context conditions, variables, and multi-AI handoffs" },
      { step: "Operator Approval", detail: "Pauses live side-effects until human operator submits cryptographic token" },
      { step: "Audit Commit", detail: "Step outcome, execution latency, and token costs recorded permanently" },
    ],
    capabilities: [
      "Visual Node-Based Flow Builder",
      "Immutable Published Version Snapshots",
      "Atomic Runtime Version Switching",
      "Event Context Memory & Variable Injection",
      "Complex Conditional Branching",
      "Human-in-the-loop Approval Stops",
      "Scheduler & Cron Automation",
      "Automatic Deduplication & Idempotency",
      "Exponential Backoff & Recovery Policies",
      "Webhook Pipeline Event Ingestion",
      "Cross-Module Workflow Handoffs",
      "Execution Trace & Step-by-Step History",
    ],
  },
  {
    id: "crm",
    title: "CRM & Customer Intelligence",
    category: "operations",
    eyebrow: "CUSTOMER INTELLIGENCE",
    description:
      "Manage contacts, deals, customer health scores, and sales velocity. AI continuously monitors pipeline stages, analyzes conversation transcripts, and surfaces high-urgency follow-ups.",
    icon: Users,
    gradient: "from-indigo-500/25 via-indigo-600/10 to-transparent",
    accentColor: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
    statusBadge: "PIPELINE ACTIVE",
    specs: [
      { label: "Data Model", value: "Row-Level Secured" },
      { label: "Scoring Engine", value: "AI + Heuristic" },
      { label: "Sync Engine", value: "Bi-directional" },
      { label: "Audit Trail", value: "Immutable Log" },
    ],
    pipeline: [
      { step: "Lead Capture", detail: "Automatically ingest prospects from WhatsApp, landing forms, or APIs" },
      { step: "Qualification", detail: "AI evaluates buying intent, deal size, and assigns priority score" },
      { step: "Pipeline Routing", detail: "Deals advance through verified stages with automatic notifications" },
      { step: "Outreach Suggestion", detail: "Strategic recommendations generated for high-value accounts" },
    ],
    capabilities: [
      "Unified Customer & Contact Database",
      "Visual Stage-Based Sales Pipelines",
      "Deal Value & Priority Scoring (0-100)",
      "Automated Follow-up Urgency Detection",
      "Conversation History Aggregation",
      "Customer Health & Churn Risk Metrics",
      "Meeting Notes & Action Item Extraction",
      "WhatsApp & Email Channel Synchronization",
      "Deterministic Sales Reasoning Engine",
      "Automated Lead Status Progression",
    ],
  },
  {
    id: "knowledge",
    title: "Company Brain & Knowledge",
    category: "intelligence",
    eyebrow: "UNIFIED TRUTH LAYER",
    description:
      "Upload company SOPs, product documentation, pricing tables, and guidelines once. The Company Brain anchors every AI employee and WhatsApp reply in verified business facts—preventing ungrounded responses.",
    icon: FileText,
    gradient: "from-amber-500/25 via-amber-600/10 to-transparent",
    accentColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    statusBadge: "SINGLE SOURCE OF TRUTH",
    specs: [
      { label: "Grounding", value: "Verified SOPs" },
      { label: "Sync", value: "Cross-Platform" },
      { label: "Format Support", value: "Markdown / PDF / Text" },
      { label: "Access Control", value: "Tenant-Isolated" },
    ],
    pipeline: [
      { step: "Document Ingestion", detail: "Upload SOPs, product catalogs, escalation policies, and guidelines" },
      { step: "Semantic Indexing", detail: "Information structured into fast, high-recall business facts" },
      { step: "Runtime Grounding", detail: "Injected as mandatory system instructions into every agent call" },
      { step: "Safety Verification", detail: "Guards against invented prices, fake policies, and unauthorized claims" },
    ],
    capabilities: [
      "Centralized Company Knowledge Hub",
      "Verified Business Facts Injection",
      "Fact-Checking Policy Enforcement",
      "SOP & Operating Procedure Builder",
      "Product Catalog & Pricing Grounding",
      "Brand Voice & Tone Customization",
      "Prohibited Claims & Legal Disclaimers",
      "Cross-Module Agent Synchronization",
    ],
  },
  {
    id: "finance",
    title: "Financial Operations",
    category: "operations",
    eyebrow: "REVENUE & INVOICING",
    description:
      "Unified financial cockpit. Generate compliant invoices, track recurring subscriptions, automate payment reminders, and analyze revenue velocity without toggling between separate accounting tools.",
    icon: CircleDollarSign,
    gradient: "from-emerald-500/25 via-teal-600/10 to-transparent",
    accentColor: "text-teal-400 border-teal-500/30 bg-teal-500/10",
    statusBadge: "APPEND-ONLY LEDGER",
    specs: [
      { label: "Currencies", value: "Multi-Currency" },
      { label: "Reminders", value: "WhatsApp / Email" },
      { label: "Entitlements", value: "Server-side Gate" },
      { label: "Security", value: "Encrypted Storage" },
    ],
    pipeline: [
      { step: "Invoice Generation", detail: "Generate detailed invoices directly from CRM deals or closed orders" },
      { step: "Automated Dispatch", detail: "Delivered via verified WhatsApp template or authenticated Gmail" },
      { step: "Payment Reconciliation", detail: "Monitors payment webhooks and updates workspace balance" },
      { step: "Dunning & Reminders", detail: "Graduated follow-ups sent before service grace periods expire" },
    ],
    capabilities: [
      "Automated Professional Invoice Generator",
      "Expense Logging & Category Breakdown",
      "Subscription Entitlement Enforcement",
      "Real-time MRR & ARR Dashboards",
      "Automated WhatsApp Payment Reminders",
      "Multi-Currency Transaction Support",
      "Financial Health & Burn-Rate Forecasts",
      "Audit-Ready Financial Exporting",
    ],
  },
  {
    id: "analytics",
    title: "Analytics & KPI Engine",
    category: "operations",
    eyebrow: "BUSINESS INTELLIGENCE",
    description:
      "Real-time operational telemetry. Monitor message deliverability, AI response latencies, automation throughput, integration error rates, and team productivity from one unified cockpit.",
    icon: BarChart3,
    gradient: "from-blue-500/25 via-indigo-600/10 to-transparent",
    accentColor: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    statusBadge: "STREAMING TELEMETRY",
    specs: [
      { label: "Telemetry", value: "Sub-Second" },
      { label: "Retention", value: "Enterprise DB" },
      { label: "Anomaly Alert", value: "Proactive" },
      { label: "Export", value: "CSV / JSON / API" },
    ],
    pipeline: [
      { step: "Event Stream", detail: "Ingests execution logs from webhooks, automations, and agent sessions" },
      { step: "Metric Aggregation", detail: "Calculates error ratios, response times, and conversion rates" },
      { step: "Visual Dashboard", detail: "Renders real-time interactive charts with date-range filters" },
      { step: "Operational Alerts", detail: "Notifies team when error thresholds or rate limits are breached" },
    ],
    capabilities: [
      "Real-time Operational Metrics Dashboard",
      "WhatsApp Delivery & Read-Rate Analytics",
      "AI Token Consumption & Cost Tracker",
      "Workflow Success & Failure Rates",
      "Sales Pipeline Velocity & Conversion",
      "Integration Health & Latency Monitor",
      "Anomaly Detection & Early Warning System",
      "Custom KPI Summary Reports",
    ],
  },
  {
    id: "security-governance",
    title: "Security & Governance",
    category: "infrastructure",
    eyebrow: "ENTERPRISE ASSURANCE",
    description:
      "Enterprise-grade security built directly into every layer. AES-256-GCM credential vault, Supabase Row-Level Security, HMAC operator approvals, audit logging, and strict tenant isolation.",
    icon: ShieldCheck,
    gradient: "from-violet-500/25 via-purple-600/10 to-transparent",
    accentColor: "text-violet-400 border-violet-500/30 bg-violet-500/10",
    statusBadge: "AES-256 ENCRYPTED",
    specs: [
      { label: "Cipher", value: "AES-256-GCM" },
      { label: "Isolation", value: "Supabase RLS" },
      { label: "Approval TTL", value: "10 Minutes" },
      { label: "Secret Leakage", value: "Zero in Logs" },
    ],
    pipeline: [
      { step: "Credential Vault", detail: "Tokens encrypted with key versioning before hitting the database" },
      { step: "RLS Enforcement", detail: "PostgreSQL row policies ensure zero cross-tenant data leakage" },
      { step: "HMAC Approval", detail: "Sensitive live actions signed with one-time expiring cryptographic tokens" },
      { step: "Header Redaction", detail: "Auth headers and bearer tokens stripped from telemetry logs" },
    ],
    capabilities: [
      "AES-256-GCM Encrypted Credential Vault",
      "PostgreSQL Multi-Tenant Row-Level Security",
      "Expiring HMAC Signed Operator Approvals",
      "Automatic Authorization Header Redaction",
      "Idempotency Locks for External Actions",
      "Audit Trail of All Sensitive Operations",
      "Strict Provider Capability Scoping",
      "Zero Public Client Secret Exposure",
    ],
  },
  {
    id: "integrations",
    title: "Integrations & Connectors",
    category: "infrastructure",
    eyebrow: "CONNECTED ECOSYSTEM",
    description:
      "Native connectors for Google Workspace (Gmail & Calendar OAuth with PKCE), Meta Cloud API, Slack, Stripe, and webhook pipelines. One unified registry with automated token refresh and health monitoring.",
    icon: Network,
    gradient: "from-blue-500/25 via-violet-500/10 to-transparent",
    accentColor: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
    statusBadge: "OAUTH + WEBHOOK BUS",
    specs: [
      { label: "Auth Protocols", value: "OAuth 2.0 + PKCE" },
      { label: "Health Checks", value: "Automated Ping" },
      { label: "Webhooks", value: "Signed Ingestion" },
      { label: "Sandbox", value: "$0 Acceptance" },
    ],
    pipeline: [
      { step: "Registry Resolution", detail: "Matches connector against standardized capability contracts" },
      { step: "OAuth Handshake", detail: "Secure authorization code exchange with server-side PKCE verification" },
      { step: "Credential Encryption", detail: "Access & refresh tokens stored safely in the encrypted envelope" },
      { step: "Runtime Action Dispatch", detail: "Actions executed with automated rate-limiting and retry policies" },
    ],
    capabilities: [
      "Meta WhatsApp Cloud API Connector",
      "Gmail OAuth & Email Dispatch",
      "Google Calendar Event Scheduler",
      "Generic Inbound Webhook Pipeline",
      "Provider Health Check & Ping Engine",
      "Automated Token Refresh Cycle",
      "Zero-Cost Integration Sandbox",
      "Rate-Limit & Retry-After Handling",
    ],
  },
  {
    id: "marketing",
    title: "Marketing & Growth AI",
    category: "communication",
    eyebrow: "GROWTH ENGINE",
    description:
      "Plan, draft, and coordinate multi-channel marketing campaigns. Generate high-converting copy, schedule social announcements, and align promotional messaging with your central Company Brain.",
    icon: Zap,
    gradient: "from-orange-500/25 via-amber-600/10 to-transparent",
    accentColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    statusBadge: "GROWTH ENGINE",
    specs: [
      { label: "Channels", value: "Multi-Platform" },
      { label: "Tone Match", value: "Brand Aligned" },
      { label: "SEO Engine", value: "High Intent" },
      { label: "Output", value: "Structured Drafts" },
    ],
    pipeline: [
      { step: "Campaign Strategy", detail: "Define goal, target demographic, and core promotional offer" },
      { step: "Copy Generation", detail: "AI generates cohesive ad copy, social posts, and email sequences" },
      { step: "Asset Alignment", detail: "Verifies messaging consistency against your Company Brain guidelines" },
      { step: "Multi-Channel Push", detail: "Broadcasts coordinated updates across integrated customer touchpoints" },
    ],
    capabilities: [
      "Multi-Channel Content Calendar",
      "High-Conversion Ad Copy Generator",
      "SEO Blog & Article Drafting",
      "Email Marketing Sequence Builder",
      "WhatsApp Promotional Broadcasts",
      "Brand Voice Consistency Verifier",
      "Headline & Hook A/B Test Generator",
      "Campaign Performance Analysis",
    ],
  },
  {
    id: "ai-studio",
    title: "AI Creative Studio",
    category: "intelligence",
    eyebrow: "CREATIVE ENGINE",
    description:
      "Generate commercial design assets, product photography mockups, banners, avatars, and marketing collateral powered by state-of-the-art vision models directly inside your workspace.",
    icon: Sparkles,
    gradient: "from-violet-500/25 via-fuchsia-600/10 to-transparent",
    accentColor: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10",
    statusBadge: "CREATIVE ENGINE",
    specs: [
      { label: "Vision Models", value: "Multimodal" },
      { label: "Resolution", value: "High Fidelity" },
      { label: "Branding", value: "Custom Brand Kit" },
      { label: "Export", value: "PNG / WebP / SVG" },
    ],
    pipeline: [
      { step: "Creative Brief", detail: "Input product details, style requirements, and target canvas dimensions" },
      { step: "Brand Kit Sync", detail: "Applies saved corporate palette, font pairings, and logos" },
      { step: "Generative Render", detail: "Generates high-definition commercial visual mockups and designs" },
      { step: "Asset Catalog", detail: "Saves outputs directly to your workspace media library for instant reuse" },
    ],
    capabilities: [
      "Commercial Product Photography",
      "Brand Identity & Logo Generator",
      "Social Media Graphic Templates",
      "Marketing Banner & Poster Creator",
      "High-Resolution Image Upscaling",
      "Background Clean & Removal Tool",
      "Packaging & Merchandise Mockups",
      "Direct Workspace Media Storage",
    ],
  },
  {
    id: "website",
    title: "AI Website & Funnel Builder",
    category: "communication",
    eyebrow: "DIGITAL PRESENCE",
    description:
      "Create high-performance, conversion-optimized landing pages, booking portals, and online store fronts connected directly to your J10 CRM, WhatsApp bot, and payment gateways.",
    icon: Globe,
    gradient: "from-sky-500/25 via-blue-600/10 to-transparent",
    accentColor: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    statusBadge: "WEB RUNTIME",
    specs: [
      { label: "Stack", value: "Next.js / Edge" },
      { label: "Forms", value: "Auto-CRM Linked" },
      { label: "Speed Score", value: "98+ Lighthouse" },
      { label: "Security", value: "Auto SSL" },
    ],
    pipeline: [
      { step: "Structure Prompt", detail: "Describe business offerings, value propositions, and calls to action" },
      { step: "Layout Synthesis", detail: "Generates responsive, accessible, high-speed page sections" },
      { step: "Form Integration", detail: "Binds inbound contact forms directly to your J10 CRM & WhatsApp triage" },
      { step: "Instant Publish", detail: "Deploys to global edge infrastructure with custom domain mapping" },
    ],
    capabilities: [
      "AI Landing Page & Site Generator",
      "Direct CRM Form Integration",
      "Appointment Booking Calendars",
      "Mobile-Responsive Layout Architecture",
      "SEO Meta-Tag Optimization",
      "Custom Domain Management",
      "Speed-Optimized Edge Asset Delivery",
      "Integrated Payment & Order Capture",
    ],
  },
  {
    id: "hr",
    title: "HR & Team Operations",
    category: "operations",
    eyebrow: "PEOPLE OPERATIONS",
    description:
      "Streamline internal team onboarding, role definitions, applicant triage, and employee queries. AI assistants answer policy questions and summarize interviews.",
    icon: BriefcaseBusiness,
    gradient: "from-fuchsia-500/25 via-pink-600/10 to-transparent",
    accentColor: "text-pink-400 border-pink-500/30 bg-pink-500/10",
    statusBadge: "TEAM OPS",
    specs: [
      { label: "Onboarding", value: "Automated Flow" },
      { label: "Privacy", value: "Role Protected" },
      { label: "SOP Bot", value: "Interactive" },
      { label: "Directory", value: "Centralized" },
    ],
    pipeline: [
      { step: "Applicant Review", detail: "AI structures incoming resumes against specific job scorecards" },
      { step: "Onboarding Checklist", detail: "Automated workflow distributes accounts, SOPs, and team guides" },
      { step: "Policy Assistant", detail: "Answers internal team policy inquiries using verified company handbook" },
      { step: "Review Cycle", detail: "Coordinates recurring 360 performance reviews and goal tracking" },
    ],
    capabilities: [
      "Candidate Resume Screening & Scoring",
      "Automated Employee Onboarding Workflows",
      "Internal HR Policy Question Answering",
      "Team Directory & Role Assignment",
      "Performance Review Milestone Tracking",
      "Interview Scheduling & Follow-ups",
      "Attendance & Leave Request Logs",
      "Confidential Role-Based Access Control",
    ],
  },
  {
    id: "commerce",
    title: "Commerce & Store Engine",
    category: "operations",
    eyebrow: "COMMERCE AUTOMATION",
    description:
      "Automate product descriptions, inventory sync, order status notifications via WhatsApp, and customer re-engagement without tedious manual store administration.",
    icon: ShoppingCart,
    gradient: "from-rose-500/25 via-red-600/10 to-transparent",
    accentColor: "text-rose-400 border-rose-500/30 bg-rose-500/10",
    statusBadge: "COMMERCE SYNC",
    specs: [
      { label: "Sync Type", value: "Real-time Webhook" },
      { label: "Channels", value: "Shopify / Custom" },
      { label: "Notifications", value: "WhatsApp / SMS" },
      { label: "Tracking", value: "Order-level" },
    ],
    pipeline: [
      { step: "Order Webhook", detail: "Receives purchase event from ecommerce store or payment link" },
      { step: "Inventory Update", detail: "Adjusts stock levels across internal records automatically" },
      { step: "WhatsApp Notification", detail: "Sends branded receipt and tracking link via Meta Cloud API" },
      { step: "Post-Sale Flow", detail: "Triggers automated feedback or cross-sell recommendation after delivery" },
    ],
    capabilities: [
      "Shopify & Custom Store Webhook Ingestion",
      "Automated WhatsApp Order Confirmation",
      "Package Tracking & Dispatch Updates",
      "AI-Generated Product Copy & SEO",
      "Inventory Depletion & Restock Alerts",
      "Customer Retention & Repeat-Purchase Flows",
      "Abandoned Cart Recovery Triggers",
      "Omnichannel Purchase Reconciliation",
    ],
  },
];

export const moduleDestinations: Record<string, string> = {
  "ai-employees": "/dashboard/ai-employees",
  whatsapp: "/dashboard/whatsapp",
  automation: "/dashboard/automation",
  crm: "/dashboard/crm",
  knowledge: "/dashboard/knowledge",
  finance: "/dashboard/finance",
  analytics: "/dashboard/analytics",
  "security-governance": "/dashboard/settings",
  integrations: "/dashboard/settings/integrations",
  marketing: "/dashboard/marketing",
  "ai-studio": "/dashboard/website",
  website: "/dashboard/website",
  hr: "/dashboard/hr",
  commerce: "/dashboard/crm",
  marketplace: "/login",
};

export default function Features() {
  const [activeCategory, setActiveCategory] = useState<ModuleCategory>("all");
  const [activeModule, setActiveModule] = useState<string>("whatsapp");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeConsoleTab, setActiveConsoleTab] = useState<"pipeline" | "specs" | "capabilities">("pipeline");

  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      const matchesCategory = activeCategory === "all" || m.category === activeCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.capabilities.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  const active = useMemo(() => {
    return modules.find((m) => m.id === activeModule) ?? filteredModules[0] ?? modules[0];
  }, [activeModule, filteredModules]);

  const ActiveIcon = active.icon;

  return (
    <section id="features" className="relative overflow-hidden bg-[#09090B] py-28 text-white">
      {/* BACKGROUND ACCENTS */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[8%] h-[600px] w-[600px] rounded-full bg-blue-600/[0.05] blur-[160px]" />
        <div className="absolute right-[-10%] top-[25%] h-[650px] w-[650px] rounded-full bg-violet-600/[0.04] blur-[180px]" />
        <div className="absolute left-[30%] bottom-[10%] h-[500px] w-[500px] rounded-full bg-emerald-600/[0.03] blur-[170px]" />

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-6 lg:px-8">
        {/* HEADER */}
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-4 py-1.5 text-xs font-medium text-blue-300">
            <Sparkles size={13} className="text-blue-400" />
            <span>THE ALL-IN-ONE BUSINESS OPERATING SYSTEM</span>
          </div>

          <h2 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
            Everything your business needs.
            <br />
            <span className="bg-gradient-to-r from-white via-blue-100 to-violet-300 bg-clip-text text-transparent">
              Connected by AI.
            </span>
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            Not a disconnected folder of SaaS tools. One integrated command architecture where your AI workforce,
            WhatsApp communication, CRM, automations, and data operate as a single system.
          </p>
        </div>

        {/* SYSTEM STATS TICKER */}
        <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-center backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">CANONICAL ENGINE</p>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">One Core Runtime</p>
            <p className="mt-1 text-[11px] text-zinc-400">Zero duplicate schedulers</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-center backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">META CLOUD READY</p>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">Official API v26</p>
            <p className="mt-1 text-[11px] text-zinc-400">Coexistence onboarding</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-center backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400">DATA PRIVACY</p>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">AES-256-GCM</p>
            <p className="mt-1 text-[11px] text-zinc-400">Row-Level Security isolated</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-center backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400">SAFETY FIRST</p>
            <p className="mt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">Human In The Loop</p>
            <p className="mt-1 text-[11px] text-zinc-400">HMAC-signed approvals</p>
          </div>
        </div>

        {/* CONTROLS BAR: CATEGORY FILTER & SEARCH */}
        <div className="mt-14 flex flex-col gap-4 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All Systems" },
              { id: "intelligence", label: "AI & Workforce" },
              { id: "communication", label: "WhatsApp & Growth" },
              { id: "operations", label: "Operations & CRM" },
              { id: "infrastructure", label: "Security & Cloud" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id as ModuleCategory)}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  activeCategory === tab.id
                    ? "bg-white text-black shadow-lg shadow-white/10"
                    : "border border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/[0.12] hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search features, modules, capabilities..."
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-white placeholder:text-zinc-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>
        </div>

        {/* MODULE CARDS GRID */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredModules.map((module) => {
            const Icon = module.icon;
            const selected = module.id === active.id;
            const destination = moduleDestinations[module.id] ?? "/login";

            return (
              <div
                key={module.id}
                onClick={() => setActiveModule(module.id)}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 cursor-pointer ${
                  selected
                    ? "border-blue-500/50 bg-gradient-to-br from-blue-500/[0.12] via-[#111216] to-[#0E1015] shadow-xl shadow-blue-950/20"
                    : "border-white/[0.07] bg-[#111216]/90 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-[#15171D]"
                }`}
              >
                {/* ACTIVE GLOW ACCENT */}
                {selected && (
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
                )}

                <div>
                  {/* CARD TOP ROW */}
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                        selected
                          ? module.accentColor
                          : "border-white/[0.08] bg-white/[0.03] text-zinc-400 group-hover:text-white"
                      }`}
                    >
                      <Icon size={19} />
                    </div>

                    <span
                      className={`rounded-md px-2 py-0.5 text-[9px] font-semibold tracking-wider ${
                        selected
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          : "bg-white/[0.04] text-zinc-500 border border-white/[0.05]"
                      }`}
                    >
                      {module.statusBadge}
                    </span>
                  </div>

                  {/* CARD TITLE & DESCRIPTION */}
                  <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    {module.eyebrow}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-white group-hover:text-blue-300 transition-colors">
                    {module.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
                    {module.description}
                  </p>

                  {/* CAPABILITY COUNTER PILL */}
                  <div className="mt-4 flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-blue-400 animate-pulse" : "bg-zinc-600"}`} />
                    <span className="text-[11px] font-medium text-zinc-400">
                      {module.capabilities.length} capabilities included
                    </span>
                  </div>
                </div>

                {/* CARD FOOTER DUAL CONTROLS (CLARITY FIX) */}
                <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 group-hover:text-zinc-200">
                    <Eye size={12} className="text-zinc-500" />
                    {selected ? "Active in console" : "Inspect"}
                  </span>

                  <Link
                    href={destination}
                    onClick={(e) => e.stopPropagation()}
                    className="group/link inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-zinc-200 transition-all hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-white"
                  >
                    <span>Open</span>
                    <ArrowUpRight size={12} className="text-zinc-400 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 group-hover/link:text-blue-300" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* INTERACTIVE WORKSTATION CONSOLE */}
        <div className="relative mt-12 overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0E1015] shadow-2xl shadow-black/80">
          {/* Subtle Dynamic Ambient Glow */}
          <div
            className={`pointer-events-none absolute right-[-150px] top-[-150px] h-[550px] w-[550px] rounded-full bg-gradient-to-br ${active.gradient} blur-[120px] transition-all duration-700`}
          />

          {/* CONSOLE TOP BAR */}
          <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] bg-white/[0.015] px-6 py-4 sm:flex-row sm:items-center sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                <ActiveIcon size={20} className="text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">
                    {active.eyebrow}
                  </span>
                  <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
                    {active.statusBadge}
                  </span>
                </div>
                <h3 className="text-xl font-bold tracking-tight text-white">{active.title} Workstation</h3>
              </div>
            </div>

            {/* TAB SELECTOR */}
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setActiveConsoleTab("pipeline")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeConsoleTab === "pipeline"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Runtime Pipeline
              </button>
              <button
                type="button"
                onClick={() => setActiveConsoleTab("specs")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeConsoleTab === "specs"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Architecture Specs
              </button>
              <button
                type="button"
                onClick={() => setActiveConsoleTab("capabilities")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeConsoleTab === "capabilities"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                All Capabilities ({active.capabilities.length})
              </button>
            </div>
          </div>

          {/* CONSOLE MAIN BODY */}
          <div className="relative grid lg:grid-cols-[0.8fr_1.2fr]">
            {/* LEFT PANE: DESCRIPTION & LAUNCH */}
            <div className="border-b border-white/[0.07] p-8 sm:p-10 lg:border-b-0 lg:border-r lg:p-10">
              <p className="text-sm leading-7 text-zinc-300">{active.description}</p>

              {/* QUICK SPECS CHIPS */}
              <div className="mt-8 grid grid-cols-2 gap-2.5">
                {active.specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/[0.1]"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">{spec.label}</p>
                    <p className="mt-1 text-xs font-semibold text-white">{spec.value}</p>
                  </div>
                ))}
              </div>

              {/* GUARANTEE BADGE */}
              <div className="mt-8 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5 text-xs text-emerald-300">
                <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
                <span>Zero cross-tenant exposure. Fully verified through Supabase Row-Level Security.</span>
              </div>

              {/* DIRECT ACTION BUTTON (PRESERVES EXISTING CONTRACT) */}
              <div className="mt-8">
                <Link
                  href={moduleDestinations[active.id] ?? "/login"}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200 shadow-xl shadow-white/10"
                >
                  <span>Explore {active.title}</span>
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <p className="mt-2 text-center text-[11px] text-zinc-500">
                  Direct workspace destination: {moduleDestinations[active.id] ?? "/login"}
                </p>
              </div>
            </div>

            {/* RIGHT PANE: DYNAMIC TAB VIEW */}
            <div className="p-6 sm:p-8 lg:p-10">
              {/* TAB 1: RUNTIME PIPELINE */}
              {activeConsoleTab === "pipeline" && (
                <div className="space-y-3">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Step-By-Step Execution Flow
                    </p>
                    <p className="text-xs text-zinc-500">
                      How requests and events are processed deterministically inside {active.title}
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {active.pipeline.map((item, idx) => (
                      <div
                        key={item.step}
                        className="flex items-start gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition hover:border-blue-500/30 hover:bg-blue-500/[0.03]"
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-[11px] font-bold text-blue-400">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{item.step}</p>
                          <p className="mt-0.5 text-xs leading-5 text-zinc-400">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: SPECS TABLE */}
              {activeConsoleTab === "specs" && (
                <div>
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      System & Security Specs
                    </p>
                    <p className="text-xs text-zinc-500">
                      Production engineering parameters for enterprise deployments
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/[0.07] bg-white/[0.02] text-[10px] uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-4 py-2.5">Parameter</th>
                          <th className="px-4 py-2.5">Production Standard</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                        {active.specs.map((s) => (
                          <tr key={s.label} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-3 font-medium text-white">{s.label}</td>
                            <td className="px-4 py-3 text-zinc-400 font-mono text-[11px]">{s.value}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="px-4 py-3 font-medium text-white">Database Tenancy</td>
                          <td className="px-4 py-3 text-zinc-400 font-mono text-[11px]">User & Workspace Scoped RLS</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 font-medium text-white">Credential Vault</td>
                          <td className="px-4 py-3 text-zinc-400 font-mono text-[11px]">AES-256-GCM / Ephemeral Keys</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 font-medium text-white">Execution Safety</td>
                          <td className="px-4 py-3 text-zinc-400 font-mono text-[11px]">HMAC Token Gate Required</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: CAPABILITIES GRID */}
              {activeConsoleTab === "capabilities" && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Included Capabilities
                      </p>
                      <p className="text-xs text-zinc-500">
                        Available in the J10 NEXUS business operating ecosystem
                      </p>
                    </div>
                    <span className="rounded-md bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-400">
                      {active.capabilities.length} Features
                    </span>
                  </div>

                  <div className="grid max-h-[380px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {active.capabilities.map((cap, i) => (
                      <div
                        key={cap}
                        className="flex items-center gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.018] px-3.5 py-2.5 text-xs text-zinc-300 transition hover:border-blue-500/25 hover:bg-blue-500/[0.04] hover:text-white"
                      >
                        <Check size={13} className="shrink-0 text-emerald-400" />
                        <span className="truncate">{cap}</span>
                        <span className="ml-auto text-[9px] text-zinc-600 font-mono">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ARCHITECTURAL STATEMENT: THE "COMPANY BRAIN" NEXUS */}
        <div className="relative mt-20 overflow-hidden rounded-[28px] border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.09] via-violet-500/[0.04] to-transparent p-8 text-center sm:p-12">
          <div className="absolute left-1/2 top-[-100px] h-64 w-64 -translate-x-1/2 rounded-full bg-blue-500/15 blur-[100px]" />

          <div className="relative mx-auto max-w-3xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
              <Brain size={22} className="text-blue-400" />
            </div>

            <h3 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Not a random collection of AI tools.
              <br />
              <span className="bg-gradient-to-r from-blue-200 via-indigo-200 to-violet-300 bg-clip-text text-transparent">
                One connected Operating System.
              </span>
            </h3>

            <p className="mt-5 text-sm leading-7 text-zinc-400">
              When a lead messages your WhatsApp, your AI Sales Agent qualifies them using verified Company Knowledge,
              creates the deal in your CRM, triggers an automated onboarding workflow in J10 Flow, generates an invoice in
              Finance, and alerts your team—all without leaving the single J10 NEXUS workspace.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {[
                "Unified Company Brain",
                "Official WhatsApp Cloud API",
                "Deterministic + Live AI",
                "HMAC Gated Approvals",
                "AES-256-GCM Vault",
                "Multi-Tenant PostgreSQL RLS",
                "DAG Visual Workflow Engine",
                "Automated Recovery",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-medium text-zinc-300"
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
