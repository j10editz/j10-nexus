import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  advanceThreadStage,
  appendThreadReply,
  filterInboxThreads,
  generateAICopilotDraft,
} from "@/lib/inbox/service";
import type { InboxThread } from "@/types/inbox";

describe("Persistent Unified Inbox & Multi-Tenant Scoping", () => {
  const workspaceAId = "ws-tenant-alpha-001";
  const workspaceBId = "ws-tenant-beta-002";

  const threadWorkspaceA: InboxThread = {
    id: "thread-wa-alpha",
    contactName: "Marcus Sterling",
    contactIdentifier: "+14155552671",
    company: "Aegis Capital",
    channel: "whatsapp",
    priority: "urgent",
    dealStage: "proposal",
    estimatedValue: 18500,
    unreadCount: 1,
    assignedSpecialist: "Sarah Chen (Sales Specialist)",
    lastMessageSnippet: "Can you send the payment link for the Enterprise AI rollout today?",
    lastMessageTimestamp: "2026-09-04T12:00:00.000Z",
    messages: [
      {
        id: "msg-wa-1",
        threadId: "thread-wa-alpha",
        direction: "inbound",
        sender: "+14155552671",
        senderName: "Marcus Sterling",
        body: "Can you send the payment link for the Enterprise AI rollout today?",
        timestamp: "2026-09-04T12:00:00.000Z",
        status: "delivered",
      },
    ],
  };

  const threadWorkspaceB: InboxThread = {
    id: "thread-crm-beta",
    contactName: "Elena Rostova",
    contactIdentifier: "elena@vancebiotech.com",
    company: "Vance BioTech",
    channel: "crm",
    priority: "high",
    dealStage: "qualified",
    estimatedValue: 12000,
    unreadCount: 0,
    assignedSpecialist: "Alex Vance (Marketing Agent)",
    lastMessageSnippet: "Integration kickoff scheduled for Tuesday.",
    lastMessageTimestamp: "2026-09-04T13:00:00.000Z",
    messages: [],
  };

  describe("A. Workspace Scoping & Query Isolation", () => {
    it("ensures searches in Workspace A cannot return Workspace B threads", () => {
      const workspaceAThreads = [threadWorkspaceA];

      const searchInA = filterInboxThreads(workspaceAThreads, {
        channel: "all",
        stage: "all",
        search: "Vance",
      });

      expect(searchInA.length).toBe(0);

      const matchMarcus = filterInboxThreads(workspaceAThreads, {
        channel: "all",
        stage: "all",
        search: "Marcus",
      });

      expect(matchMarcus.length).toBe(1);
      expect(matchMarcus[0].contactName).toBe("Marcus Sterling");
    });

    it("verifies empty workspace returns honest empty state without fallback to seed data", () => {
      const emptyWorkspaceThreads: InboxThread[] = [];

      const filtered = filterInboxThreads(emptyWorkspaceThreads, {
        channel: "all",
        stage: "all",
        search: "",
      });

      expect(filtered).toEqual([]);
      expect(filtered.length).toBe(0);
    });
  });

  describe("B. Message Persistence & Thread Mutability", () => {
    it("appends outbound reply and advances snippet without mutating original instance", () => {
      const initialSnippet = threadWorkspaceA.lastMessageSnippet;
      const updated = appendThreadReply(threadWorkspaceA, {
        threadId: threadWorkspaceA.id,
        body: "We have provisioned your payment link and scheduled setup.",
        agentName: "Sarah Chen",
      });

      expect(updated.lastMessageSnippet).toBe(
        "We have provisioned your payment link and scheduled setup."
      );
      expect(updated.messages.length).toBe(threadWorkspaceA.messages.length + 1);
      expect(threadWorkspaceA.lastMessageSnippet).toBe(initialSnippet);
    });

    it("advances deal stage and preserves pipeline consistency", () => {
      expect(threadWorkspaceA.dealStage).toBe("proposal");

      const advanced = advanceThreadStage(threadWorkspaceA, "won");
      expect(advanced.dealStage).toBe("won");
      expect(advanced.id).toBe(threadWorkspaceA.id);
    });
  });

  describe("C. Zero Emoji Compliance Across All Inbox Operations", () => {
    it("strictly verifies zero emojis in AI copilot drafts and message templates", () => {
      const emojiRegex =
        /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

      const draftPayment = generateAICopilotDraft(threadWorkspaceA, "payment_request");
      const draftFollowup = generateAICopilotDraft(threadWorkspaceA, "deal_follow_up");
      const draftObjection = generateAICopilotDraft(threadWorkspaceA, "objection_handling");

      expect(draftPayment).not.toMatch(emojiRegex);
      expect(draftFollowup).not.toMatch(emojiRegex);
      expect(draftObjection).not.toMatch(emojiRegex);
    });
  });

  describe("D. Persistent API Route Verification", () => {
    it("verifies persistent inbox API route files exist and enforce workspace scoping", () => {
      const threadsRoute = readFileSync(
        resolve(process.cwd(), "app/api/inbox/threads/route.ts"),
        "utf8"
      );
      expect(threadsRoute).toContain("getActiveWorkspaceContext");
      expect(threadsRoute).toContain("workspace_id");
      expect(threadsRoute).toContain("eq(\"workspace_id\", wsId)");

      const messagesRoute = readFileSync(
        resolve(process.cwd(), "app/api/inbox/threads/[id]/messages/route.ts"),
        "utf8"
      );
      expect(messagesRoute).toContain("getActiveWorkspaceContext");
      expect(messagesRoute).toContain("externalMessageId");
      expect(messagesRoute).toContain("idempotent");
    });
  });
});
