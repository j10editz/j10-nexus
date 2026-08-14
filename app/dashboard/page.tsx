"use client";

import {
  ArrowRight,
  Bot,
  Brain,
  Check,
  ChevronRight,
  Globe,
  Layers3,
  MessageSquare,
  Play,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";

const platformModules = [
  {
    title: "AI Employees",
    description:
      "Deploy intelligent digital employees that handle real business tasks around the clock.",
    icon: Bot,
    gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
    iconColor: "text-blue-400",
  },
  {
    title: "WhatsApp AI",
    description:
      "Turn WhatsApp into an intelligent business communication and automation system.",
    icon: MessageSquare,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    iconColor: "text-emerald-400",
  },
  {
    title: "AI Studio",
    description:
      "Create images, videos, marketing assets, product visuals and more with AI.",
    icon: Sparkles,
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    iconColor: "text-violet-400",
  },
  {
    title: "Automation",
    description:
      "Connect your tools and automate repetitive business processes without code.",
    icon: Workflow,
    gradient: "from-cyan-500/20 via-cyan-500/5 to-transparent",
    iconColor: "text-cyan-400",
  },
  {
    title: "Business Operations",
    description:
      "Manage CRM, commerce, finance, HR, analytics and operations from one place.",
    icon: Layers3,
    gradient: "from-orange-500/20 via-orange-500/5 to-transparent",
    iconColor: "text-orange-400",
  },
  {
    title: "Knowledge Hub",
    description:
      "Give J10 AI access to your documents, processes, knowledge and company information.",
    icon: Brain,
    gradient: "from-pink-500/20 via-pink-500/5 to-transparent",
    iconColor: "text-pink-400",
  },
];

const integrations = [
  "WhatsApp",
  "Shopify",
  "Stripe",
  "Gmail",
  "Slack",
  "Discord",
  "Google Drive",
  "Notion",
  "HubSpot",
  "Salesforce",
  "GitHub",
  "OpenAI",
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#09090B] text-white">

      {/* BACKGROUND */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-300px] h-[700px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/[0.08] blur-[140px]" />

        <div className="absolute right-[-200px] top-[700px] h-[500px] w-[500px] rounded-full bg-violet-600/[0.06] blur-[130px]" />

        <div className="absolute left-[-200px] top-[1500px] h-[500px] w-[500px] rounded-full bg-cyan-500/[0.05] blur-[130px]" />
      </div>

      {/* NAVBAR */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.06] bg-[#09090B]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">

          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <span className="text-sm font-bold">J</span>
            </div>

            <span className="text-sm font-semibold tracking-wide">
              J10 NEXUS
            </span>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#platform"
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              Platform
            </a>

            <a
              href="#intelligence"
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              J10 AI
            </a>

            <a
              href="#integrations"
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              Integrations
            </a>

            <a
              href="#pricing"
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <button className="hidden text-sm text-zinc-400 transition-colors hover:text-white sm:block">
              Log in
            </button>

            <a
              href="/dashboard"
              className="group flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-zinc-200"
            >
              Start Building

              <ArrowRight
                size={15}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative px-6 pb-20 pt-36 md:pb-28 md:pt-44">
        <div className="mx-auto max-w-6xl text-center">

          <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.07] px-3.5 py-1.5 text-xs font-medium text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)]" />

            J10 AI Operating System
          </div>

          <h1 className="mx-auto max-w-5xl text-5xl font-semibold tracking-[-0.04em] md:text-7xl lg:text-[84px] lg:leading-[0.98]">
            One operating system
            <br />

            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
              for your entire business.
            </span>
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">
            Build AI employees, automate workflows, create content,
            manage customers, connect your tools and grow your business
            from one intelligent platform.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">

            <a
              href="/dashboard"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-black shadow-xl shadow-white/[0.05] transition-all hover:bg-zinc-200 sm:w-auto"
            >
              Start Building

              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>

            <a
              href="#platform"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.07] sm:w-auto"
            >
              Explore Platform

              <ChevronRight size={16} />
            </a>

          </div>

          <div className="mt-5 flex items-center justify-center gap-5 text-xs text-zinc-600">
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-emerald-400" />
              No credit card required
            </span>

            <span className="hidden h-3 w-px bg-white/10 sm:block" />

            <span>Build faster with AI</span>
          </div>
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section className="px-6 pb-28">
        <div className="mx-auto max-w-6xl">

          <div className="relative rounded-2xl border border-white/[0.08] bg-[#111216] p-2 shadow-2xl shadow-black/40">

            <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#09090B]">

              {/* WINDOW BAR */}
              <div className="flex h-10 items-center gap-2 border-b border-white/[0.06] px-4">
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />

                <div className="mx-auto hidden rounded-md border border-white/[0.06] bg-white/[0.02] px-20 py-1 text-[10px] text-zinc-700 md:block">
                  app.j10nexus.com
                </div>
              </div>

              <div className="grid min-h-[430px] grid-cols-[180px_1fr]">

                {/* MINI SIDEBAR */}
                <div className="hidden border-r border-white/[0.06] bg-[#0d0e11] p-4 sm:block">

                  <div className="mb-7 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
                      <span className="text-xs font-bold">J</span>
                    </div>

                    <span className="text-xs font-semibold">
                      J10 NEXUS
                    </span>
                  </div>

                  <div className="space-y-1">
                    {[
                      "Dashboard",
                      "AI Employees",
                      "WhatsApp AI",
                      "AI Studio",
                      "Automation",
                      "CRM",
                      "Analytics",
                      "Marketplace",
                    ].map((item, index) => (
                      <div
                        key={item}
                        className={`rounded-lg px-3 py-2 text-[11px] ${
                          index === 0
                            ? "bg-blue-500/10 text-blue-300"
                            : "text-zinc-600"
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                {/* MINI DASHBOARD */}
                <div className="p-6 md:p-8">

                  <div className="mb-7 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                        Overview
                      </p>

                      <h3 className="mt-1 text-xl font-semibold">
                        Welcome back
                      </h3>
                    </div>

                    <div className="hidden rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[10px] text-zinc-500 sm:block">
                      J10 AI Online
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">

                    {[
                      ["Revenue", "$24,500"],
                      ["AI Employees", "12"],
                      ["Automations", "48"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-white/[0.06] bg-[#111216] p-4"
                      >
                        <p className="text-[10px] text-zinc-600">
                          {label}
                        </p>

                        <p className="mt-2 text-lg font-semibold">
                          {value}
                        </p>

                        <p className="mt-1 text-[9px] text-emerald-400">
                          +18.4%
                        </p>
                      </div>
                    ))}

                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr]">

                    <div className="rounded-xl border border-blue-500/10 bg-gradient-to-br from-blue-500/[0.08] to-violet-500/[0.03] p-5">

                      <div className="flex items-center gap-2">
                        <Sparkles
                          size={14}
                          className="text-blue-400"
                        />

                        <span className="text-[10px] font-medium text-blue-300">
                          J10 AI INSIGHT
                        </span>
                      </div>

                      <p className="mt-4 max-w-sm text-sm font-medium">
                        Your business has an opportunity to recover
                        14 abandoned carts.
                      </p>

                      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                        <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-blue-500 to-violet-500" />
                      </div>

                    </div>

                    <div className="rounded-xl border border-white/[0.06] bg-[#111216] p-5">

                      <p className="text-[10px] text-zinc-600">
                        Recent Activity
                      </p>

                      <div className="mt-4 space-y-3">

                        {[
                          "AI Employee completed task",
                          "New order received",
                          "Workflow completed",
                        ].map((activity) => (
                          <div
                            key={activity}
                            className="flex items-center gap-2"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />

                            <span className="truncate text-[10px] text-zinc-500">
                              {activity}
                            </span>
                          </div>
                        ))}

                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-zinc-700">
            One platform. One intelligent operating system.
          </p>
        </div>
      </section>

      {/* PLATFORM */}
      <section id="platform" className="border-t border-white/[0.06] px-6 py-28">

        <div className="mx-auto max-w-6xl">

          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-400">
              The Platform
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
              Everything your business needs.
            </h2>

            <p className="mt-5 text-base leading-7 text-zinc-500">
              J10 NEXUS brings your AI, automation, creative tools,
              customers and business operations into one connected system.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">

            {platformModules.map((module) => {
              const Icon = module.icon;

              return (
                <div
                  key={module.title}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111216] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.12]"
                >

                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${module.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                  />

                  <div className="relative">

                    <div className="flex items-center justify-between">

                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
                        <Icon
                          size={19}
                          className={module.iconColor}
                        />
                      </div>

                      <ArrowRight
                        size={16}
                        className="text-zinc-700 transition-all group-hover:translate-x-1 group-hover:text-white"
                      />

                    </div>

                    <h3 className="mt-6 text-base font-semibold">
                      {module.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      {module.description}
                    </p>

                  </div>
                </div>
              );
            })}

          </div>
        </div>
      </section>

      {/* J10 AI */}
      <section
        id="intelligence"
        className="relative overflow-hidden border-y border-white/[0.06] px-6 py-32"
      >

        <div className="absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/[0.07] blur-[130px]" />

        <div className="relative mx-auto max-w-6xl">

          <div className="grid items-center gap-16 lg:grid-cols-2">

            <div>

              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
                <Sparkles size={20} />
              </div>

              <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-400">
                J10 Intelligence
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                Intelligence behind everything.
              </h2>

              <p className="mt-5 max-w-xl text-base leading-7 text-zinc-500">
                J10 AI connects your business data, tools, workflows and
                employees into one intelligent layer that can understand,
                recommend and execute.
              </p>

              <div className="mt-8 space-y-3">

                {[
                  "Understand your business",
                  "Analyze information",
                  "Recommend actions",
                  "Execute workflows",
                  "Learn from results",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 text-sm text-zinc-400"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10">
                      <Check
                        size={13}
                        className="text-blue-400"
                      />
                    </div>

                    {item}
                  </div>
                ))}

              </div>
            </div>

            <div className="relative">

              <div className="rounded-2xl border border-blue-500/15 bg-[#111216] p-2 shadow-2xl shadow-blue-950/20">

                <div className="rounded-xl border border-white/[0.06] bg-[#0c0d10] p-6">

                  <div className="flex items-center gap-3">

                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                      <Sparkles size={17} />
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        J10 AI
                      </p>

                      <p className="text-[10px] text-emerald-400">
                        Intelligence online
                      </p>
                    </div>

                  </div>

                  <div className="mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">

                    <p className="text-xs text-zinc-600">
                      Business request
                    </p>

                    <p className="mt-2 text-sm text-zinc-300">
                      &quot;Help me increase sales this week.&quot;
                    </p>

                  </div>

                  <div className="my-4 flex justify-center">
                    <div className="h-8 w-px bg-gradient-to-b from-blue-500/50 to-violet-500/50" />
                  </div>

                  <div className="space-y-2">

                    {[
                      "Analyze sales data",
                      "Find abandoned carts",
                      "Create follow-up campaign",
                      "Launch workflow",
                    ].map((item, index) => (
                      <div
                        key={item}
                        className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3"
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-[10px] text-blue-400">
                          0{index + 1}
                        </div>

                        <span className="text-xs text-zinc-400">
                          {item}
                        </span>

                        <Check
                          size={13}
                          className="ml-auto text-emerald-400"
                        />
                      </div>
                    ))}

                  </div>

                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section
        id="integrations"
        className="px-6 py-28"
      >
        <div className="mx-auto max-w-6xl text-center">

          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">
            Connected
          </p>

          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Your tools. One system.
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-500">
            Connect the tools your business already uses and let J10
            orchestrate them together.
          </p>

          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">

            {integrations.map((integration) => (
              <div
                key={integration}
                className="rounded-xl border border-white/[0.06] bg-[#111216] px-4 py-4 text-sm text-zinc-500 transition-all hover:border-white/[0.12] hover:text-zinc-300"
              >
                {integration}
              </div>
            ))}

          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        id="pricing"
        className="px-6 pb-28 pt-10"
      >
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-blue-500/15 bg-gradient-to-br from-blue-600/[0.12] via-violet-600/[0.08] to-transparent px-6 py-20 text-center md:px-12">

          <div className="absolute left-1/2 top-[-200px] h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-blue-500/[0.12] blur-[120px]" />

          <div className="relative">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <Zap size={20} />
            </div>

            <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
              Your business has an operating system now.
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-zinc-500 md:text-base">
              Build AI employees, automate your operations and create
              faster with J10 NEXUS.
            </p>

            <div className="mt-8">

              <a
                href="/dashboard"
                className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200"
              >
                Start Building

                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>

            </div>

          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.06] px-6 py-10">

        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-center">

          <div className="flex items-center gap-2.5">

            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
              <span className="text-sm font-bold">
                J
              </span>
            </div>

            <div>
              <p className="text-sm font-semibold">
                J10 NEXUS
              </p>

              <p className="text-[10px] text-zinc-700">
                AI Operating System
              </p>
            </div>

          </div>

          <div className="flex flex-wrap gap-6 text-xs text-zinc-600">

            <a
              href="#platform"
              className="transition-colors hover:text-zinc-300"
            >
              Platform
            </a>

            <a
              href="#intelligence"
              className="transition-colors hover:text-zinc-300"
            >
              J10 AI
            </a>

            <a
              href="#integrations"
              className="transition-colors hover:text-zinc-300"
            >
              Integrations
            </a>

            <a
              href="#pricing"
              className="transition-colors hover:text-zinc-300"
            >
              Pricing
            </a>

          </div>

          <p className="text-xs text-zinc-700">
            © 2026 J10 NEXUS
          </p>

        </div>
      </footer>

    </main>
  );
}