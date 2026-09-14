import "server-only";

export interface BotGroupPermissionsResult {
  hasAdmin: boolean;
  canInviteUsers: boolean;
  canRestrictMembers: boolean;
  error?: string;
}

/**
 * Confirms whether the Telegram bot has administrator permissions in the target group:
 * Specifically can_invite_users and can_restrict_members.
 */
export async function verifyBotGroupPermissions(
  botToken: string,
  groupChatId: string | number,
  botId: string | number
): Promise<BotGroupPermissionsResult> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${groupChatId}&user_id=${botId}`
    );
    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.result) {
      return {
        hasAdmin: false,
        canInviteUsers: false,
        canRestrictMembers: false,
        error: data?.description || "Failed to query bot group member status.",
      };
    }

    const member = data.result;
    const isOwner = member.status === "creator";
    const isAdmin = member.status === "administrator" || isOwner;
    const canInviteUsers = isOwner || Boolean(member.can_invite_users);
    const canRestrictMembers = isOwner || Boolean(member.can_restrict_members);

    return {
      hasAdmin: isAdmin,
      canInviteUsers,
      canRestrictMembers,
      error: !isAdmin
        ? "Bot is not an administrator in this group."
        : !canInviteUsers
        ? "Bot is missing 'can_invite_users' permission in this group."
        : !canRestrictMembers
        ? "Bot is missing 'can_restrict_members' permission in this group."
        : undefined,
    };
  } catch (err) {
    return {
      hasAdmin: false,
      canInviteUsers: false,
      canRestrictMembers: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Revokes a member's access from a Telegram supergroup upon cancellation, refund, or dispute.
 * Uses banChatMember followed by unbanChatMember (kick behavior).
 */
export async function removeTelegramGroupMember(params: {
  botToken: string;
  groupChatId: string | number;
  telegramUserId: string | number;
}): Promise<{ success: boolean; error?: string }> {
  const { botToken, groupChatId, telegramUserId } = params;
  try {
    // 1. Kick/ban from chat
    const banRes = await fetch(
      `https://api.telegram.org/bot${botToken}/banChatMember`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: groupChatId,
          user_id: telegramUserId,
          revoke_messages: false,
        }),
      }
    );
    const banData = await banRes.json();
    if (!banRes.ok || !banData?.ok) {
      return {
        success: false,
        error: banData?.description || "Failed to ban/remove member from Telegram group.",
      };
    }

    // 2. Unban immediately so user is removed without permanent blacklist
    await fetch(
      `https://api.telegram.org/bot${botToken}/unbanChatMember`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: groupChatId,
          user_id: telegramUserId,
          only_if_banned: true,
        }),
      }
    );

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
