import { describe, expect, it } from "vitest";

import {
  DEFAULT_WHATSAPP_GROUP_CONFIG,
  evaluateGroupMessage,
  executeGroupCommand,
  parseWhatsAppGroupConfig,
  type GroupMemberWarning,
  type WhatsAppGroupConfig,
} from "../../lib/whatsapp/group-bot";

describe("WhatsApp Group Bot & Guardian Engine", () => {
  describe("Configuration & Serialization", () => {
    it("initializes with default settings including all 10 active rules", () => {
      const config = parseWhatsAppGroupConfig({});
      expect(config.enabled).toBe(true);
      expect(config.warningThreshold).toBe(3);
      expect(config.rules.antiSpam).toBe(true);
      expect(config.rules.antiLink).toBe(true);
      expect(config.rules.forbiddenLinks).toBe(true);
      expect(config.rules.badWordFilter).toBe(true);
      expect(config.rules.antiFlood).toBe(true);
      expect(config.rules.scamDetection).toBe(true);
      expect(config.rules.aiContentModeration).toBe(true);
      expect(config.rules.autoDelete).toBe(true);
      expect(config.rules.warningSystem).toBe(true);
      expect(config.rules.autoRemoveMember).toBe(true);
    });

    it("parses custom overrides cleanly", () => {
      const custom = parseWhatsAppGroupConfig({
        groupName: "VIP Alpha Group",
        warningThreshold: 2,
        rules: {
          antiLink: false,
          antiSpam: true,
        },
        forbiddenDomains: ["badsite.org"],
      });

      expect(custom.groupName).toBe("VIP Alpha Group");
      expect(custom.warningThreshold).toBe(2);
      expect(custom.rules.antiLink).toBe(false);
      expect(custom.rules.antiSpam).toBe(true);
      expect(custom.forbiddenDomains).toContain("badsite.org");
    });
  });

  describe("Admin & Member Commands Router", () => {
    const config: WhatsAppGroupConfig = {
      ...DEFAULT_WHATSAPP_GROUP_CONFIG,
      admins: ["+14155550199"],
      bannedUsers: [],
    };

    it("executes !rules command and returns formatted guidelines", () => {
      const result = executeGroupCommand({
        text: "!rules",
        sender: "+14155552671",
        config,
      });

      expect(result.isCommand).toBe(true);
      expect(result.command).toBe("!rules");
      expect(result.action).toBe("reply");
      expect(result.replyText).toContain("OFFICIAL GROUP RULES");
    });

    it("executes !status command reporting active protection rules", () => {
      const result = executeGroupCommand({
        text: "!status",
        sender: "+14155552671",
        config,
      });

      expect(result.isCommand).toBe(true);
      expect(result.replyText).toContain("J10 GROUP GUARDIAN STATUS");
      expect(result.replyText).toContain("ACTIVE & OPERATIONAL");
      expect(result.replyText).toContain("10/10");
    });

    it("allows administrators to broadcast announcements via !announce", () => {
      const adminResult = executeGroupCommand({
        text: "!announce System update scheduled for 10 PM tonight.",
        sender: "+14155550199",
        senderName: "Owner",
        config,
      });

      expect(adminResult.isCommand).toBe(true);
      expect(adminResult.action).toBe("announcement");
      expect(adminResult.executedByAdmin).toBe(true);
      expect(adminResult.replyText).toContain("OFFICIAL GROUP ANNOUNCEMENT");
      expect(adminResult.replyText).toContain("System update scheduled");
    });

    it("blocks non-admins from executing !announce", () => {
      const memberResult = executeGroupCommand({
        text: "!announce Unauthorized announcement",
        sender: "+14155558888",
        config,
      });

      expect(memberResult.isCommand).toBe(true);
      expect(memberResult.executedByAdmin).toBe(false);
      expect(memberResult.replyText).toContain("PERMISSION DENIED");
    });

    it("creates interactive polls via !poll", () => {
      const pollResult = executeGroupCommand({
        text: "!poll Meeting Day | Monday | Wednesday | Friday",
        sender: "+14155550199",
        config,
      });

      expect(pollResult.isCommand).toBe(true);
      expect(pollResult.action).toBe("poll");
      expect(pollResult.replyText).toContain("COMMUNITY POLL: MEETING DAY");
      expect(pollResult.replyText).toContain("[1] Monday");
      expect(pollResult.replyText).toContain("[2] Wednesday");
      expect(pollResult.replyText).toContain("[3] Friday");
    });

    it("tracks member warnings and triggers auto-kick when reaching threshold", () => {
      const warningsMap = new Map<string, GroupMemberWarning>();
      const testConfig: WhatsAppGroupConfig = {
        ...config,
        warningThreshold: 3,
      };

      // Strike 1
      const warn1 = executeGroupCommand({
        text: "!warn @14155559999 posting spam",
        sender: "+14155550199",
        config: testConfig,
        warningsMap,
      });
      expect(warn1.action).toBe("warn");
      expect(warn1.replyText).toContain("(1/3)");

      // Strike 2
      const warn2 = executeGroupCommand({
        text: "!warn @14155559999 repeat violation",
        sender: "+14155550199",
        config: testConfig,
        warningsMap,
      });
      expect(warn2.action).toBe("warn");
      expect(warn2.replyText).toContain("(2/3)");

      // Strike 3 -> Auto-kick
      const warn3 = executeGroupCommand({
        text: "!warn @14155559999 third strike",
        sender: "+14155550199",
        config: testConfig,
        warningsMap,
      });
      expect(warn3.action).toBe("kick");
      expect(warn3.replyText).toContain("MEMBER REMOVED");
      expect(warn3.replyText).toContain("(3/3)");
    });

    it("supports !kick, !ban, and !unban for group management", () => {
      const activeConfig: WhatsAppGroupConfig = {
        ...config,
        bannedUsers: [],
      };

      const kick = executeGroupCommand({
        text: "!kick @14155557777 trolling in chat",
        sender: "+14155550199",
        config: activeConfig,
      });
      expect(kick.action).toBe("kick");
      expect(kick.replyText).toContain("MEMBER EJECTED");

      const ban = executeGroupCommand({
        text: "!ban @14155557777 persistent offender",
        sender: "+14155550199",
        config: activeConfig,
      });
      expect(ban.action).toBe("ban");
      expect(ban.replyText).toContain("MEMBER BANNED");
      expect(activeConfig.bannedUsers).toContain("14155557777");

      const unban = executeGroupCommand({
        text: "!unban @14155557777",
        sender: "+14155550199",
        config: activeConfig,
      });
      expect(unban.replyText).toContain("MEMBER UNBANNED");
      expect(activeConfig.bannedUsers).not.toContain("14155557777");
    });

    it("responds to !ai or @bot queries", () => {
      const aiResult = executeGroupCommand({
        text: "!ai how does your platform handle customer questions?",
        sender: "+14155552671",
        config,
        businessKnowledge: "J10 Nexus provides 24/7 autonomous support.",
      });

      expect(aiResult.isCommand).toBe(true);
      expect(aiResult.replyText).toContain("J10 AI ASSISTANT");
      expect(aiResult.replyText).toContain("knowledge base");
    });
  });

  describe("Group Guardian Real-Time Moderation Rules", () => {
    const config: WhatsAppGroupConfig = {
      ...DEFAULT_WHATSAPP_GROUP_CONFIG,
      admins: ["+14155550199"],
      warningThreshold: 3,
    };

    it("detects and deletes unauthorized external links (Anti-Link)", () => {
      const decision = evaluateGroupMessage({
        body: "Check out this great website: https://unauthorized-link.com/join",
        sender: "+14155553333",
        config,
      });

      expect(decision.violated).toBe(true);
      expect(decision.ruleKey).toBe("antiLink");
      expect(decision.action).toBe("delete");
      expect(decision.replyNotice).toContain("Anti-Link");
    });

    it("detects blacklisted domains (Forbidden Links)", () => {
      const decision = evaluateGroupMessage({
        body: "Claim free crypto bonus at claim-airdrop.xyz right now",
        sender: "+14155554444",
        config,
      });

      expect(decision.violated).toBe(true);
      expect(decision.ruleKey).toBe("forbiddenLinks");
      expect(decision.replyNotice).toContain("Forbidden Links");
    });

    it("flags prohibited words and phrases (Bad Word Filter)", () => {
      const decision = evaluateGroupMessage({
        body: "Join our team, 1000% profit guaranteed daily!",
        sender: "+14155555555",
        config,
      });

      expect(decision.violated).toBe(true);
      expect(decision.ruleKey).toBe("badWordFilter");
      expect(decision.replyNotice).toContain("Bad Word Filter");
    });

    it("detects crypto and phishing scam patterns (Scam Detection)", () => {
      const decision = evaluateGroupMessage({
        body: "Official crypto giveaway! Send 1 ETH to double your eth instantly.",
        sender: "+14155556666",
        config,
      });

      expect(decision.violated).toBe(true);
      expect(decision.ruleKey).toBe("scamDetection");
      expect(decision.replyNotice).toContain("Scam Detection");
    });

    it("detects rapid message flooding (Anti-Flood)", () => {
      const now = Date.now();
      const recentHistory = [
        { sender: "+14155557777", timestamp: now - 1000 },
        { sender: "+14155557777", timestamp: now - 2000 },
        { sender: "+14155557777", timestamp: now - 3000 },
        { sender: "+14155557777", timestamp: now - 4000 },
      ];

      const decision = evaluateGroupMessage({
        body: "Hello anyone here?",
        sender: "+14155557777",
        config,
        recentMessages: recentHistory,
      });

      expect(decision.violated).toBe(true);
      expect(decision.ruleKey).toBe("antiFlood");
      expect(decision.replyNotice).toContain("Anti-Flood");
    });

    it("allows administrators to post links without being moderated", () => {
      const decision = evaluateGroupMessage({
        body: "Admins can post documentation: https://j10nexus.com/docs",
        sender: "+14155550199",
        config,
      });

      expect(decision.violated).toBe(false);
      expect(decision.action).toBe("none");
    });

    it("allows clean everyday chat messages to pass cleanly", () => {
      const decision = evaluateGroupMessage({
        body: "Hello everyone, excited to be part of the community!",
        sender: "+14155551111",
        config,
      });

      expect(decision.violated).toBe(false);
      expect(decision.action).toBe("none");
    });
  });
});
