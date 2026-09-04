import Link from "next/link";
import {
  Bot,
  ChevronRight,
  CreditCard,
  FlaskConical,
  Plug,
  Settings,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { requireUser } from "@/lib/auth";

const operationalTools = [
  {
    title: "Subscription & Billing",
    description:
      "Manage J10 NEXUS subscription tier, automated message limits, usage quotas, and Stripe billing.",
    href: "/dashboard/settings/billing",
    icon: CreditCard,
    accent:
      "bg-amber-500/10 text-amber-300",
  },
  {
    title: "Integration connections",
    description:
      "Connect providers, review readiness, manage credentials, scopes, webhooks, and capabilities.",
    href: "/dashboard/settings/integrations",
    icon: Plug,
    accent:
      "bg-blue-500/10 text-blue-300",
  },
  {
    title: "Integration sandbox",
    description:
      "Exercise provider contracts without making live calls, writes, or billable AI requests.",
    href: "/dashboard/settings/integrations/sandbox",
    icon: FlaskConical,
    accent:
      "bg-cyan-500/10 text-cyan-300",
  },
  {
    title: "Automation operations",
    description:
      "Inspect active workflows, execution history, approvals, and operational performance.",
    href: "/dashboard/automation",
    icon: Workflow,
    accent:
      "bg-violet-500/10 text-violet-300",
  },
  {
    title: "AI workforce",
    description:
      "Create and manage AI employees, assignments, execution mode, and workforce analytics.",
    href: "/dashboard/ai-employees",
    icon: Bot,
    accent:
      "bg-emerald-500/10 text-emerald-300",
  },
];

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-4 py-7 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-400">
          J10 Administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Workspace settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/40">
          Manage the real operational surfaces currently available in your J10 NEXUS workspace.
        </p>

        <div className="mt-7 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/15">
                <Settings size={19} />
              </div>
              <div>
                <h2 className="font-semibold">
                  Operational tools
                </h2>
                <p className="mt-1 text-xs text-white/35">
                  Every item below opens a working J10 surface.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {operationalTools.map((tool) => {
                const Icon = tool.icon;

                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="group rounded-2xl border border-white/[0.06] bg-[#0B0C0F] p-4 transition hover:-translate-y-0.5 hover:border-blue-500/20 hover:bg-[#0E1014]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${tool.accent}`}
                      >
                        <Icon size={17} />
                      </div>
                      <ChevronRight
                        size={16}
                        className="mt-2 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-blue-300"
                      />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-white/85">
                      {tool.title}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-white/35">
                      {tool.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">
                    Signed-in workspace
                  </h2>
                  <p className="mt-1 text-xs text-emerald-300/70">
                    Authenticated
                  </p>
                </div>
              </div>

              <dl className="mt-5 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] pb-3">
                  <dt className="text-white/35">
                    Account
                  </dt>
                  <dd className="max-w-[210px] truncate text-right text-white/70">
                    {user.email ?? "J10 CEO"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] pb-3">
                  <dt className="text-white/35">
                    Workspace
                  </dt>
                  <dd className="text-white/70">
                    J10 Workspace
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-white/35">
                    Product phase
                  </dt>
                  <dd className="rounded-full bg-blue-500/10 px-2 py-1 font-semibold text-blue-300">
                    Product activation
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.035] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300/75">
                Product honesty rule
              </p>
              <p className="mt-3 text-sm leading-6 text-white/45">
                Modules still under construction are labeled Building in navigation. J10 will no longer present silent, inactive controls as finished features.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
