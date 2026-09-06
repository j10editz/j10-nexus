import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getWorkspaceSubscription } from "@/lib/billing/entitlements";
import { getPlanById } from "@/lib/billing/plans";

export async function GET(request: NextRequest) {
  try {
    const { context, error } = await requireApiWorkspaceContext("viewer");
    if (error) {
      return error;
    }

    const supabase = createServerSupabaseClient();
    const sub = await getWorkspaceSubscription(supabase, context.workspace.id);
    const plan = getPlanById(sub?.planId || "starter");

    const periodStart = sub?.currentPeriodStart || new Date(Date.now() - 30 * 86400000).toISOString();
    const periodEnd = sub?.currentPeriodEnd || new Date(Date.now() + 30 * 86400000).toISOString();

    // Query recent usage records
    const { data: records, error: recordsErr } = await supabase
      .from("workspace_usage_records")
      .select("id, metric_name, quantity, idempotency_key, resource_id, recorded_at, metadata")
      .eq("workspace_id", context.workspace.id)
      .gte("recorded_at", periodStart)
      .order("recorded_at", { ascending: false })
      .limit(100);

    if (recordsErr) {
      console.warn("Error querying workspace_usage_records:", recordsErr);
    }

    const usageRecords = records || [];

    // Aggregate by metric
    const metricTotals: Record<string, number> = {
      whatsapp_outbound: 0,
      whatsapp_inbound: 0,
      ai_tokens: 0,
      ai_agent_run: 0,
      campaign_broadcast: 0,
      workflow_execution: 0,
    };

    for (const rec of usageRecords) {
      if (metricTotals[rec.metric_name] !== undefined) {
        metricTotals[rec.metric_name] += rec.quantity;
      } else {
        metricTotals[rec.metric_name] = rec.quantity;
      }
    }

    const limit = sub?.monthlyMessageLimit ?? plan.messageLimit;
    const used = sub?.messagesUsed ?? 0;
    const remaining = Math.max(0, limit - used);
    const usagePercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return NextResponse.json({
      success: true,
      accounting: {
        workspaceId: context.workspace.id,
        periodStart,
        periodEnd,
        quota: {
          limit,
          used,
          remaining,
          usagePercent,
        },
        metricsBreakdown: metricTotals,
        recentRecords: usageRecords.slice(0, 20),
        totalRecordedEvents: usageRecords.length,
      },
    });
  } catch (error: any) {
    console.error("Billing usage accounting error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to retrieve billing usage accounting." },
      { status: 500 }
    );
  }
}
