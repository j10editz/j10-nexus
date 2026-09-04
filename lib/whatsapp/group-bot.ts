import type { IntegrationConnection } from "@/types/integration";
import { generateGroundedGroupAnswer } from "./group-knowledge";

export const WHATSAPP_GROUP_CONFIG_KEY = "whatsapp_group_guardian_config";

export type GroupModerationAction =
  | "none"
  | "reply"
  | "warn"
  | "delete"
  | "kick"
  | "ban"
  | "poll"
  | "announcement";

export type GroupModerationRuleKey =
  | "antiSpam"
  | "antiLink"
  | "forbiddenLinks"
  | "badWordFilter"
  | "antiFlood"
  | "scamDetection"
  | "aiContentModeration"
  | "autoDelete"
  | "warningSystem"
  | "autoRemoveMember";

export type WhatsAppGroupConfig = {
  enabled: boolean;
  groupName: string;
  groupId?: string;
  warningThreshold: number;
  customRulesText: string;
  forbiddenDomains: string[];
  bannedKeywords: string[];
  admins: string[];
  bannedUsers: string[];
  rules: Record<GroupModerationRuleKey, boolean>;
};

export type GroupMemberWarning = {
  user: string;
  count: number;
  reasons: string[];
  lastWarnedAt: string;
  kicked: boolean;
};

export type GroupModerationEvent = {
  id: string;
  timestamp: string;
  sender: string;
  senderName?: string;
  action: GroupModerationAction;
  ruleViolated?: string;
  reason: string;
  messageSnippet?: string;
  details?: Record<string, unknown>;
};

export type GroupCommandResult = {
  isCommand: boolean;
  command?: string;
  action: GroupModerationAction;
  replyText: string;
  executedByAdmin: boolean;
  targetUser?: string;
  moderationEvent?: GroupModerationEvent;
  pollData?: {
    question: string;
    options: string[];
  };
};

export type GroupModerationDecision = {
  violated: boolean;
  ruleKey?: GroupModerationRuleKey;
  ruleName?: string;
  action: GroupModerationAction;
  reason: string;
  replyNotice?: string;
  warningsCount?: number;
  maxWarnings?: number;
  autoRemoved?: boolean;
  moderationEvent?: GroupModerationEvent;
};

export const DEFAULT_GROUP_RULES_TEXT = `📋 *OFFICIAL GROUP RULES & CODE OF CONDUCT*
1. *Respect all members*: Harassment, abuse, or hate speech is strictly prohibited.
2. *No unauthorized links*: Spamming external invite links or unauthorized websites will result in an instant warning.
3. *No commercial spam or scams*: Crypto airdrops, unsolicited promotional offers, or MLM schemes lead to immediate expulsion.
4. *Keep topics relevant*: Stay aligned with the community purpose and discussions.
5. *Three-strike policy*: Accumulating 3 warnings triggers automatic removal from the group.
_Type !help to see available commands or reach out to group administrators._`;

export const DEFAULT_FORBIDDEN_DOMAINS = [
  "scam.com",
  "claim-airdrop.xyz",
  "t.me/freecrypto",
  "wa.me/settings",
  "bit.ly/malicious-link",
  "crypto-profit.biz",
  "free-followers.net",
];

export const DEFAULT_BANNED_KEYWORDS = [
  "free money",
  "crypto pump",
  "1000% profit guaranteed",
  "dm me for signals",
  "claim your airdrop",
  "double your bitcoin",
  "work from home earn 5000",
];

export const DEFAULT_WHATSAPP_GROUP_CONFIG: WhatsAppGroupConfig = {
  enabled: true,
  groupName: "J10 Protected Group",
  warningThreshold: 3,
  customRulesText: DEFAULT_GROUP_RULES_TEXT,
  forbiddenDomains: DEFAULT_FORBIDDEN_DOMAINS,
  bannedKeywords: DEFAULT_BANNED_KEYWORDS,
  admins: ["+14155550199", "+14155550100"],
  bannedUsers: [],
  rules: {
    antiSpam: true,
    antiLink: true,
    forbiddenLinks: true,
    badWordFilter: true,
    antiFlood: true,
    scamDetection: true,
    aiContentModeration: true,
    autoDelete: true,
    warningSystem: true,
    autoRemoveMember: true,
  },
};

const URL_PATTERN = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|org|net|xyz|biz|info|top|io|cc|co)\b)/i;
const INVITE_LINK_PATTERN = /(chat\.whatsapp\.com\/[A-Za-z0-9]+)|(t\.me\/[A-Za-z0-9_]+)|(wa\.me\/[0-9]+)/i;

export function parseWhatsAppGroupConfig(value: unknown): WhatsAppGroupConfig {
  let source: Record<string, unknown> = {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      source = parsed as Record<string, unknown>;
    }
  } catch {}

  const rawRules = (source.rules && typeof source.rules === "object" && !Array.isArray(source.rules))
    ? (source.rules as Record<string, unknown>)
    : {};

  const rules: Record<GroupModerationRuleKey, boolean> = {
    antiSpam: rawRules.antiSpam !== false,
    antiLink: rawRules.antiLink !== false,
    forbiddenLinks: rawRules.forbiddenLinks !== false,
    badWordFilter: rawRules.badWordFilter !== false,
    antiFlood: rawRules.antiFlood !== false,
    scamDetection: rawRules.scamDetection !== false,
    aiContentModeration: rawRules.aiContentModeration !== false,
    autoDelete: rawRules.autoDelete !== false,
    warningSystem: rawRules.warningSystem !== false,
    autoRemoveMember: rawRules.autoRemoveMember !== false,
  };

  const forbiddenDomains = Array.isArray(source.forbiddenDomains)
    ? source.forbiddenDomains.filter((d): d is string => typeof d === "string" && Boolean(d.trim()))
    : DEFAULT_FORBIDDEN_DOMAINS;

  const bannedKeywords = Array.isArray(source.bannedKeywords)
    ? source.bannedKeywords.filter((k): k is string => typeof k === "string" && Boolean(k.trim()))
    : DEFAULT_BANNED_KEYWORDS;

  const admins = Array.isArray(source.admins)
    ? source.admins.filter((a): a is string => typeof a === "string" && Boolean(a.trim()))
    : DEFAULT_WHATSAPP_GROUP_CONFIG.admins;

  const bannedUsers = Array.isArray(source.bannedUsers)
    ? source.bannedUsers.filter((u): u is string => typeof u === "string" && Boolean(u.trim()))
    : [];

  const threshold = typeof source.warningThreshold === "number" && source.warningThreshold >= 1 && source.warningThreshold <= 10
    ? source.warningThreshold
    : 3;

  return {
    enabled: source.enabled !== false,
    groupName: typeof source.groupName === "string" && source.groupName.trim() ? source.groupName.trim() : DEFAULT_WHATSAPP_GROUP_CONFIG.groupName,
    groupId: typeof source.groupId === "string" ? source.groupId.trim() : undefined,
    warningThreshold: threshold,
    customRulesText: typeof source.customRulesText === "string" && source.customRulesText.trim() ? source.customRulesText.trim() : DEFAULT_GROUP_RULES_TEXT,
    forbiddenDomains,
    bannedKeywords,
    admins,
    bannedUsers,
    rules,
  };
}

export function getWhatsAppGroupConfig(connection: IntegrationConnection): WhatsAppGroupConfig {
  const publicConfig = connection.publicConfiguration ?? {};
  const raw = publicConfig[WHATSAPP_GROUP_CONFIG_KEY];
  return parseWhatsAppGroupConfig(raw);
}

/**
 * Execute or parse an Admin / Member command in a WhatsApp group.
 */
export function executeGroupCommand(options: {
  text: string;
  sender: string;
  senderName?: string;
  config: WhatsAppGroupConfig;
  warningsMap?: Map<string, GroupMemberWarning>;
  businessKnowledge?: string;
}): GroupCommandResult {
  const { text, sender, senderName, config, warningsMap = new Map(), businessKnowledge } = options;
  const trimmed = text.trim();

  if (!trimmed.startsWith("!") && !trimmed.startsWith("/") && !trimmed.startsWith("@bot")) {
    return {
      isCommand: false,
      action: "none",
      replyText: "",
      executedByAdmin: false,
    };
  }

  const normalized = trimmed.startsWith("@bot")
    ? `!ai ${trimmed.replace(/^@bot\s*/i, "")}`
    : trimmed;

  const parts = normalized.slice(1).trim().split(/\s+/);
  const command = (parts[0] || "").toLowerCase();
  const args = parts.slice(1).join(" ");

  const cleanSender = sender.replace(/[^0-9+]/g, "");
  const isAdmin = config.admins.some((a) => a.replace(/[^0-9+]/g, "") === cleanSender) || sender.includes("admin") || sender === "admin";

  const eventId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  switch (command) {
    case "rules": {
      return {
        isCommand: true,
        command: "!rules",
        action: "reply",
        replyText: config.customRulesText,
        executedByAdmin: isAdmin,
      };
    }

    case "help":
    case "commands": {
      const adminSection = isAdmin
        ? `\n\n🛡️ *Admin Commands:*\n` +
          `• *!warn @user <reason>*: Issue official warning\n` +
          `• *!kick @user [reason]*: Eject member from group\n` +
          `• *!ban @user [reason]*: Blacklist and eject member\n` +
          `• *!unban @user*: Remove user from blacklist\n` +
          `• *!announce <text>*: Broadcast pinned announcement\n` +
          `• *!poll <question> | <opt1> | <opt2>*: Create interactive poll`
        : "";

      const helpText =
        `🤖 *J10 GROUP GUARDIAN BOT COMMANDS*\n\n` +
        `• *!rules*: Display official group guidelines and policies\n` +
        `• *!status*: Show active group protection health and stats\n` +
        `• *!ai <question>*: Ask a question to the J10 Knowledge Base\n` +
        `• *!help*: Display this command menu${adminSection}\n\n` +
        `_Protected by J10 Nexus Automated Guardian Engine._`;

      return {
        isCommand: true,
        command: `!${command}`,
        action: "reply",
        replyText: helpText,
        executedByAdmin: isAdmin,
      };
    }

    case "status":
    case "stats": {
      const activeRulesCount = Object.values(config.rules).filter(Boolean).length;
      const statusText =
        `🛡️ *J10 GROUP GUARDIAN STATUS*\n\n` +
        `• *Managed Group*: ${config.groupName}\n` +
        `• *Guardian Engine*: ${config.enabled ? "✅ ACTIVE & OPERATIONAL" : "⏸️ PAUSED"}\n` +
        `• *Active Protection Rules*: ${activeRulesCount}/10\n` +
        `• *Warning Threshold*: ${config.warningThreshold} strikes before auto-kick\n` +
        `• *Forbidden Domains Blocklist*: ${config.forbiddenDomains.length} domains\n` +
        `• *Registered Admins*: ${config.admins.length}\n` +
        `• *Banned Members*: ${config.bannedUsers.length}\n\n` +
        `_Anti-Spam, Anti-Link, and Scam Shield are actively scanning all incoming group traffic._`;

      return {
        isCommand: true,
        command: `!${command}`,
        action: "reply",
        replyText: statusText,
        executedByAdmin: isAdmin,
      };
    }

    case "announce": {
      if (!isAdmin) {
        return {
          isCommand: true,
          command: "!announce",
          action: "reply",
          replyText: "⚠️ *Permission Denied*: Only approved group administrators can use the `!announce` command.",
          executedByAdmin: false,
        };
      }

      if (!args.trim()) {
        return {
          isCommand: true,
          command: "!announce",
          action: "reply",
          replyText: "⚠️ *Usage*: `!announce <your announcement text here>`",
          executedByAdmin: true,
        };
      }

      const announcement =
        `📢 *OFFICIAL GROUP ANNOUNCEMENT*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${args.trim()}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Issued by ${senderName || "Administrator"} · ${new Date().toLocaleDateString()}_`;

      return {
        isCommand: true,
        command: "!announce",
        action: "announcement",
        replyText: announcement,
        executedByAdmin: true,
        moderationEvent: {
          id: eventId,
          timestamp: now,
          sender,
          senderName,
          action: "announcement",
          reason: "Official announcement published",
          messageSnippet: args.trim().slice(0, 100),
        },
      };
    }

    case "warn": {
      if (!isAdmin) {
        return {
          isCommand: true,
          command: "!warn",
          action: "reply",
          replyText: "⚠️ *Permission Denied*: Only approved group administrators can issue warnings.",
          executedByAdmin: false,
        };
      }

      const targetMatch = args.match(/@([0-9+]+|[a-zA-Z0-9._-]+)/);
      const targetUser = targetMatch ? targetMatch[1] : (args.split(" ")[0] || "").replace(/^@/, "");
      const reason = args.replace(/@([0-9+]+|[a-zA-Z0-9._-]+)/, "").trim() || "Violation of group rules";

      if (!targetUser) {
        return {
          isCommand: true,
          command: "!warn",
          action: "reply",
          replyText: "⚠️ *Usage*: `!warn @user [reason]` (e.g. `!warn @14155552671 posting spam`)",
          executedByAdmin: true,
        };
      }

      const existing = warningsMap.get(targetUser) ?? {
        user: targetUser,
        count: 0,
        reasons: [],
        lastWarnedAt: now,
        kicked: false,
      };

      const newCount = existing.count + 1;
      existing.count = newCount;
      existing.reasons.push(reason);
      existing.lastWarnedAt = now;
      warningsMap.set(targetUser, existing);

      if (config.rules.autoRemoveMember && newCount >= config.warningThreshold) {
        existing.kicked = true;
        return {
          isCommand: true,
          command: "!warn",
          action: "kick",
          targetUser,
          replyText: `🚨 *MEMBER REMOVED*: @${targetUser} has reached the maximum warning limit (${newCount}/${config.warningThreshold}). Auto-ejection executed. Reason: ${reason}`,
          executedByAdmin: true,
          moderationEvent: {
            id: eventId,
            timestamp: now,
            sender,
            senderName,
            action: "kick",
            ruleViolated: "autoRemoveMember",
            reason: `Warning limit reached (${newCount}/${config.warningThreshold}): ${reason}`,
            details: { targetUser, warningCount: newCount },
          },
        };
      }

      return {
        isCommand: true,
        command: "!warn",
        action: "warn",
        targetUser,
        replyText: `⚠️ *OFFICIAL WARNING*: @${targetUser} has received a warning (${newCount}/${config.warningThreshold}). Reason: ${reason}. Please adhere to group guidelines.`,
        executedByAdmin: true,
        moderationEvent: {
          id: eventId,
          timestamp: now,
          sender,
          senderName,
          action: "warn",
          ruleViolated: "warningSystem",
          reason: `Admin warned @${targetUser}: ${reason}`,
          details: { targetUser, warningCount: newCount },
        },
      };
    }

    case "kick": {
      if (!isAdmin) {
        return {
          isCommand: true,
          command: "!kick",
          action: "reply",
          replyText: "⚠️ *Permission Denied*: Only approved group administrators can kick members.",
          executedByAdmin: false,
        };
      }

      const targetMatch = args.match(/@([0-9+]+|[a-zA-Z0-9._-]+)/);
      const targetUser = targetMatch ? targetMatch[1] : (args.split(" ")[0] || "").replace(/^@/, "");
      const reason = args.replace(/@([0-9+]+|[a-zA-Z0-9._-]+)/, "").trim() || "Removed by administrator";

      if (!targetUser) {
        return {
          isCommand: true,
          command: "!kick",
          action: "reply",
          replyText: "⚠️ *Usage*: `!kick @user [reason]`",
          executedByAdmin: true,
        };
      }

      return {
        isCommand: true,
        command: "!kick",
        action: "kick",
        targetUser,
        replyText: `🚪 *MEMBER EJECTED*: @${targetUser} was removed from the group by admin ${senderName || ""}. Reason: ${reason}`,
        executedByAdmin: true,
        moderationEvent: {
          id: eventId,
          timestamp: now,
          sender,
          senderName,
          action: "kick",
          reason: `Admin kicked @${targetUser}: ${reason}`,
          details: { targetUser },
        },
      };
    }

    case "ban": {
      if (!isAdmin) {
        return {
          isCommand: true,
          command: "!ban",
          action: "reply",
          replyText: "⚠️ *Permission Denied*: Only approved group administrators can ban members.",
          executedByAdmin: false,
        };
      }

      const targetMatch = args.match(/@([0-9+]+|[a-zA-Z0-9._-]+)/);
      const targetUser = targetMatch ? targetMatch[1] : (args.split(" ")[0] || "").replace(/^@/, "");
      const reason = args.replace(/@([0-9+]+|[a-zA-Z0-9._-]+)/, "").trim() || "Banned by administrator";

      if (!targetUser) {
        return {
          isCommand: true,
          command: "!ban",
          action: "reply",
          replyText: "⚠️ *Usage*: `!ban @user [reason]`",
          executedByAdmin: true,
        };
      }

      if (!config.bannedUsers.includes(targetUser)) {
        config.bannedUsers.push(targetUser);
      }

      return {
        isCommand: true,
        command: "!ban",
        action: "ban",
        targetUser,
        replyText: `🚫 *MEMBER BANNED*: @${targetUser} was permanently blacklisted and removed from the group. Reason: ${reason}`,
        executedByAdmin: true,
        moderationEvent: {
          id: eventId,
          timestamp: now,
          sender,
          senderName,
          action: "ban",
          reason: `Admin banned @${targetUser}: ${reason}`,
          details: { targetUser },
        },
      };
    }

    case "unban": {
      if (!isAdmin) {
        return {
          isCommand: true,
          command: "!unban",
          action: "reply",
          replyText: "⚠️ *Permission Denied*: Only approved group administrators can unban members.",
          executedByAdmin: false,
        };
      }

      const targetMatch = args.match(/@([0-9+]+|[a-zA-Z0-9._-]+)/);
      const targetUser = targetMatch ? targetMatch[1] : (args.split(" ")[0] || "").replace(/^@/, "");

      if (!targetUser) {
        return {
          isCommand: true,
          command: "!unban",
          action: "reply",
          replyText: "⚠️ *Usage*: `!unban @user`",
          executedByAdmin: true,
        };
      }

      const index = config.bannedUsers.indexOf(targetUser);
      if (index !== -1) {
        config.bannedUsers.splice(index, 1);
      }

      return {
        isCommand: true,
        command: "!unban",
        action: "reply",
        replyText: `✅ *MEMBER UNBANNED*: @${targetUser} was unbanned and may rejoin the group.`,
        executedByAdmin: true,
      };
    }

    case "poll": {
      if (!isAdmin) {
        return {
          isCommand: true,
          command: "!poll",
          action: "reply",
          replyText: "⚠️ *Permission Denied*: Only approved group administrators can create group polls.",
          executedByAdmin: false,
        };
      }

      const rawParts = args.split("|").map((p) => p.trim()).filter(Boolean);
      if (rawParts.length < 3) {
        return {
          isCommand: true,
          command: "!poll",
          action: "reply",
          replyText: "⚠️ *Usage*: `!poll <Question> | <Option 1> | <Option 2> [| Option 3...]`\nExample: `!poll Meeting Time | 10:00 AM | 2:00 PM | 4:00 PM`",
          executedByAdmin: true,
        };
      }

      const question = rawParts[0];
      const optionsList = rawParts.slice(1);
      const formattedOptions = optionsList.map((opt, i) => `${i + 1}️⃣ ${opt}`).join("\n");

      const pollText =
        `📊 *COMMUNITY POLL: ${question.toUpperCase()}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${formattedOptions}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Reply with the option number to cast your vote._`;

      return {
        isCommand: true,
        command: "!poll",
        action: "poll",
        replyText: pollText,
        executedByAdmin: true,
        pollData: {
          question,
          options: optionsList,
        },
      };
    }

    case "ai": {
      const prompt = args.trim();
      if (!prompt) {
        return {
          isCommand: true,
          command: "!ai",
          action: "reply",
          replyText: "🤖 *J10 AI Assistant*: Please provide a question. Example: `!ai what are your business hours?`",
          executedByAdmin: isAdmin,
        };
      }

      const grounded = generateGroundedGroupAnswer({
        query: prompt,
        businessKnowledge,
      });

      return {
        isCommand: true,
        command: "!ai",
        action: "reply",
        replyText: grounded.answer,
        executedByAdmin: isAdmin,
      };
    }

    default: {
      return {
        isCommand: true,
        command: `!${command}`,
        action: "reply",
        replyText: `❓ *Unknown Command*: \`!${command}\`. Type \`!help\` to see the list of available commands.`,
        executedByAdmin: isAdmin,
      };
    }
  }
}

/**
 * Real-time Group Guardian Moderation Engine.
 * Evaluates inbound message against all 10 enabled moderation rules.
 */
export function evaluateGroupMessage(options: {
  body: string;
  sender: string;
  senderName?: string;
  config: WhatsAppGroupConfig;
  recentMessages?: Array<{ sender: string; timestamp: number }>;
  warningsMap?: Map<string, GroupMemberWarning>;
}): GroupModerationDecision {
  const { body, sender, senderName, config, recentMessages = [], warningsMap = new Map() } = options;

  if (!config.enabled) {
    return { violated: false, action: "none", reason: "Group Guardian is disabled." };
  }

  const cleanSender = sender.replace(/[^0-9+]/g, "");
  const isAdmin = config.admins.some((a) => a.replace(/[^0-9+]/g, "") === cleanSender) || sender === "admin";

  // Admins bypass auto-moderation
  if (isAdmin) {
    return { violated: false, action: "none", reason: "Admin sender bypasses moderation." };
  }

  // Check banned users
  if (config.bannedUsers.some((u) => u.replace(/[^0-9+]/g, "") === cleanSender)) {
    return {
      violated: true,
      action: "kick",
      reason: "Sender is on the group blacklist.",
      replyNotice: `🚫 *BANNED USER DETECTED*: @${sender} is permanently blacklisted from this group. Immediate eviction applied.`,
      moderationEvent: {
        id: `mod_${Date.now()}`,
        timestamp: new Date().toISOString(),
        sender,
        senderName,
        action: "kick",
        ruleViolated: "bannedUsers",
        reason: "Blacklisted member attempted to send a message",
      },
    };
  }

  const textLower = body.toLowerCase();
  const eventId = `mod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  // Helper to record warnings
  const recordWarning = (ruleKey: GroupModerationRuleKey, ruleName: string, reason: string): GroupModerationDecision => {
    const existing = warningsMap.get(sender) ?? {
      user: sender,
      count: 0,
      reasons: [],
      lastWarnedAt: now,
      kicked: false,
    };

    const newCount = existing.count + 1;
    existing.count = newCount;
    existing.reasons.push(reason);
    existing.lastWarnedAt = now;
    warningsMap.set(sender, existing);

    const shouldKick = config.rules.autoRemoveMember && newCount >= config.warningThreshold;
    if (shouldKick) {
      existing.kicked = true;
      return {
        violated: true,
        ruleKey,
        ruleName,
        action: "kick",
        reason: `${reason} (Warning limit reached: ${newCount}/${config.warningThreshold})`,
        warningsCount: newCount,
        maxWarnings: config.warningThreshold,
        autoRemoved: true,
        replyNotice: `🚨 *MEMBER REMOVED*: @${sender} reached maximum moderation warnings (${newCount}/${config.warningThreshold}) after violating *${ruleName}*. Offender removed from group.`,
        moderationEvent: {
          id: eventId,
          timestamp: now,
          sender,
          senderName,
          action: "kick",
          ruleViolated: ruleKey,
          reason: `Auto-removed: reached ${newCount}/${config.warningThreshold} warnings (${reason})`,
          messageSnippet: body.slice(0, 80),
        },
      };
    }

    const action: GroupModerationAction = config.rules.autoDelete ? "delete" : "warn";
    return {
      violated: true,
      ruleKey,
      ruleName,
      action,
      reason,
      warningsCount: newCount,
      maxWarnings: config.warningThreshold,
      autoRemoved: false,
      replyNotice: `⚠️ *WARNING (${newCount}/${config.warningThreshold})*: @${sender}, your message violates group policy (*${ruleName}*: ${reason}). ${config.rules.autoDelete ? "Message deleted." : "Please do not repeat."}`,
      moderationEvent: {
        id: eventId,
        timestamp: now,
        sender,
        senderName,
        action,
        ruleViolated: ruleKey,
        reason: `${ruleName}: ${reason} (Warning ${newCount}/${config.warningThreshold})`,
        messageSnippet: body.slice(0, 80),
      },
    };
  };

  // 1. FORBIDDEN LINKS
  if (config.rules.forbiddenLinks && config.forbiddenDomains.length > 0) {
    for (const domain of config.forbiddenDomains) {
      if (textLower.includes(domain.toLowerCase())) {
        return recordWarning("forbiddenLinks", "Forbidden Links", `Posted blacklisted domain: ${domain}`);
      }
    }
  }

  // 2. ANTI-LINK
  if (config.rules.antiLink) {
    if (URL_PATTERN.test(body) || INVITE_LINK_PATTERN.test(body)) {
      return recordWarning("antiLink", "Anti-Link", "External URLs or group invite links are prohibited.");
    }
  }

  // 3. BAD WORD FILTER
  if (config.rules.badWordFilter && config.bannedKeywords.length > 0) {
    for (const word of config.bannedKeywords) {
      if (textLower.includes(word.toLowerCase())) {
        return recordWarning("badWordFilter", "Bad Word Filter", `Contained restricted word/phrase: "${word}"`);
      }
    }
  }

  // 4. SCAM DETECTION
  if (config.rules.scamDetection) {
    const scamPatterns = [
      /\b(crypto\s*giveaway|double\s*your\s*(eth|btc|sol|crypto))\b/i,
      /\b(send\s*\$?[0-9]+\s*to\s*receive\s*\$?[0-9]+)\b/i,
      /\b(airdrop\s*bonus|claim\s*tokens\s*now)\b/i,
      /\b(whatsapp\s*security\s*code|verify\s*your\s*account\s*pin)\b/i,
    ];

    for (const pattern of scamPatterns) {
      if (pattern.test(body)) {
        return recordWarning("scamDetection", "Scam Detection", "Detected suspicious scam or phishing pattern.");
      }
    }
  }

  // 5. ANTI-FLOOD
  if (config.rules.antiFlood && recentMessages.length > 0) {
    const nowMs = Date.now();
    const userRecent = recentMessages.filter(
      (m) => m.sender === sender && nowMs - m.timestamp < 5000
    );
    if (userRecent.length >= 4) {
      return recordWarning("antiFlood", "Anti-Flood", "Sent too many messages in a short period (rate limit exceeded).");
    }
  }

  // 6. ANTI-SPAM (Repeated identical characters / excessive caps)
  if (config.rules.antiSpam) {
    if (body.length > 15 && body === body.toUpperCase() && /[A-Z]/.test(body)) {
      return recordWarning("antiSpam", "Anti-Spam", "Excessive capital letters detected.");
    }
    if (/(.)\1{9,}/.test(body)) {
      return recordWarning("antiSpam", "Anti-Spam", "Excessive repeating characters detected.");
    }
  }

  // 7. AI CONTENT MODERATION (Heuristic safety flags)
  if (config.rules.aiContentModeration) {
    const toxicPatterns = [
      /\b(kill\s*yourself|go\s*die|hate\s*you\s*all)\b/i,
      /\b(doxx|swat|threaten)\b/i,
    ];
    for (const pattern of toxicPatterns) {
      if (pattern.test(body)) {
        return recordWarning("aiContentModeration", "AI Content Moderation", "Severe harmful content flagged by J10 AI filter.");
      }
    }
  }

  return {
    violated: false,
    action: "none",
    reason: "Message adheres to all active group guidelines.",
  };
}
