import { Shield, Sparkles, Terminal, Workflow } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#07080A] py-16 text-zinc-400">
      <div className="mx-auto max-w-[1500px] px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* BRAND COLUMN */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 shadow-md shadow-blue-500/20">
                <Sparkles size={15} className="text-white" />
              </div>
              <span className="text-base font-bold tracking-tight text-white">J10 NEXUS</span>
            </div>

            <p className="mt-4 max-w-sm text-xs leading-6 text-zinc-500">
              The AI Operating System for Modern Businesses. Autonomous digital workforce, official Meta Cloud WhatsApp
              orchestration, CRM, event-driven DAG workflows, and unified business intelligence.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                Official Meta Cloud API
              </span>
              <span className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                AES-256-GCM Vault
              </span>
              <span className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                PostgreSQL RLS
              </span>
            </div>
          </div>

          {/* SOLUTIONS */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white">Solutions</p>
            <ul className="mt-4 space-y-2.5 text-xs text-zinc-500">
              <li>
                <Link href="/dashboard/whatsapp" className="transition hover:text-white">
                  WhatsApp Business AI
                </Link>
              </li>
              <li>
                <Link href="/dashboard/ai-employees" className="transition hover:text-white">
                  Autonomous AI Employees
                </Link>
              </li>
              <li>
                <Link href="/dashboard/automation" className="transition hover:text-white">
                  J10 Flow Automations
                </Link>
              </li>
              <li>
                <Link href="/dashboard/crm" className="transition hover:text-white">
                  Customer Intelligence CRM
                </Link>
              </li>
              <li>
                <Link href="/dashboard/finance" className="transition hover:text-white">
                  Financial Operations
                </Link>
              </li>
            </ul>
          </div>

          {/* PLATFORM ARCHITECTURE */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white">Platform</p>
            <ul className="mt-4 space-y-2.5 text-xs text-zinc-500">
              <li>
                <a href="#features" className="transition hover:text-white">
                  Ecosystem Overview
                </a>
              </li>
              <li>
                <Link href="/dashboard/settings/integrations" className="transition hover:text-white">
                  Integration Registry
                </Link>
              </li>
              <li>
                <Link href="/dashboard/activity" className="transition hover:text-white">
                  Workspace Audit Log
                </Link>
              </li>
              <li>
                <Link href="/dashboard/analytics" className="transition hover:text-white">
                  Operational Telemetry
                </Link>
              </li>
              <li>
                <Link href="/login" className="transition hover:text-white">
                  Developer API
                </Link>
              </li>
            </ul>
          </div>

          {/* SECURITY & STATUS */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white">Security & Status</p>
            <ul className="mt-4 space-y-2.5 text-xs text-zinc-500">
              <li>
                <Link href="/status" className="flex items-center gap-1.5 text-emerald-400 font-medium hover:underline">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Core Services Operational</span>
                </Link>
              </li>
              <li>
                <Link href="/security" className="transition hover:text-white">
                  Security Architecture
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition hover:text-white">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition hover:text-white">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* BOTTOM ROW */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 text-xs text-zinc-600 sm:flex-row">
          <p>© 2026 J10 Nexus. All rights reserved.</p>
          <div className="flex items-center gap-6 text-[11px]">
            <span>Empowering modern businesses with connected AI</span>
            <span>Made with precision</span>
          </div>
        </div>
      </div>
    </footer>
  );
}