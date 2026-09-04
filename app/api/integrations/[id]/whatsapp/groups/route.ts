import { NextResponse } from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
} from "@/lib/integrations/api";
import {
  getIntegrationConnectionById,
  updateIntegrationConnectionConfiguration,
} from "@/lib/integrations/database";
import {
  DEFAULT_WHATSAPP_GROUP_CONFIG,
  getWhatsAppGroupConfig,
  parseWhatsAppGroupConfig,
  WHATSAPP_GROUP_CONFIG_KEY,
  type GroupModerationEvent,
} from "@/lib/whatsapp/group-bot";

type RouteContext = { params: Promise<{ id: string }> };

const SAMPLE_MODERATION_LOGS: GroupModerationEvent[] = [
  {
    id: "mod_init_1",
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    sender: "+14155552671",
    senderName: "CryptoTrader_99",
    action: "delete",
    ruleViolated: "antiLink",
    reason: "Anti-Link: External URLs or group invite links are prohibited.",
    messageSnippet: "Join our exclusive crypto signals: https://t.me/freecrypto",
  },
  {
    id: "mod_init_2",
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    sender: "+14155559812",
    senderName: "Alex M.",
    action: "warn",
    ruleViolated: "badWordFilter",
    reason: "Bad Word Filter: Contained restricted word/phrase.",
    messageSnippet: "Earn 1000% profit guaranteed with this method...",
  },
  {
    id: "mod_init_3",
    timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    sender: "+14155550199",
    senderName: "Admin (J10 Support)",
    action: "announcement",
    reason: "Official announcement published",
    messageSnippet: "Welcome all new members to our official VIP Community!",
  },
];

async function load(context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createIntegrationApiClient();
  const user = await getAuthenticatedIntegrationUser(supabase);
  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      ),
    };
  }
  const connection = await getIntegrationConnectionById(supabase, user.id, id);
  if (!connection || connection.providerId !== "whatsapp-business") {
    return {
      response: NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 }
      ),
    };
  }
  return { id, supabase, user, connection };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const result = await load(context);
    if (result.response) return result.response;

    const config = getWhatsAppGroupConfig(result.connection!);

    // Extract saved logs if present in public configuration
    const publicConfig = result.connection!.publicConfiguration ?? {};
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
    const result = await load(context);
    if (result.response) return result.response;

    const body = parseRequestObject(await request.json());
    const currentConfig = getWhatsAppGroupConfig(result.connection!);
    const merged = { ...currentConfig, ...body };
    const config = parseWhatsAppGroupConfig(merged);

    await updateIntegrationConnectionConfiguration(
      result.supabase!,
      result.user!.id,
      result.id!,
      {
        publicConfiguration: {
          ...result.connection!.publicConfiguration,
          [WHATSAPP_GROUP_CONFIG_KEY]: JSON.stringify(config),
        },
        enabledCapabilities: result.connection!.enabledCapabilities,
      }
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
