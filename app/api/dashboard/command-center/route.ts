import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

export interface CommandCenterData {
  workspaceId: string;
  workspaceName: string;
  brandName: string;
  isEmptyWorkspace: boolean;
  lastUpdated: string;
  metrics: {
    newLeads: { count: number; label: string; href: string };
    leadsNeedingAttention: { count: number; label: string; href: string };
    unansweredConversations: { count: number; label: string; href: string };
    upcomingBookings: { count: number; label: string; href: string };
    pendingPayments: { count: number; amount: number; label: string; href: string };
    tasksRequiringHumanAction: { count: number; label: string; href: string };
    aiActionsCompleted: { count: number; label: string; href: string };
    failedAutomations: { count: number; label: string; href: string };
  };
  attentionItems: Array<{
    id: string;
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    actionLabel: string;
    actionHref: string;
    product: string;
  }>;
  recentLeads: Array<{
    id: string;
    name: string;
    status: string;
    source: string;
    estimatedValue: number;
    createdAt: string;
  }>;
  recentConversations: Array<{
    id: string;
    contactName: string;
    channel: string;
    lastMessage: string;
    isUnread: boolean;
    timestamp: string;
  }>;
  upcomingBookingsList: Array<{
    id: string;
    clientName: string;
    scheduledStart: string;
    status: string;
  }>;
  channelOverview: Array<{
    channel: string;
    label: string;
    status: "Connected" | "Available to connect" | "Setup incomplete" | "Degraded" | "Coming soon";
    isOperational: boolean;
  }>;
}

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const wsId = context.workspace.id;
    const supabase = createServerSupabaseClient();

    // 1. Fetch workspace contacts/leads
    const { data: rawContacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id, name, first_name, last_name, email, phone, company, status, deal_stage, estimated_value, source, notes, created_at, updated_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });

    if (contactsErr) {
      console.error("Command Center contacts query failed:", contactsErr);
    }
    const contacts = rawContacts || [];

    // 2. Fetch inbox threads
    const { data: rawThreads, error: threadsErr } = await supabase
      .from("inbox_threads")
      .select("id, contact_id, channel, status, priority, unread_count, last_message_at, metadata, created_at, contact:contacts!inbox_threads_contact_id_fkey(name)")
      .eq("workspace_id", wsId)
      .order("last_message_at", { ascending: false })
      .limit(20);

    if (threadsErr) {
      console.error("Command Center threads query failed:", threadsErr);
    }
    const threads = rawThreads || [];

    // 3. Fetch bookings
    const { data: rawBookings, error: bookingsErr } = await supabase
      .from("crm_bookings")
      .select("id, contact_id, status, scheduled_at, title, duration_minutes, metadata, created_at")
      .eq("workspace_id", wsId)
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (bookingsErr) {
      console.error("Command Center bookings query failed:", bookingsErr);
    }
    const bookings = rawBookings || [];

    // 4. Fetch invoices / payments
    const { data: rawInvoices } = await supabase
      .from("finance_invoices")
      .select("id, amount, status, due_date, created_at")
      .eq("workspace_id", wsId);

    const invoices = rawInvoices || [];

    const { data: rawLedger } = await supabase
      .from("payment_ledger")
      .select("id, amount, status, occurred_at")
      .eq("workspace_id", wsId);

    const ledger = rawLedger || [];

    // 5. Fetch automations & runs
    const { data: rawRuns } = await supabase
      .from("automation_runs")
      .select("id, status, created_at")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(50);

    const automationRuns = rawRuns || [];

    // 6. Fetch AI jobs (WhatsApp / Telegram)
    const { data: rawWaJobs } = await supabase
      .from("whatsapp_ai_jobs")
      .select("id, status, created_at")
      .eq("workspace_id", wsId);

    const waJobs = rawWaJobs || [];

    // 7. Fetch active integrations for channel truth
    const { data: rawIntegrations } = await supabase
      .from("integrations")
      .select("provider, status")
      .eq("workspace_id", wsId);

    const integrations = rawIntegrations || [];

    const { data: tgBiz } = await supabase
      .from("telegram_business_connections")
      .select("id, status, can_reply, is_enabled")
      .eq("workspace_id", wsId)
      .maybeSingle();

    // Calculations based strictly on real workspace data
    const newLeadsCount = contacts.filter((c) => {
      const st = (c.status || "").toLowerCase();
      const ds = (c.deal_stage || "").toLowerCase();
      return st === "new" || ds === "lead";
    }).length;

    const leadsNeedingAttentionCount = contacts.filter((c) => {
      const st = (c.status || "").toLowerCase();
      return st === "qualified" || Number(c.estimated_value) > 1000;
    }).length;

    const unansweredConversationsCount = threads.filter(
      (t) => (t.unread_count || 0) > 0
    ).length;

    const nowIso = new Date().toISOString();
    const upcomingBookingsList = bookings
      .filter((b) => !b.scheduled_at || b.scheduled_at >= nowIso)
      .map((b) => ({
        id: b.id,
        clientName: (b.metadata as any)?.clientName || (b as any).title || "Customer Appointment",
        scheduledStart: b.scheduled_at || b.created_at,
        status: b.status || "scheduled",
      }));

    const pendingInvoices = invoices.filter(
      (inv) => (inv.status || "").toLowerCase() === "pending" || (inv.status || "").toLowerCase() === "draft"
    );
    const pendingPaymentsAmount = pendingInvoices.reduce(
      (sum, inv) => sum + (Number(inv.amount) || 0),
      0
    );

    const failedAutomationsCount = automationRuns.filter(
      (r) => r.status === "failed" || r.status === "error"
    ).length;

    const completedAiTasksCount =
      automationRuns.filter((r) => r.status === "completed" || r.status === "succeeded").length +
      waJobs.filter((j) => j.status === "completed").length;

    const tasksRequiringHumanActionCount =
      threads.filter((t) => (t.metadata as any)?.needsHumanApproval || t.priority === "urgent").length;

    const isEmptyWorkspace = contacts.length === 0 && threads.length === 0;

    // Attention Items (Actionable rule-based items with links to J10 products)
    const attentionItems: CommandCenterData["attentionItems"] = [];

    if (unansweredConversationsCount > 0) {
      attentionItems.push({
        id: "att-inbox",
        priority: "high",
        title: `${unansweredConversationsCount} Unanswered Conversation${unansweredConversationsCount > 1 ? "s" : ""}`,
        description: "Inbound customer messages waiting for response or review.",
        actionLabel: "Open J10 Inbox",
        actionHref: "/dashboard/inbox",
        product: "J10 Inbox",
      });
    }

    if (leadsNeedingAttentionCount > 0) {
      attentionItems.push({
        id: "att-leads",
        priority: "high",
        title: `${leadsNeedingAttentionCount} Qualified Lead${leadsNeedingAttentionCount > 1 ? "s" : ""} Needing Proposal`,
        description: "Leads qualified by AI operator awaiting quote or booking confirmation.",
        actionLabel: "Review in J10 Lead Center",
        actionHref: "/dashboard/crm?status=Qualified",
        product: "J10 Lead Center",
      });
    }

    if (failedAutomationsCount > 0) {
      attentionItems.push({
        id: "att-automations",
        priority: "high",
        title: `${failedAutomationsCount} Failed Automation Run${failedAutomationsCount > 1 ? "s" : ""}`,
        description: "Workflow execution encountered errors requiring inspection.",
        actionLabel: "Inspect J10 Automations",
        actionHref: "/dashboard/ai-operator?tab=automations",
        product: "J10 AI Operator",
      });
    }

    if (pendingInvoices.length > 0) {
      attentionItems.push({
        id: "att-payments",
        priority: "medium",
        title: `${pendingInvoices.length} Pending Invoice${pendingInvoices.length > 1 ? "s" : ""}`,
        description: `Unpaid customer invoices totaling $${pendingPaymentsAmount.toLocaleString()}.`,
        actionLabel: "Review in J10 Pay",
        actionHref: "/dashboard/pay",
        product: "J10 Pay",
      });
    }

    // Channel Overview
    const hasTg = tgBiz?.status === "active" || integrations.some((i) => i.provider === "telegram" && i.status === "connected");
    const hasWa = integrations.some((i) => i.provider === "whatsapp" && i.status === "connected");

    const channelOverview: CommandCenterData["channelOverview"] = [
      {
        channel: "whatsapp",
        label: "WhatsApp",
        status: hasWa ? "Connected" : "Available to connect",
        isOperational: hasWa,
      },
      {
        channel: "telegram",
        label: "Telegram",
        status: hasTg ? "Connected" : "Available to connect",
        isOperational: hasTg,
      },
      {
        channel: "website",
        label: "Website chat/forms",
        status: "Connected",
        isOperational: true,
      },
      {
        channel: "google-calendar",
        label: "Google Calendar",
        status: "Available to connect",
        isOperational: false,
      },
      {
        channel: "email",
        label: "Email/Gmail",
        status: "Available to connect",
        isOperational: false,
      },
      {
        channel: "phone-sms",
        label: "Phone/SMS",
        status: "Coming soon",
        isOperational: false,
      },
      {
        channel: "instagram",
        label: "Instagram",
        status: "Coming soon",
        isOperational: false,
      },
      {
        channel: "messenger",
        label: "Facebook Messenger",
        status: "Coming soon",
        isOperational: false,
      },
    ];

    const recentLeads = contacts.slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Inbound Lead",
      status: c.status || "new",
      source: c.source || "Website",
      estimatedValue: Number(c.estimated_value) || 0,
      createdAt: c.created_at,
    }));

    const recentConversations = threads.slice(0, 5).map((t) => {
      const contactObj = (t as any).contact;
      return {
        id: t.id,
        contactName: contactObj?.name || (t.metadata as any)?.senderName || "Website Visitor",
        channel: t.channel || "webchat",
        lastMessage: (t.metadata as any)?.lastMessageSnippet || "Conversation started.",
        isUnread: (t.unread_count || 0) > 0,
        timestamp: t.last_message_at || t.created_at,
      };
    });

    const responsePayload: CommandCenterData = {
      workspaceId: wsId,
      workspaceName: context.workspace.name,
      brandName: context.workspace.brand_name || context.workspace.name,
      isEmptyWorkspace,
      lastUpdated: new Date().toISOString(),
      metrics: {
        newLeads: {
          count: newLeadsCount,
          label: "New Leads",
          href: "/dashboard/crm?status=New",
        },
        leadsNeedingAttention: {
          count: leadsNeedingAttentionCount,
          label: "Leads Needing Attention",
          href: "/dashboard/crm?status=Qualified",
        },
        unansweredConversations: {
          count: unansweredConversationsCount,
          label: "Unanswered Conversations",
          href: "/dashboard/inbox?filter=unanswered",
        },
        upcomingBookings: {
          count: upcomingBookingsList.length,
          label: "Upcoming Bookings",
          href: "/dashboard/booking",
        },
        pendingPayments: {
          count: pendingInvoices.length,
          amount: pendingPaymentsAmount,
          label: "Pending Payments",
          href: "/dashboard/pay",
        },
        tasksRequiringHumanAction: {
          count: tasksRequiringHumanActionCount,
          label: "Tasks Requiring Action",
          href: "/dashboard/inbox?filter=needs_human",
        },
        aiActionsCompleted: {
          count: completedAiTasksCount,
          label: "AI Actions Completed",
          href: "/dashboard/ai-operator",
        },
        failedAutomations: {
          count: failedAutomationsCount,
          label: "Failed Automations",
          href: "/dashboard/ai-operator?tab=automations&status=failed",
        },
      },
      attentionItems,
      recentLeads,
      recentConversations,
      upcomingBookingsList,
      channelOverview,
    };

    return NextResponse.json({
      success: true,
      data: responsePayload,
    });
  } catch (err) {
    console.error("GET /api/dashboard/command-center error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load command center data.",
      },
      { status: 500 }
    );
  }
}
