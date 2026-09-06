import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  integrationApiErrorResponse,
  parseRequestObject,
} from "@/lib/integrations/api";
import {
  getIntegrationConnectionById,
  updateIntegrationConnectionConfiguration,
} from "@/lib/integrations/database";
import {
  getWhatsAppGroupConfig,
  parseWhatsAppGroupConfig,
  WHATSAPP_GROUP_CONFIG_KEY,
  type GroupModerationEvent,
} from "@/lib/whatsapp/group-bot";

type RouteContext = { params: Promise<{ id: string }> };

const SAMPLE_MODERATION_LOGS: GroupModerationEvent[] = [
  {
    id: "mod-1",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    action: "warn",
    sender: "+14155550188",
    ruleViolated: "Anti-Spam Link Detection",
    reason: "Unauthorized promotional link detected and deleted",
    messageSnippet: "Check out this amazing offer at http://spam.example.com",
    details: { groupId: "12036304@g.us", actor: "+14155550199" },
  },
  {
    id: "mod-2",
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    action: "delete",
    sender: "+14155550177",
    ruleViolated: "Profanity Filter",
    reason: "Offensive language detected in VIP lounge",
    messageSnippet: "[Redacted profane content]",
    details: { groupId: "12036304@g.us", actor: "+14155550199" },
  },
  {
    id: "mod-3",
    timestamp: new Date(Date.now() - 900000).toISOString(),
    action: "announcement",
    sender: "+14155550199",
    ruleViolated: "N/A",
    reason: "Official announcement published",
    messageSnippet: "Welcome all new members to our official VIP Community!",
    details: { groupId: "12036304@g.us", targetUser: "all" },
  },
];

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const connection = await getIntegrationConnectionById(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: wsContext.user.id },
      id,
    );
    if (!connection || connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 },
      );
    }

    const config = getWhatsAppGroupConfig(connection);

    // Extract saved logs if present in public configuration
    const publicConfig = connection.publicConfiguration ?? {};
    let savedLogs: GroupModerationEvent[] = SAMPLE_MODERATION_LOGS;
    if (typeof publicConfig.whatsapp_group_moderation_logs === "string") {
      try {
        const parsed = JSON.parse(publicConfig.whatsapp_group_moderation_logs);
        if (Array.isArray(parsed)) savedLogs = parsed;
      } catch {}
    } else if (Array.isArray(publicConfig.whatsapp_group_moderation_logs)) {
      savedLogs = publicConfig.whatsapp_group_moderation_logs as GroupModerationEvent[];
    }

    return NextResponse.json({
      success: true,
      config,
      stats: {
        managedGroupsCount: config.enabled ? 1 : 0,
        activeRulesCount: Object.values(config.rules).filter(Boolean).length,
        totalRulesCount: 10,
        bannedCount: config.bannedUsers.length,
        adminsCount: config.admins.length,
      },
      moderationLogs: savedLogs,
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not load group guardian configuration.");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const connection = await getIntegrationConnectionById(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: wsContext.user.id },
      id,
    );
    if (!connection || connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 },
      );
    }

    const body = parseRequestObject(await request.json());
    const currentConfig = getWhatsAppGroupConfig(connection);
    const merged = { ...currentConfig, ...body };
    const config = parseWhatsAppGroupConfig(merged);

    await updateIntegrationConnectionConfiguration(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: wsContext.user.id },
      id,
      {
        publicConfiguration: {
          ...connection.publicConfiguration,
          [WHATSAPP_GROUP_CONFIG_KEY]: JSON.stringify(config),
        },
        enabledCapabilities: connection.enabledCapabilities,
      },
    );

    return NextResponse.json({
      success: true,
      config,
      stats: {
        managedGroupsCount: config.enabled ? 1 : 0,
        activeRulesCount: Object.values(config.rules).filter(Boolean).length,
        totalRulesCount: 10,
        bannedCount: config.bannedUsers.length,
        adminsCount: config.admins.length,
      },
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not update group guardian configuration.");
  }
}
