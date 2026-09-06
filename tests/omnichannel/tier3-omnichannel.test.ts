import { describe, expect, it, vi } from "vitest";
import { CHANNEL_METADATA } from "@/lib/inbox/service";
import type {
  ActiveViewerPresence,
  InboxChannel,
  OmnichannelRoutingRule,
  OmnichannelSlaPolicy,
} from "@/types/inbox";
import {
  evaluateRoutingRules,
  type RoutingContext,
} from "@/lib/omnichannel/routing";
import {
  DEFAULT_SLA_TARGETS,
  evaluateThreadSla,
  resolveMatchedSlaPolicy,
} from "@/lib/omnichannel/sla";
import {
  evaluateLockAcquisition,
  pruneStalePresences,
  recordPresenceHeartbeat,
  verifyReplyCollisionGuard,
} from "@/lib/omnichannel/collision";
import {
  sendChannelProviderMessage,
  resolveWorkspaceChannelCredentials,
  updateOmnichannelDeliveryStatus,
} from "@/lib/omnichannel/dispatch";
import { normalizeInboundPayload } from "@/lib/omnichannel/inbound";

describe("Tier 3 — True Omnichannel Operations", () => {
  describe("1. Multi-Channel Matrix & Metadata", () => {
    const requiredChannels: InboxChannel[] = [
      "whatsapp",
      "website",
      "crm",
      "email",
      "sms",
      "webchat",
      "instagram",
      "messenger",
      "whatsapp_group",
    ];

    it("supports all 9 required omnichannel channels with valid metadata", () => {
      expect(requiredChannels.length).toBe(9);
      for (const ch of requiredChannels) {
        expect(CHANNEL_METADATA[ch]).toBeDefined();
        expect(CHANNEL_METADATA[ch].label).toBeTruthy();
        expect(CHANNEL_METADATA[ch].badgeClass).toBeTruthy();
      }
    });

    it("strictly preserves zero emojis across all channel labels and badges", () => {
      const emojiRegex =
        /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

      for (const ch of requiredChannels) {
        expect(CHANNEL_METADATA[ch].label).not.toMatch(emojiRegex);
      }
    });
  });

  describe("2. Intelligent Routing & Assignment Engine", () => {
    const sampleRules: OmnichannelRoutingRule[] = [
      {
        id: "rule-vip-email",
        workspaceId: "ws-1",
        name: "VIP Enterprise Inbound",
        channel: "email",
        conditions: [
          { field: "vip", operator: "equals", value: "true" },
          { field: "priority", operator: "equals", value: "urgent" },
        ],
        routingStrategy: "direct_assignment",
        targetUserId: "user-exec-1",
        targetTeam: "executive_support",
        priorityOrder: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "rule-sms-least-loaded",
        workspaceId: "ws-1",
        name: "SMS Rapid Dispatch",
        channel: "sms",
        conditions: [],
        routingStrategy: "least_loaded",
        targetTeam: "mobile_agents",
        priorityOrder: 2,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "rule-webchat-ai",
        workspaceId: "ws-1",
        name: "Website Live AI Triage",
        channel: "webchat",
        conditions: [
          { field: "keyword", operator: "contains", value: "pricing" },
        ],
        routingStrategy: "ai_specialist",
        targetAgentId: "agent-sales-bot",
        targetTeam: "ai_sales",
        priorityOrder: 3,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "rule-wa-skill",
        workspaceId: "ws-1",
        name: "WhatsApp Billing Support",
        channel: "whatsapp",
        conditions: [
          { field: "keyword", operator: "contains", value: "invoice" },
        ],
        routingStrategy: "skill_based",
        targetTeam: "billing_specialist",
        priorityOrder: 4,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it("routes VIP urgent email directly to target executive user", () => {
      const context: RoutingContext = {
        channel: "email",
        priority: "urgent",
        content: "We need an immediate enterprise NDA review.",
        contactTags: ["vip"],
      };

      const result = evaluateRoutingRules(sampleRules, context);
      expect(result.matchedRuleId).toBe("rule-vip-email");
      expect(result.assignedUserId).toBe("user-exec-1");
      expect(result.assignedTeam).toBe("executive_support");
      expect(result.strategyUsed).toBe("direct_assignment");
    });

    it("load-balances SMS inquiries to the least-loaded team member", () => {
      const context: RoutingContext = {
        channel: "sms",
        priority: "high",
        content: "Can you confirm my appointment time?",
        activeMembers: [
          { id: "agent-1", name: "Alice", activeCount: 7 },
          { id: "agent-2", name: "Bob", activeCount: 2 },
          { id: "agent-3", name: "Charlie", activeCount: 5 },
        ],
      };

      const result = evaluateRoutingRules(sampleRules, context);
      expect(result.matchedRuleId).toBe("rule-sms-least-loaded");
      expect(result.assignedUserId).toBe("agent-2");
      expect(result.strategyUsed).toBe("least_loaded");
      expect(result.reason).toContain("Bob");
    });

    it("routes pricing webchat inquiries to AI specialist agent", () => {
      const context: RoutingContext = {
        channel: "webchat",
        priority: "medium",
        content: "What is your pricing tier for 50 agents?",
        workforceAgents: [
          { id: "agent-sales-bot", name: "Autonomous Sales Bot", role: "sales" },
        ],
      };

      const result = evaluateRoutingRules(sampleRules, context);
      expect(result.matchedRuleId).toBe("rule-webchat-ai");
      expect(result.assignedAgentId).toBe("agent-sales-bot");
      expect(result.strategyUsed).toBe("ai_specialist");
    });

    it("matches required skills for WhatsApp billing queries", () => {
      const context: RoutingContext = {
        channel: "whatsapp",
        priority: "medium",
        content: "Need to update credit card on our invoice.",
        activeMembers: [
          { id: "user-general", name: "Dave", activeCount: 1, skills: ["general"] },
          { id: "user-billing", name: "Eve", activeCount: 4, skills: ["billing_specialist"] },
        ],
      };

      const result = evaluateRoutingRules(sampleRules, context);
      expect(result.matchedRuleId).toBe("rule-wa-skill");
      expect(result.assignedUserId).toBe("user-billing");
      expect(result.strategyUsed).toBe("skill_based");
    });

    it("falls back gracefully when no rules match", () => {
      const context: RoutingContext = {
        channel: "instagram",
        priority: "low",
        content: "Great product post!",
      };

      const result = evaluateRoutingRules(sampleRules, context);
      expect(result.matchedRuleId).toBeUndefined();
      expect(result.assignedTeam).toBe("general");
    });
  });

  describe("3. Enterprise SLAs & Breach Calculation", () => {
    it("provides default SLA targets per priority", () => {
      expect(DEFAULT_SLA_TARGETS.urgent.firstResponseMinutes).toBe(10);
      expect(DEFAULT_SLA_TARGETS.urgent.resolutionMinutes).toBe(60);
      expect(DEFAULT_SLA_TARGETS.high.firstResponseMinutes).toBe(30);
      expect(DEFAULT_SLA_TARGETS.medium.firstResponseMinutes).toBe(120);
      expect(DEFAULT_SLA_TARGETS.low.firstResponseMinutes).toBe(480);
    });

    it("resolves exact priority and channel SLA policy", () => {
      const policies: OmnichannelSlaPolicy[] = [
        {
          id: "sla-wa-urgent",
          workspaceId: "ws-1",
          name: "WhatsApp Urgent VIP",
          priority: "urgent",
          channel: "whatsapp",
          firstResponseTargetMinutes: 5,
          resolutionTargetMinutes: 30,
          warningThresholdPercent: 80,
          isDefault: false,
          createdAt: "",
          updatedAt: "",
        },
      ];

      const match = resolveMatchedSlaPolicy(policies, "urgent", "whatsapp");
      expect(match.policyId).toBe("sla-wa-urgent");
      expect(match.firstResponseMinutes).toBe(5);
      expect(match.resolutionMinutes).toBe(30);
    });

    it("evaluates healthy SLA when within time window", () => {
      const now = new Date("2026-09-06T12:00:00Z");
      const created = new Date("2026-09-06T11:55:00Z"); // 5m elapsed
      const due = new Date("2026-09-06T12:15:00Z"); // 15m remaining (out of 20m window)

      const result = evaluateThreadSla({
        createdAt: created,
        firstResponseDueAt: due,
        now,
      });

      expect(result.status).toBe("healthy");
      expect(result.isFirstResponseBreached).toBe(false);
      expect(result.isWarning).toBe(false);
      expect(result.minutesRemaining).toBe(15);
    });

    it("triggers SLA warning when approaching threshold (>=80% elapsed)", () => {
      const now = new Date("2026-09-06T12:08:30Z");
      const created = new Date("2026-09-06T12:00:00Z"); // 8.5m elapsed
      const due = new Date("2026-09-06T12:10:00Z"); // 1.5m remaining (out of 10m window = 85% elapsed)

      const result = evaluateThreadSla({
        createdAt: created,
        firstResponseDueAt: due,
        warningThresholdPercent: 80,
        now,
      });

      expect(result.status).toBe("warning");
      expect(result.isWarning).toBe(true);
      expect(result.isFirstResponseBreached).toBe(false);
      expect(result.minutesRemaining).toBe(2);
    });

    it("detects SLA breach when response deadline has passed without reply", () => {
      const now = new Date("2026-09-06T12:15:00Z");
      const created = new Date("2026-09-06T12:00:00Z");
      const due = new Date("2026-09-06T12:10:00Z"); // 5m past deadline

      const result = evaluateThreadSla({
        createdAt: created,
        firstResponseDueAt: due,
        now,
      });

      expect(result.status).toBe("breached");
      expect(result.isFirstResponseBreached).toBe(true);
    });

    it("correctly acknowledges fulfilled SLA when response was logged on time", () => {
      const created = new Date("2026-09-06T12:00:00Z");
      const due = new Date("2026-09-06T12:15:00Z");
      const responded = new Date("2026-09-06T12:08:00Z"); // Responded in 8 mins (on time)
      const now = new Date("2026-09-06T13:00:00Z"); // 1 hr later

      const result = evaluateThreadSla({
        createdAt: created,
        firstResponseDueAt: due,
        firstRespondedAt: responded,
        now,
      });

      expect(result.isFirstResponseBreached).toBe(false);
      expect(result.firstResponseMinutesTaken).toBe(8);
    });
  });

  describe("4. Agent Collision Prevention & Lease Locking", () => {
    it("prunes stale presence heartbeats older than TTL", () => {
      const now = new Date("2026-09-06T12:00:00Z");
      const viewers: ActiveViewerPresence[] = [
        {
          userId: "user-1",
          userName: "Active Agent",
          action: "typing",
          lastSeenAt: new Date("2026-09-06T11:59:45Z").toISOString(), // 15s ago: ACTIVE
        },
        {
          userId: "user-2",
          userName: "Stale Agent",
          action: "viewing",
          lastSeenAt: new Date("2026-09-06T11:59:10Z").toISOString(), // 50s ago: STALE
        },
      ];

      const active = pruneStalePresences(viewers, 30, now);
      expect(active.length).toBe(1);
      expect(active[0].userId).toBe("user-1");
    });

    it("records and updates viewer presence heartbeat", () => {
      const now = new Date("2026-09-06T12:00:00Z");
      let viewers: ActiveViewerPresence[] = [];

      viewers = recordPresenceHeartbeat(viewers, "user-1", "Sarah", "viewing", now);
      expect(viewers.length).toBe(1);
      expect(viewers[0].action).toBe("viewing");

      // Switch to typing
      viewers = recordPresenceHeartbeat(viewers, "user-1", "Sarah", "typing", now);
      expect(viewers.length).toBe(1);
      expect(viewers[0].action).toBe("typing");
    });

    it("grants exclusive thread lock when thread is unencumbered", () => {
      const now = new Date("2026-09-06T12:00:00Z");
      const result = evaluateLockAcquisition({
        requestingUserId: "user-1",
        requestingUserName: "Sarah Chen",
        ttlSeconds: 60,
        now,
      });

      expect(result.success).toBe(true);
      expect(result.lockState.isLocked).toBe(true);
      expect(result.lockState.lockedByUserId).toBe("user-1");
      expect(result.lockState.isHeldByMe).toBe(true);
    });

    it("prevents collision when another user holds an unexpired lock", () => {
      const now = new Date("2026-09-06T12:00:00Z");
      const currentLock = {
        lockedByUserId: "user-1",
        lockedByUserName: "Sarah Chen",
        lockedAt: "2026-09-06T11:59:30Z",
        lockExpiresAt: "2026-09-06T12:00:30Z", // 30s remaining
      };

      const result = evaluateLockAcquisition({
        currentLock,
        requestingUserId: "user-2",
        requestingUserName: "Alex Rivera",
        now,
      });

      expect(result.success).toBe(false);
      expect(result.conflictUser).toBe("Sarah Chen");
      expect(result.error).toContain("Collision prevented");
    });

    it("permits acquisition when current lock is expired", () => {
      const now = new Date("2026-09-06T12:01:00Z");
      const currentLock = {
        lockedByUserId: "user-1",
        lockedByUserName: "Sarah Chen",
        lockedAt: "2026-09-06T11:59:00Z",
        lockExpiresAt: "2026-09-06T12:00:00Z", // Expired 1m ago
      };

      const result = evaluateLockAcquisition({
        currentLock,
        requestingUserId: "user-2",
        requestingUserName: "Alex Rivera",
        now,
      });

      expect(result.success).toBe(true);
      expect(result.lockState.lockedByUserId).toBe("user-2");
      expect(result.lockState.isHeldByMe).toBe(true);
    });

    it("permits lease takeover when force override is provided", () => {
      const now = new Date("2026-09-06T12:00:00Z");
      const currentLock = {
        lockedByUserId: "user-1",
        lockedByUserName: "Sarah Chen",
        lockedAt: "2026-09-06T11:59:30Z",
        lockExpiresAt: "2026-09-06T12:00:30Z",
      };

      const result = evaluateLockAcquisition({
        currentLock,
        requestingUserId: "user-2",
        requestingUserName: "Manager Alex",
        forceOverride: true,
        now,
      });

      expect(result.success).toBe(true);
      expect(result.lockState.lockedByUserId).toBe("user-2");
    });

    it("verifies reply collision guard blocks unauthorized send", () => {
      const now = new Date("2026-09-06T12:00:00Z");
      const lock = {
        lockedByUserId: "user-1",
        lockedByUserName: "Sarah Chen",
        lockExpiresAt: "2026-09-06T12:00:30Z",
      };

      const checkDenied = verifyReplyCollisionGuard({
        currentLock: lock,
        currentUserId: "user-2",
        now,
      });
      expect(checkDenied.allowed).toBe(false);
      expect(checkDenied.reason).toContain("Active lock held by Sarah Chen");

      const checkAllowed = verifyReplyCollisionGuard({
        currentLock: lock,
        currentUserId: "user-1",
        now,
      });
      expect(checkAllowed.allowed).toBe(true);
    });
  });

  describe("5. Multi-Channel Outbound Dispatch Engine", () => {
    it("routes outbound messages through appropriate channel providers with honest unconfigured handling", async () => {
      // 1. Unconfigured channels return unavailable honestly
      const unconfEmail = await sendChannelProviderMessage({
        channel: "email",
        recipient: "executive@aegis.com",
        body: "Attached is your proposal.",
      });
      expect(unconfEmail.provider).toBe("resend");
      expect(unconfEmail.status).toBe("unavailable");

      const unconfSms = await sendChannelProviderMessage({
        channel: "sms",
        recipient: "+14155552671",
        body: "Your verification code is 492019",
      });
      expect(unconfSms.provider).toBe("twilio");
      expect(unconfSms.status).toBe("unavailable");

      const unconfIg = await sendChannelProviderMessage({
        channel: "instagram",
        recipient: "ig_recipient_123",
        body: "Hello",
      });
      expect(unconfIg.provider).toBe("meta_graph_instagram");
      expect(unconfIg.status).toBe("unavailable");

      const unconfGroup = await sendChannelProviderMessage({
        channel: "whatsapp_group",
        recipient: "group_123",
        body: "Alert",
      });
      expect(unconfGroup.provider).toBe("whatsapp_cloud_group");
      expect(unconfGroup.status).toBe("unavailable");

      // 2. Configured channels invoke genuine provider adapters and return accurate delivery states
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes("resend.com")) {
            return {
              ok: true,
              json: async () => ({ id: "email_msg_live_resend_991" }),
            } as any;
          }
          if (urlStr.includes("twilio.com")) {
            return {
              ok: true,
              json: async () => ({ sid: "SM_twilio_live_882", status: "queued" }),
            } as any;
          }
          if (urlStr.includes("graph.facebook.com") && urlStr.includes("messages")) {
            return {
              ok: true,
              json: async () => ({
                messages: [{ id: "wamid.HBgL1726000GRP" }],
                message_id: "ig_mid_live_773",
              }),
            } as any;
          }
          return { ok: false, statusText: "Not found", json: async () => ({}) } as any;
        });

        const email = await sendChannelProviderMessage({
          channel: "email",
          recipient: "executive@aegis.com",
          body: "Attached is your proposal.",
          credentials: { resendApiKey: "re_live_test_key" },
        });
        expect(email.provider).toBe("resend");
        expect(email.status).toBe("sent");
        expect(email.externalId).toBe("email_msg_live_resend_991");

        const sms = await sendChannelProviderMessage({
          channel: "sms",
          recipient: "+14155552671",
          body: "Your verification code is 492019",
          credentials: {
            twilioAccountSid: "AC_live_123",
            twilioAuthToken: "auth_token_456",
          },
        });
        expect(sms.provider).toBe("twilio");
        expect(sms.status).toBe("queued");
        expect(sms.externalId).toBe("SM_twilio_live_882");

        const ig = await sendChannelProviderMessage({
          channel: "instagram",
          recipient: "ig_recipient_123",
          body: "Thank you for reaching out!",
          credentials: { metaGraphAccessToken: "meta_token_789" },
        });
        expect(ig.provider).toBe("meta_graph_instagram");
        expect(ig.status).toBe("sent");
        expect(ig.externalId).toBe("ig_mid_live_773");

        const group = await sendChannelProviderMessage({
          channel: "whatsapp_group",
          recipient: "group_trading_desk_12",
          body: "Alert: Market volatility threshold triggered.",
          credentials: {
            whatsappAccessToken: "wa_token_abc",
            whatsappPhoneNumberId: "phone_id_def",
          },
        });
        expect(group.provider).toBe("whatsapp_cloud_group");
        expect(group.status).toBe("sent");
        expect(group.externalId).toBe("wamid.HBgL1726000GRP");

        const webchat = await sendChannelProviderMessage({
          channel: "webchat",
          recipient: "session_123",
          body: "Live agent online",
        });
        expect(webchat.provider).toBe("internal_websocket");
        expect(webchat.status).toBe("delivered");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("6. Inbound Webhook Normalization Adapter", () => {
    it("normalizes inbound Email webhooks", () => {
      const norm = normalizeInboundPayload("email", {
        from: "marcus@aegiscapital.com",
        fromName: "Marcus Sterling",
        subject: "Enterprise Rollout Questions",
        text: "Can we review the SOC2 audit before final signing?",
      });

      expect(norm.channel).toBe("email");
      expect(norm.senderIdentifier).toBe("marcus@aegiscapital.com");
      expect(norm.senderName).toBe("Marcus Sterling");
      expect(norm.content).toContain("SOC2");
      expect(norm.metadata?.subject).toBe("Enterprise Rollout Questions");
    });

    it("normalizes inbound SMS webhooks", () => {
      const norm = normalizeInboundPayload("sms", {
        From: "+14155552671",
        Body: "Yes, ready to proceed.",
        MessageSid: "SM_test_12345",
      });

      expect(norm.channel).toBe("sms");
      expect(norm.senderIdentifier).toBe("+14155552671");
      expect(norm.content).toBe("Yes, ready to proceed.");
      expect(norm.metadata?.smsMessageSid).toBe("SM_test_12345");
    });

    it("normalizes inbound WhatsApp Group messages", () => {
      const norm = normalizeInboundPayload("whatsapp_group", {
        groupId: "grp_london_syndicate",
        groupName: "London Syndicate Group",
        participant: "+447911123456",
        participantName: "David Croft",
        text: "@J10Nexus generate today's closing summary",
      });

      expect(norm.channel).toBe("whatsapp_group");
      expect(norm.externalThreadId).toBe("grp_london_syndicate");
      expect(norm.company).toBe("London Syndicate Group");
      expect(norm.senderName).toContain("David Croft");
      expect(norm.content).toContain("@J10Nexus");
      expect(norm.priority).toBe("urgent");
    });
  });

  describe("7. Server-Side Credential Resolution & Real Delivery Callbacks", () => {
    it("resolves workspace-specific integration credentials when connected", async () => {
      const mockSupabase = {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [
                  {
                    provider: "twilio",
                    status: "connected",
                    public_configuration: {
                      twilioAccountSid: "AC_custom_workspace_sid",
                      twilioAuthToken: "token_custom_workspace",
                      twilioFromPhone: "+15550001111",
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      } as any;

      const res = await resolveWorkspaceChannelCredentials(mockSupabase, "ws-custom", "sms");
      expect(res.isSharedPlatform).toBe(false);
      expect(res.credentials.twilioAccountSid).toBe("AC_custom_workspace_sid");
      expect(res.credentials.twilioAuthToken).toBe("token_custom_workspace");
      expect(res.credentials.twilioFromPhone).toBe("+15550001111");
    });

    it("falls back to shared platform environment when workspace has no custom integration", async () => {
      const originalSid = process.env.TWILIO_ACCOUNT_SID;
      const originalToken = process.env.TWILIO_AUTH_TOKEN;
      process.env.TWILIO_ACCOUNT_SID = "AC_platform_shared_sid";
      process.env.TWILIO_AUTH_TOKEN = "token_platform_shared";

      try {
        const mockSupabase = {
          from: (table: string) => ({
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        } as any;

        const res = await resolveWorkspaceChannelCredentials(mockSupabase, "ws-platform", "sms");
        expect(res.isSharedPlatform).toBe(true);
        expect(res.credentials.twilioAccountSid).toBe("AC_platform_shared_sid");
      } finally {
        process.env.TWILIO_ACCOUNT_SID = originalSid;
        process.env.TWILIO_AUTH_TOKEN = originalToken;
      }
    });

    it("updates message delivery status upon verified provider delivery receipt callback", async () => {
      let updatedStatus = "";
      const loggedEvents: any[] = [];

      const mockSupabase = {
        from: (table: string) => {
          if (table === "inbox_messages") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { id: "msg-outbound-1", thread_id: "thread-1", delivery_status: "sent" },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (updates: any) => ({
                eq: () => ({
                  eq: async () => {
                    updatedStatus = updates.delivery_status;
                    return { error: null };
                  },
                }),
              }),
            };
          }
          if (table === "omnichannel_dispatch_logs") {
            return {
              insert: async (row: any) => {
                loggedEvents.push(row);
                return { error: null };
              },
            };
          }
          throw new Error(`Unexpected table ${table}`);
        },
      } as any;

      const callbackResult = await updateOmnichannelDeliveryStatus(mockSupabase, {
        workspaceId: "ws-test",
        externalMessageId: "ext-msg-12345",
        deliveryStatus: "delivered",
        provider: "whatsapp_cloud",
        rawPayload: { status: "delivered", timestamp: "1725600000" },
      });

      expect(callbackResult.success).toBe(true);
      expect(callbackResult.messageId).toBe("msg-outbound-1");
      expect(callbackResult.updatedStatus).toBe("delivered");
      expect(updatedStatus).toBe("delivered");
      expect(loggedEvents.length).toBe(1);
      expect(loggedEvents[0].status).toBe("delivered");
      expect(loggedEvents[0].provider).toBe("whatsapp_cloud");
    });
  });
});
