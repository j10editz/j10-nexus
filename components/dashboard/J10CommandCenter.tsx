"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import J10ThinkingState from "@/components/dashboard/J10ThinkingState";
import { DEMO_REVENUE_DASHBOARD_DATA } from "@/lib/dashboard/demo-fixture";
import type { RevenueCommandDashboardData } from "@/types/revenue-dashboard";

type Props = {
  userName: string;
  initialWorkspaceName?: string;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function J10CommandCenter({ userName, initialWorkspaceName }: Props) {
  const [data, setData] = useState<RevenueCommandDashboardData>(DEMO_REVENUE_DASHBOARD_DATA);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!live) {
      setData(DEMO_REVENUE_DASHBOARD_DATA);
      setError("");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/dashboard/revenue-command", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Live workspace is unavailable");
        const payload = await response.json();
        if (!payload.success || !payload.data) throw new Error("Live workspace is unavailable");
        setData(payload.data);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason?.message || "Live workspace is unavailable");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [live]);

  const firstName = userName.trim().split(" ")[0] || "there";
  const appointments = [...data.appointments.today, ...data.appointments.upcoming].slice(0, 3);
  const actions = data.recommendedActions.slice(0, 4);
  const deals = data.revenueAttribution.recentWonDeals.slice(0, 3);

  const metrics = [
    { label: "New leads", value: data.snapshot.newLeads.value, note: "this month", href: "/dashboard/crm" },
    { label: "Unanswered", value: data.recentActivity.filter((item) => item.isUnread).length, note: "need attention", href: "/dashboard/inbox" },
    { label: "Booked", value: data.snapshot.appointmentsBooked.value, note: "appointments", href: "/dashboard/booking" },
    { label: "Revenue", value: data.snapshot.revenueWon.value, note: "collected", href: "/dashboard/finance" },
  ];

  return (
    <div className="j10-command-page">
      {loading && <div className="j10-thinking-overlay"><J10ThinkingState label="J10 is reading your workspace" /></div>}

      <section className="j10-command-heading">
        <div>
          <p className="j10-command-eyebrow">Command Center</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {firstName}.</h1>
          <p>Here is what needs your attention today.</p>
        </div>
        <div className="j10-command-controls">
          <span className="j10-operator-status"><i /> J10 Operator active</span>
          <div className="j10-mode-switch" aria-label="Dashboard data">
            <button className={!live ? "active" : ""} onClick={() => setLive(false)}>Sample</button>
            <button className={live ? "active" : ""} onClick={() => setLive(true)}>Live</button>
          </div>
        </div>
      </section>

      {error && <div className="j10-command-notice">{error}. Showing the last available workspace data.</div>}

      <section className="j10-metric-grid" aria-label="Business snapshot">
        {metrics.map((metric) => (
          <Link href={metric.href} className="j10-metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{String(metric.value)}</strong>
            <small>{metric.note}</small>
          </Link>
        ))}
      </section>

      <section className="j10-flow-card" aria-label="Lead journey">
        <div className="j10-card-title">
          <div><span>Lead journey</span><small>From first contact to payment</small></div>
          <Link href="/dashboard/crm">Open Lead Center</Link>
        </div>
        <div className="j10-flow-row">
          {data.funnel.stages.filter((_, index) => [0, 2, 3, 5].includes(index)).map((stage, index) => (
            <div className="j10-flow-step" key={stage.id}>
              <b>{index + 1}</b>
              <div><strong>{stage.count}</strong><span>{stage.label}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="j10-command-columns">
        <article className="j10-command-card j10-attention-card">
          <div className="j10-card-title">
            <div><span>Needs your attention</span><small>{actions.length} items</small></div>
            <Link href="/dashboard/activity">View all</Link>
          </div>
          <div className="j10-list">
            {actions.map((action) => (
              <Link href={action.actionHref} key={action.id} className="j10-list-row">
                <i className={action.priority} />
                <div><strong>{action.title}</strong><span>{action.reason}</span></div>
                <em>{action.priority}</em>
              </Link>
            ))}
          </div>
        </article>

        <div className="j10-side-stack">
          <article className="j10-command-card">
            <div className="j10-card-title">
              <div><span>Today</span><small>Upcoming work</small></div>
              <Link href="/dashboard/booking">Calendar</Link>
            </div>
            <div className="j10-list compact">
              {appointments.map((appointment) => (
                <div className="j10-list-row" key={appointment.id}>
                  <time>{appointment.timeFormatted}</time>
                  <div><strong>{appointment.clientName}</strong><span>{appointment.serviceRequested}</span></div>
                </div>
              ))}
            </div>
          </article>

          <article className="j10-command-card">
            <div className="j10-card-title">
              <div><span>Money moving</span><small>{data.revenueAttribution.openPipelineValue ? `${money.format(data.revenueAttribution.openPipelineValue)} pipeline` : "Recent payments"}</small></div>
              <Link href="/dashboard/finance">Open Pay</Link>
            </div>
            <div className="j10-list compact">
              {deals.map((deal) => (
                <div className="j10-list-row" key={deal.id}>
                  <div><strong>{deal.clientName}</strong><span>{deal.serviceName}</span></div>
                  <b>{money.format(deal.amount)}</b>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <button className="j10-command-bar" onClick={() => window.location.assign("/dashboard#j10-ai")}>
        <Image src="/brand/j10-logo.png" alt="" width={24} height={24} />
        <span>Ask J10 about your business</span>
        <kbd>⌘ K</kbd>
      </button>
      <p className="j10-workspace-label">{data.workspaceName || initialWorkspaceName}</p>
    </div>
  );
}
