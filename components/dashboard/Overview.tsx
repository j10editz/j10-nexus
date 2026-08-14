"use client";

import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  Globe,
  Image,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Sparkles,
  TrendingUp,
  Workflow,
  Zap,
} from "lucide-react";

const stats = [
  {
    label: "Revenue",
    value: "$24,500",
    change: "+18.4%",
    description: "vs. last month",
    icon: TrendingUp,
  },
  {
    label: "AI Employees",
    value: "12",
    change: "+3",
    description: "active employees",
    icon: Bot,
  },
  {
    label: "Automations",
    value: "48",
    change: "+12",
    description: "running workflows",
    icon: Workflow,
  },
  {
    label: "Marketplace",
    value: "$8,320",
    change: "+24.8%",
    description: "total sales",
    icon: Sparkles,
  },
];

const quickActions = [
  {
    title: "AI Employee",
    description: "Create an intelligent employee",
    icon: Bot,
  },
  {
    title: "Workflow",
    description: "Automate a business process",
    icon: Workflow,
  },
  {
    title: "Website",
    description: "Build a website with AI",
    icon: Globe,
  },
  {
    title: "WhatsApp Bot",
    description: "Connect your business",
    icon: MessageSquare,
  },
  {
    title: "Generate Images",
    description: "Create professional visuals",
    icon: Image,
  },
  {
    title: "Upload Documents",
    description: "Give J10 AI knowledge",
    icon: FileText,
  },
];

const activities = [
  {
    title: "AI Employee answered 134 customers",
    time: "8 minutes ago",
    icon: Bot,
  },
  {
    title: "New order received",
    time: "24 minutes ago",
    icon: CheckCircle2,
  },
  {
    title: "Invoice #1048 sent successfully",
    time: "1 hour ago",
    icon: FileText,
  },
  {
    title: "Marketing workflow completed",
    time: "2 hours ago",
    icon: Workflow,
  },
  {
    title: "WhatsApp campaign finished",
    time: "3 hours ago",
    icon: MessageSquare,
  },
];

export default function Overview() {
  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-8">

        {/* HEADER */}
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
              <span>Overview</span>

              <ChevronRight size={14} />

              <span className="text-zinc-300">
                Dashboard
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              Welcome back, John
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              Here&apos;s what&apos;s happening across your business today.
            </p>
          </div>

          <button
            className="
              group flex items-center gap-2 rounded-xl
              border border-white/10
              bg-white/[0.04]
              px-4 py-2.5
              text-sm font-medium
              transition-all
              hover:border-blue-500/30
              hover:bg-blue-500/10
            "
          >
            <Plus size={17} />

            Create

            <ChevronRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>

        {/* STATS */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <div
                key={stat.label}
                className="
                  group relative overflow-hidden
                  rounded-2xl
                  border border-white/[0.07]
                  bg-[#111216]
                  p-5
                  transition-all duration-300
                  hover:-translate-y-1
                  hover:border-blue-500/20
                  hover:bg-[#14161b]
                "
              >
                <div
                  className="
                    absolute -right-10 -top-10
                    h-24 w-24
                    rounded-full
                    bg-blue-600/10
                    blur-3xl
                    transition-opacity
                    group-hover:opacity-100
                  "
                />

                <div className="relative">
                  <div className="mb-5 flex items-center justify-between">
                    <div
                      className="
                        flex h-10 w-10
                        items-center justify-center
                        rounded-xl
                        border border-white/[0.07]
                        bg-white/[0.04]
                      "
                    >
                      <Icon
                        size={18}
                        className="text-blue-400"
                      />
                    </div>

                    <MoreHorizontal
                      size={18}
                      className="text-zinc-600"
                    />
                  </div>

                  <p className="text-sm text-zinc-500">
                    {stat.label}
                  </p>

                  <div className="mt-1 flex items-end gap-3">
                    <span className="text-2xl font-semibold tracking-tight">
                      {stat.value}
                    </span>

                    <span
                      className="
                        mb-1 rounded-md
                        bg-emerald-500/10
                        px-2 py-0.5
                        text-xs font-medium
                        text-emerald-400
                      "
                    >
                      {stat.change}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-zinc-600">
                    {stat.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* MAIN GRID */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">

          {/* J10 AI INTELLIGENCE */}
          <section
            className="
              relative overflow-hidden
              rounded-2xl
              border border-blue-500/20
              bg-gradient-to-br
              from-[#111827]
              via-[#10131d]
              to-[#0b0c10]
              p-6
            "
          >
            <div
              className="
                absolute -right-24 -top-24
                h-64 w-64
                rounded-full
                bg-blue-600/15
                blur-3xl
              "
            />

            <div
              className="
                absolute -bottom-24 left-1/3
                h-56 w-56
                rounded-full
                bg-violet-600/10
                blur-3xl
              "
            />

            <div className="relative">

              {/* J10 AI HEADER */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">

                  <div
                    className="
                      flex h-11 w-11
                      items-center justify-center
                      rounded-xl
                      bg-gradient-to-br
                      from-blue-500
                      to-violet-600
                      shadow-lg
                      shadow-blue-500/20
                    "
                  >
                    <Sparkles size={20} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold">
                      J10 AI
                    </p>

                    <p className="text-xs text-zinc-500">
                      Business Intelligence
                    </p>
                  </div>
                </div>

                {/* ONLINE STATUS */}
                <div
                  className="
                    flex items-center gap-2
                    rounded-full
                    border border-emerald-500/20
                    bg-emerald-500/10
                    px-2.5 py-1
                    text-[11px]
                    font-medium
                    text-emerald-400
                  "
                >
                  <span
                    className="
                      h-1.5 w-1.5
                      rounded-full
                      bg-emerald-400
                    "
                  />

                  Online
                </div>
              </div>

              {/* INSIGHT */}
              <div className="mt-8 max-w-2xl">

                <p
                  className="
                    text-xs
                    font-medium
                    uppercase
                    tracking-[0.18em]
                    text-blue-400
                  "
                >
                  Intelligence Insight
                </p>

                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  Your revenue opportunity is growing.
                </h2>

                <p
                  className="
                    mt-3
                    max-w-xl
                    text-sm
                    leading-6
                    text-zinc-400
                  "
                >
                  Revenue increased 18.4% this month, but
                  14 abandoned carts were detected in the
                  last 24 hours. J10 AI recommends launching
                  a targeted follow-up campaign.
                </p>
              </div>

              {/* ACTIONS */}
              <div className="mt-6 flex flex-wrap gap-3">

                <button
                  className="
                    flex items-center gap-2
                    rounded-xl
                    bg-white
                    px-4 py-2.5
                    text-sm
                    font-semibold
                    text-black
                    transition-all
                    hover:bg-zinc-200
                  "
                >
                  Review opportunity

                  <ArrowUpRight size={15} />
                </button>

                <button
                  className="
                    rounded-xl
                    border border-white/10
                    bg-white/[0.04]
                    px-4 py-2.5
                    text-sm
                    font-medium
                    text-zinc-300
                    transition-all
                    hover:bg-white/[0.08]
                  "
                >
                  Ask J10 AI
                </button>

              </div>
            </div>
          </section>

          {/* RECENT ACTIVITY */}
          <section
            className="
              rounded-2xl
              border border-white/[0.07]
              bg-[#111216]
              p-6
            "
          >
            <div className="mb-5 flex items-center justify-between">

              <div>
                <h2 className="font-semibold">
                  Recent Activity
                </h2>

                <p className="mt-1 text-xs text-zinc-600">
                  Latest activity across your workspace
                </p>
              </div>

              <button
                className="
                  text-xs
                  text-zinc-500
                  transition-colors
                  hover:text-white
                "
              >
                View all
              </button>
            </div>

            <div className="space-y-1">

              {activities.map((activity) => {
                const Icon = activity.icon;

                return (
                  <div
                    key={activity.title}
                    className="
                      group
                      flex items-center gap-3
                      rounded-xl
                      p-3
                      transition-colors
                      hover:bg-white/[0.03]
                    "
                  >

                    <div
                      className="
                        flex h-9 w-9
                        shrink-0
                        items-center justify-center
                        rounded-lg
                        border border-white/[0.06]
                        bg-white/[0.03]
                      "
                    >
                      <Icon
                        size={15}
                        className="text-zinc-400"
                      />
                    </div>

                    <div className="min-w-0 flex-1">

                      <p
                        className="
                          truncate
                          text-sm
                          text-zinc-300
                        "
                      >
                        {activity.title}
                      </p>

                      <p
                        className="
                          mt-1
                          text-xs
                          text-zinc-600
                        "
                      >
                        {activity.time}
                      </p>

                    </div>

                    <ChevronRight
                      size={15}
                      className="
                        text-zinc-700
                        transition-transform
                        group-hover:translate-x-0.5
                      "
                    />
                  </div>
                );
              })}

            </div>
          </section>
        </div>

        {/* QUICK ACTIONS */}
        <section className="mt-6">

          <div className="mb-4">

            <h2 className="text-lg font-semibold">
              Quick Actions
            </h2>

            <p className="mt-1 text-sm text-zinc-600">
              Create, automate and manage your business
              from one place.
            </p>

          </div>

          <div
            className="
              grid
              gap-3
              sm:grid-cols-2
              lg:grid-cols-3
            "
          >

            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.title}
                  className="
                    group
                    flex items-center gap-4
                    rounded-2xl
                    border border-white/[0.07]
                    bg-[#111216]
                    p-4
                    text-left
                    transition-all
                    duration-300
                    hover:-translate-y-0.5
                    hover:border-blue-500/20
                    hover:bg-[#14161b]
                  "
                >

                  <div
                    className="
                      flex h-11 w-11
                      shrink-0
                      items-center justify-center
                      rounded-xl
                      border border-white/[0.07]
                      bg-gradient-to-br
                      from-white/[0.07]
                      to-white/[0.02]
                      transition-all
                      group-hover:border-blue-500/20
                      group-hover:bg-blue-500/10
                    "
                  >
                    <Icon
                      size={18}
                      className="
                        text-zinc-400
                        transition-colors
                        group-hover:text-blue-400
                      "
                    />
                  </div>

                  <div className="min-w-0 flex-1">

                    <p
                      className="
                        text-sm
                        font-medium
                        text-zinc-200
                      "
                    >
                      {action.title}
                    </p>

                    <p
                      className="
                        mt-1
                        truncate
                        text-xs
                        text-zinc-600
                      "
                    >
                      {action.description}
                    </p>

                  </div>

                  <ArrowUpRight
                    size={16}
                    className="
                      text-zinc-700
                      transition-all
                      group-hover:-translate-y-0.5
                      group-hover:translate-x-0.5
                      group-hover:text-blue-400
                    "
                  />

                </button>
              );
            })}

          </div>
        </section>

        {/* BOTTOM STATUS */}
        <div
          className="
            mt-6
            grid
            gap-4
            md:grid-cols-3
          "
        >

          {/* SYSTEM STATUS */}
          <div
            className="
              rounded-2xl
              border border-white/[0.07]
              bg-[#111216]
              p-5
            "
          >
            <div className="flex items-center gap-3">

              <div
                className="
                  flex h-9 w-9
                  items-center justify-center
                  rounded-lg
                  bg-emerald-500/10
                "
              >
                <Zap
                  size={16}
                  className="text-emerald-400"
                />
              </div>

              <div>

                <p className="text-sm font-medium">
                  System Status
                </p>

                <p className="text-xs text-emerald-400">
                  All systems operational
                </p>

              </div>

            </div>
          </div>

          {/* AI OPERATIONS */}
          <div
            className="
              rounded-2xl
              border border-white/[0.07]
              bg-[#111216]
              p-5
            "
          >
            <div className="flex items-center gap-3">

              <div
                className="
                  flex h-9 w-9
                  items-center justify-center
                  rounded-lg
                  bg-blue-500/10
                "
              >
                <Bot
                  size={16}
                  className="text-blue-400"
                />
              </div>

              <div>

                <p className="text-sm font-medium">
                  AI Operations
                </p>

                <p className="text-xs text-zinc-500">
                  12 employees working
                </p>

              </div>

            </div>
          </div>

          {/* AUTOMATIONS */}
          <div
            className="
              rounded-2xl
              border border-white/[0.07]
              bg-[#111216]
              p-5
            "
          >
            <div className="flex items-center gap-3">

              <div
                className="
                  flex h-9 w-9
                  items-center justify-center
                  rounded-lg
                  bg-violet-500/10
                "
              >
                <CheckCircle2
                  size={16}
                  className="text-violet-400"
                />
              </div>

              <div>

                <p className="text-sm font-medium">
                  Automations
                </p>

                <p className="text-xs text-zinc-500">
                  48 workflows running
                </p>

              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
