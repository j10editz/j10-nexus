import { describe, expect, it } from "vitest";
import {
  assertWorkspaceEntitlement,
  BillingRequiredError,
  type WorkspaceSubscription,
} from "@/lib/billing/entitlements";
import type { SupabaseClient } from "@supabase/supabase-js";

function mockSupabase(subscriptionRow: Record<string, unknown> | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: subscriptionRow, error: null }),
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: subscriptionRow, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("J10 NEXUS Subscription & Entitlement Enforcement", () => {
  it("fails closed when no subscription record exists for workspace", async () => {
    const supabase = mockSupabase(null);
    await expect(assertWorkspaceEntitlement(supabase, "ws-123")).rejects.toThrowError(
      BillingRequiredError
    );
    await expect(assertWorkspaceEntitlement(supabase, "ws-123")).rejects.toThrow(
      "No active subscription provisioned for this workspace"
    );
  });

  it("blocks live execution when subscription is canceled", async () => {
    const supabase = mockSupabase({
      id: "sub-canceled",
      workspace_id: "ws-123",
      plan_id: "starter",
      status: "canceled",
      monthly_message_limit: 1000,
      messages_used_this_period: 20,
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
      grace_period_end: null,
    });

    await expect(assertWorkspaceEntitlement(supabase, "ws-123")).rejects.toThrowError(
      BillingRequiredError
    );
  });

  it("blocks live execution when payment is past due and grace period has expired", async () => {
    const supabase = mockSupabase({
      id: "sub-past-due-expired",
      workspace_id: "ws-123",
      plan_id: "professional",
      status: "past_due",
      monthly_message_limit: 5000,
      messages_used_this_period: 50,
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
      grace_period_end: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
    });

    await expect(assertWorkspaceEntitlement(supabase, "ws-123")).rejects.toThrow(
      "Payment is past due and the billing grace period has expired"
    );
  });

  it("permits live execution when payment is past due but still inside grace period", async () => {
    const supabase = mockSupabase({
      id: "sub-past-due-grace",
      workspace_id: "ws-123",
      plan_id: "professional",
      status: "past_due",
      monthly_message_limit: 5000,
      messages_used_this_period: 50,
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
      grace_period_end: new Date(Date.now() + 86400000 * 2).toISOString(), // 2 days left
    });

    const sub = await assertWorkspaceEntitlement(supabase, "ws-123");
    expect(sub.status).toBe("past_due");
    expect(sub.id).toBe("sub-past-due-grace");
  });

  it("blocks execution when monthly quota limit is exceeded", async () => {
    const supabase = mockSupabase({
      id: "sub-quota-full",
      workspace_id: "ws-123",
      plan_id: "starter",
      status: "active",
      monthly_message_limit: 500,
      messages_used_this_period: 500,
      current_period_end: new Date(Date.now() + 86400000 * 15).toISOString(),
      grace_period_end: null,
    });

    await expect(
      assertWorkspaceEntitlement(supabase, "ws-123", { requiredMessages: 1 })
    ).rejects.toThrow("Monthly limit of 500 messages reached");
  });

  it("allows execution when active subscription is within quota", async () => {
    const supabase = mockSupabase({
      id: "sub-active",
      workspace_id: "ws-123",
      plan_id: "enterprise",
      status: "active",
      monthly_message_limit: 50000,
      messages_used_this_period: 1200,
      current_period_end: new Date(Date.now() + 86400000 * 25).toISOString(),
      grace_period_end: null,
    });

    const sub = await assertWorkspaceEntitlement(supabase, "ws-123");
    expect(sub.status).toBe("active");
    expect(sub.planId).toBe("enterprise");
  });
});
