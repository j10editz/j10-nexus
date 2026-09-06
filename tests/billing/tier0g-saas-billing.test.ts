import { describe, expect, it, vi } from "vitest";
import {
  assertWorkspaceEntitlement,
  assertWorkspaceFeature,
  assertWorkspaceAiEmployeeLimit,
  getWorkspaceEntitlements,
  recordVerifiedWorkspaceUsage,
  reserveWorkspaceQuota,
  releaseWorkspaceQuota,
  activateWorkspaceTrial,
  BillingRequiredError,
} from "@/lib/billing/entitlements";
import { recordSpend } from "@/lib/governance/budgets";
import {
  PLANS,
  getPlanById,
  isFeatureEnabledForPlan,
} from "@/lib/billing/plans";
import {
  createWorkspaceSubscriptionCheckout,
} from "@/lib/billing/checkout";
import {
  createBillingPortalSession,
} from "@/lib/billing/portal";
import {
  recordDunningPaymentFailure,
  recordDunningPaymentRecovery,
  recordTrialExpirationWarning,
} from "@/lib/billing/dunning";
import {
  processStripeSubscriptionEvent,
} from "@/lib/billing/stripe-webhook";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Tier 0G: SaaS Billing & Subscription Architecture", () => {
  describe("1. Plan Entitlements & Feature Flags", () => {
    it("delineates feature entitlements across Starter, Growth, and Enterprise tiers", () => {
      // Starter: no broadcasts, 2 AI employees, no custom prompts
      expect(isFeatureEnabledForPlan("starter", "whatsapp_broadcasts")).toBe(false);
      expect(isFeatureEnabledForPlan("starter", "custom_system_prompts")).toBe(false);
      expect(isFeatureEnabledForPlan("starter", "custom_webhooks_erp")).toBe(false);
      expect(getPlanById("starter").entitlements.aiEmployeesQuota).toBe(2);

      // Growth: broadcasts enabled, 10 AI employees, priority routing
      expect(isFeatureEnabledForPlan("growth", "whatsapp_broadcasts")).toBe(true);
      expect(isFeatureEnabledForPlan("growth", "priority_sla")).toBe(true);
      expect(isFeatureEnabledForPlan("growth", "custom_system_prompts")).toBe(false);
      expect(getPlanById("growth").entitlements.aiEmployeesQuota).toBe(10);

      // Enterprise: unlimited/all features enabled
      expect(isFeatureEnabledForPlan("enterprise", "whatsapp_broadcasts")).toBe(true);
      expect(isFeatureEnabledForPlan("enterprise", "custom_system_prompts")).toBe(true);
      expect(isFeatureEnabledForPlan("enterprise", "custom_webhooks_erp")).toBe(true);
      expect(isFeatureEnabledForPlan("enterprise", "dedicated_meta_throughput")).toBe(true);
      expect(getPlanById("enterprise").entitlements.aiEmployeesQuota).toBe(999);
    });

    it("assertWorkspaceFeature enforces plan gates and blocks un-entitled features", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "sub-1",
                  workspace_id: "ws-starter",
                  plan_id: "starter",
                  status: "active",
                  provenance: "stripe",
                  monthly_message_limit: 1000,
                  messages_used_this_period: 100,
                  current_period_end: new Date(Date.now() + 86400000).toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      // Starter plan does not have whatsapp_broadcasts
      await expect(
        assertWorkspaceFeature(mockSupabase, "ws-starter", "whatsapp_broadcasts")
      ).rejects.toThrow(BillingRequiredError);

      await expect(
        assertWorkspaceFeature(mockSupabase, "ws-starter", "whatsapp_broadcasts")
      ).rejects.toThrow("Feature \"whatsapp_broadcasts\" is not available on the Starter plan");
    });

    it("assertWorkspaceAiEmployeeLimit enforces active agent capacity", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "sub-1",
                      workspace_id: "ws-1",
                      plan_id: "starter",
                      status: "active",
                      provenance: "stripe",
                      monthly_message_limit: 1000,
                      messages_used_this_period: 50,
                      current_period_end: new Date(Date.now() + 86400000).toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "workforce_agents") {
            return {
              select: () => ({
                eq: () => ({
                  eq: async () => ({ count: 2, error: null }),
                }),
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      } as unknown as SupabaseClient;

      // Starter allows 2 AI employees; 2 are already active, adding 1 more must reject
      await expect(
        assertWorkspaceAiEmployeeLimit(mockSupabase, "ws-1", 1)
      ).rejects.toThrow("AI Employee limit reached (2/2)");
    });

    it("getWorkspaceEntitlements accurately computes trial remaining and dunning days", async () => {
      const futureTrialEnd = new Date(Date.now() + 5 * 86400000).toISOString();
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "sub-trial",
                  workspace_id: "ws-trial",
                  plan_id: "growth",
                  status: "trialing",
                  provenance: "trial",
                  monthly_message_limit: 1000,
                  messages_used_this_period: 250,
                  current_period_end: futureTrialEnd,
                  trial_end: futureTrialEnd,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const details = await getWorkspaceEntitlements(mockSupabase, "ws-trial");
      expect(details.isEntitled).toBe(true);
      expect(details.trialActive).toBe(true);
      expect(details.trialDaysRemaining).toBe(5);
      expect(details.quotas.messages.used).toBe(250);
      expect(details.quotas.messages.remaining).toBe(750);
      expect(details.quotas.messages.percent).toBe(25);
      expect(details.features.whatsapp_broadcasts).toBe(true);
    });
  });

  describe("2. Verified Usage Accounting & Atomic Quota Metering", () => {
    it("records verified usage atomically through the record_verified_workspace_usage RPC", async () => {
      let rpcParams: any = null;
      const mockSupabase = {
        rpc: async (fn: string, params: any) => {
          if (fn === "record_verified_workspace_usage") {
            rpcParams = params;
            return {
              data: {
                success: true,
                record_id: "rec-uuid-123",
                workspace_id: params.p_workspace_id,
                messages_used_this_period: 15,
                monthly_message_limit: 1000,
                remaining: 985,
                is_exceeded: false,
                idempotent: false,
              },
              error: null,
            };
          }
          throw new Error(`Unexpected RPC: ${fn}`);
        },
      } as unknown as SupabaseClient;

      const result = await recordVerifiedWorkspaceUsage(mockSupabase, {
        workspaceId: "ws-100",
        metricName: "whatsapp_outbound",
        quantity: 5,
        idempotencyKey: "msg-idem-1",
        resourceId: "msg-123",
      });

      expect(result.success).toBe(true);
      expect(result.recordId).toBe("rec-uuid-123");
      expect(result.newUsage).toBe(15);
      expect(result.remaining).toBe(985);
      expect(rpcParams.p_workspace_id).toBe("ws-100");
      expect(rpcParams.p_metric_name).toBe("whatsapp_outbound");
      expect(rpcParams.p_quantity).toBe(5);
      expect(rpcParams.p_idempotency_key).toBe("msg-idem-1");
    });

    it("handles idempotency: returns idempotent=true without double counting", async () => {
      const mockSupabase = {
        rpc: async (fn: string) => {
          if (fn === "record_verified_workspace_usage") {
            return {
              data: {
                success: true,
                record_id: "existing-rec-uuid",
                workspace_id: "ws-100",
                messages_used_this_period: 15,
                monthly_message_limit: 1000,
                remaining: 985,
                is_exceeded: false,
                idempotent: true,
                action: "already_recorded",
              },
              error: null,
            };
          }
          throw new Error(`Unexpected RPC: ${fn}`);
        },
      } as unknown as SupabaseClient;

      const result = await recordVerifiedWorkspaceUsage(mockSupabase, {
        workspaceId: "ws-100",
        metricName: "whatsapp_outbound",
        quantity: 5,
        idempotencyKey: "msg-idem-1",
      });

      expect(result.success).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.recordId).toBe("existing-rec-uuid");
    });

    it("throws BillingRequiredError when quota is exceeded", async () => {
      const mockSupabase = {
        rpc: async () => ({
          data: {
            success: false,
            error: "Monthly message quota exceeded",
            limit_reached: true,
            is_exceeded: true,
          },
          error: null,
        }),
      } as unknown as SupabaseClient;

      await expect(
        recordVerifiedWorkspaceUsage(mockSupabase, {
          workspaceId: "ws-100",
          metricName: "whatsapp_outbound",
          quantity: 50,
        })
      ).rejects.toThrow(BillingRequiredError);
    });
  });

  describe("3. Stripe Subscription Checkout & Billing Portal", () => {
    it("creates a simulated checkout session in sandbox environment", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { stripe_customer_id: "cus_sim_123" }, error: null }),
                }),
              }),
              update: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          }
          if (table === "payment_checkouts") {
            return {
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: { id: "co-internal-999" }, error: null }),
                }),
              }),
              update: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      } as unknown as SupabaseClient;

      const checkout = await createWorkspaceSubscriptionCheckout(mockSupabase, {
        workspaceId: "ws-test",
        planId: "growth",
        interval: "month",
      });

      expect(checkout.planId).toBe("growth");
      expect(checkout.amount).toBe(149);
      expect(checkout.mode).toBe("simulated");
      expect(checkout.providerMode).toBe("sandbox");
      expect(checkout.checkoutUrl).toContain("checkout.stripe.com");
      expect(checkout.internalCheckoutId).toBe("co-internal-999");
    });

    it("creates a billing portal session for customer self-service", async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { stripe_customer_id: "cus_existing_456" }, error: null }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const portal = await createBillingPortalSession(mockSupabase, {
        workspaceId: "ws-portal",
      });

      expect(portal.customerId).toBe("cus_existing_456");
      expect(portal.url).toContain("billing.stripe.com");
    });
  });

  describe("4. Dunning Management & Recovery", () => {
    it("records payment failure, increments attempt counter, and activates 7-day grace period", async () => {
      let updatedPayload: any = null;
      let insertedMessage: any = null;

      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "sub-dunning-1",
                      workspace_id: "ws-dunning",
                      dunning_attempt_count: 0,
                      grace_period_end: null,
                      status: "active",
                    },
                    error: null,
                  }),
                }),
              }),
              update: (payload: any) => {
                updatedPayload = payload;
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          }
          if (table === "inbox_threads") {
            return {
              select: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { id: "thread-sys-1" }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === "inbox_messages") {
            return {
              insert: async (payload: any) => {
                insertedMessage = payload;
                return { error: null };
              },
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      } as unknown as SupabaseClient;

      const result = await recordDunningPaymentFailure(mockSupabase, {
        stripeSubscriptionId: "sub_stripe_111",
        amount: 149.0,
        currency: "USD",
        attemptCount: 1,
      });

      expect(result.success).toBe(true);
      expect(updatedPayload.status).toBe("past_due");
      expect(updatedPayload.dunning_status).toBe("grace_period");
      expect(updatedPayload.dunning_attempt_count).toBe(1);
      expect(updatedPayload.grace_period_end).toBeDefined();
      expect(insertedMessage.content).toContain("Payment failed");
      expect(insertedMessage.content).toContain("7-day grace period");
    });

    it("recovers from dunning on successful invoice payment", async () => {
      let updatedPayload: any = null;
      let insertedMessage: any = null;

      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "sub-dunning-2",
                      workspace_id: "ws-dunning-recover",
                      status: "past_due",
                      dunning_status: "grace_period",
                    },
                    error: null,
                  }),
                }),
              }),
              update: (payload: any) => {
                updatedPayload = payload;
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          }
          if (table === "inbox_threads") {
            return {
              select: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { id: "thread-sys-2" }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === "inbox_messages") {
            return {
              insert: async (payload: any) => {
                insertedMessage = payload;
                return { error: null };
              },
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      } as unknown as SupabaseClient;

      const result = await recordDunningPaymentRecovery(mockSupabase, {
        stripeSubscriptionId: "sub_stripe_111",
        amount: 149.0,
        currency: "USD",
      });

      expect(result.success).toBe(true);
      expect(updatedPayload.status).toBe("active");
      expect(updatedPayload.dunning_status).toBe("none");
      expect(updatedPayload.dunning_attempt_count).toBe(0);
      expect(updatedPayload.grace_period_end).toBeNull();
      expect(insertedMessage.content).toContain("Payment of $149.00 USD received successfully");
    });

    it("processes invoice.payment_failed through processStripeSubscriptionEvent with dunning", async () => {
      let updatedStatus: any = null;
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "sub-stripe-fail",
                      workspace_id: "ws-fail",
                      status: "active",
                      dunning_attempt_count: 0,
                    },
                    error: null,
                  }),
                }),
              }),
              update: (payload: any) => {
                updatedStatus = payload;
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          }
          if (table === "inbox_threads") {
            return {
              select: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      } as unknown as SupabaseClient;

      const event = {
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_fail_1",
            subscription: "sub_event_fail",
            customer: "cus_123",
            amount_due: 4900,
            currency: "usd",
            attempt_count: 1,
          },
        },
      };

      const result = await processStripeSubscriptionEvent(mockSupabase, event);
      expect(result.processed).toBe(true);
      expect(result.action).toBe("marked_past_due");
      expect(updatedStatus.status).toBe("past_due");
      expect(updatedStatus.dunning_status).toBe("grace_period");
    });
  });

  describe("7. Atomic Database-Backed Quota Reservations & Settlement", () => {
    it("proves releaseWorkspaceQuota enforces single-use release and prevents duplicate refunds", async () => {
      let currentUsage = 50;
      let reservationStatus = "reserved";

      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_quota_reservations") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "res-uuid-1",
                      reservation_id: "res-12345",
                      workspace_id: "ws-atomic-1",
                      metric_name: "whatsapp_outbound",
                      quantity: 5,
                      status: reservationStatus,
                    },
                    error: null,
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: async () => {
                  reservationStatus = payload.status;
                  return { error: null };
                },
              }),
            };
          }
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "sub-1",
                      workspace_id: "ws-atomic-1",
                      messages_used_this_period: currentUsage,
                    },
                    error: null,
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: async () => {
                  currentUsage = payload.messages_used_this_period;
                  return { error: null };
                },
              }),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        },
      } as unknown as SupabaseClient;

      // First release: should successfully reduce usage by 5 (50 -> 45)
      const firstRelease = await releaseWorkspaceQuota(mockSupabase, {
        workspaceId: "ws-atomic-1",
        quantity: 5,
        reservationId: "res-12345",
        reason: "failed_delivery",
      });

      expect(firstRelease.success).toBe(true);
      expect(firstRelease.newUsage).toBe(45);
      expect(firstRelease.idempotent).toBe(false);
      expect(currentUsage).toBe(45);
      expect(reservationStatus).toBe("released");

      // Second release with identical reservationId: idempotent, MUST NOT reduce usage again!
      const secondRelease = await releaseWorkspaceQuota(mockSupabase, {
        workspaceId: "ws-atomic-1",
        quantity: 5,
        reservationId: "res-12345",
        reason: "failed_delivery",
      });

      expect(secondRelease.success).toBe(true);
      expect(secondRelease.idempotent).toBe(true);
      // Usage remains strictly 45, NOT 40
      expect(secondRelease.newUsage).toBe(45);
      expect(currentUsage).toBe(45);
    });

    it("proves releaseWorkspaceQuota validates workspace ownership", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_quota_reservations") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "res-uuid-2",
                      reservation_id: "res-other-tenant",
                      workspace_id: "ws-tenant-victim",
                      quantity: 10,
                      status: "reserved",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        },
      } as unknown as SupabaseClient;

      await expect(
        releaseWorkspaceQuota(mockSupabase, {
          workspaceId: "ws-attacker",
          quantity: 10,
          reservationId: "res-other-tenant",
        })
      ).rejects.toThrow("Reservation ownership mismatch");
    });

    it("proves releaseWorkspaceQuota throws when database update fails", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "workspace_subscriptions") {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "sub-1",
                      messages_used_this_period: 20,
                    },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: async () => ({
                  error: { message: "connection timeout" },
                }),
              }),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        },
      } as unknown as SupabaseClient;

      await expect(
        releaseWorkspaceQuota(mockSupabase, {
          workspaceId: "ws-atomic-err",
          quantity: 2,
        })
      ).rejects.toThrow("Failed to update workspace subscription usage: connection timeout");
    });

    it("proves recordSpend enforces atomic admission and processes downward spend adjustment", async () => {
      let currentDaily = 5.0;
      const mockSupabase = {
        rpc: async (fn: string, params: any) => {
          if (fn === "record_agent_execution_spend_atomic") {
            const cost = params.p_cost_usd;
            if (cost > 0 && currentDaily + cost > 10.0) {
              return { data: { success: false, can_execute: false }, error: null };
            }
            currentDaily = Math.max(0, currentDaily + cost);
            return {
              data: { success: true, can_execute: true, daily_spend_usd: currentDaily },
              error: null,
            };
          }
          throw new Error(`Unexpected RPC ${fn}`);
        },
      } as unknown as SupabaseClient;

      // Positive spend exceeding limit is rejected by atomic admission
      const rejectRes = await recordSpend("ws-test", "agent-1", 10.0, mockSupabase);
      expect(rejectRes.canExecute).toBe(false);

      // Downward reconciliation adjustment reduces spend
      const adjustRes = await recordSpend("ws-test", "agent-1", -3.0, mockSupabase);
      expect(adjustRes.success).toBe(true);
      expect(adjustRes.canExecute).toBe(true);
      expect(adjustRes.newDailySpendUsd).toBe(2.0);
    });
  });
});
