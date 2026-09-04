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
  executeGroupCommand,
  evaluateGroupMessage,
  getWhatsAppGroupConfig,
  WHATSAPP_GROUP_CONFIG_KEY,
  type GroupMemberWarning,
  type GroupModerationEvent,
} from "@/lib/whatsapp/group-bot";

type RouteContext = { params: Promise<{ id: string }> };

// In-memory warning map for session simulation
const sessionWarningsMap = new Map<string, GroupMemberWarning>();

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

export async function POST(request: Request, context: RouteContext) {
  try {
    const result = await load(context);
    if (result.response) return result.response;

    const body = parseRequestObject(await request.json());
    const messageText = typeof body.message === "string" ? body.message.trim() : "";
    const sender = typeof body.sender === "string" && body.sender.trim() ? body.sender.trim() : "+14155550199";
    const senderName = typeof body.senderName === "string" ? body.senderName : "Admin";

    if (!messageText) {
      return NextResponse.json(
        { success: false, error: "A command or message string is required." },
        { status: 400 }
      );
    }

    const config = getWhatsAppGroupConfig(result.connection!);
    const publicConfig = result.connection!.publicConfiguration ?? {};
    const businessKnowledge =
      typeof publicConfig.businessKnowledge === "string" ? publicConfig.businessKnowledge : undefined;

    // Check if it's a command
    if (messageText.startsWith("!") || messageText.startsWith("/") || messageText.startsWith("@bot")) {
      const commandResult = executeGroupCommand({
        text: messageText,
        sender,
        senderName,
        config,
        warningsMap: sessionWarningsMap,
        businessKnowledge,
      });

      // If a moderation event was generated (e.g., announce, warn, kick), update logs
      if (commandResult.moderationEvent) {
        let currentLogs: GroupModerationEvent[] = [];
        if (typeof publicConfig.whatsapp_group_moderation_logs === "string") {
          try {
            const parsed = JSON.parse(publicConfig.whatsapp_group_moderation_logs);
            if (Array.isArray(parsed)) currentLogs = parsed;
          } catch {}
        } else if (Array.isArray(publicConfig.whatsapp_group_moderation_logs)) {
          currentLogs = publicConfig.whatsapp_group_moderation_logs as GroupModerationEvent[];
        }

        const updatedLogs = [commandResult.moderationEvent, ...currentLogs].slice(0, 50);

        await updateIntegrationConnectionConfiguration(
          result.supabase!,
          result.user!.id,
          result.id!,
          {
            publicConfiguration: {
              ...publicConfig,
              [WHATSAPP_GROUP_CONFIG_KEY]: JSON.stringify(config),
              whatsapp_group_moderation_logs: JSON.stringify(updatedLogs),
            },
            enabledCapabilities: result.connection!.enabledCapabilities,
          }
        );
      }

      return NextResponse.json({
        success: true,
        type: "command",
        commandResult,
        updatedConfig: config,
      });
    }

    // Otherwise evaluate through the Group Guardian Moderation Pipeline
    const moderationDecision = evaluateGroupMessage({
      body: messageText,
      sender,
      senderName,
      config,
      warningsMap: sessionWarningsMap,
    });

    if (moderationDecision.moderationEvent) {
      let currentLogs: GroupModerationEvent[] = [];
      if (typeof publicConfig.whatsapp_group_moderation_logs === "string") {
        try {
          const parsed = JSON.parse(publicConfig.whatsapp_group_moderation_logs);
          if (Array.isArray(parsed)) currentLogs = parsed;
        } catch {}
      } else if (Array.isArray(publicConfig.whatsapp_group_moderation_logs)) {
        currentLogs = publicConfig.whatsapp_group_moderation_logs as GroupModerationEvent[];
      }

      const updatedLogs = [moderationDecision.moderationEvent, ...currentLogs].slice(0, 50);

      await updateIntegrationConnectionConfiguration(
        result.supabase!,
        result.user!.id,
        result.id!,
        {
          publicConfiguration: {
            ...publicConfig,
            [WHATSAPP_GROUP_CONFIG_KEY]: JSON.stringify(config),
            whatsapp_group_moderation_logs: JSON.stringify(updatedLogs),
          },
          enabledCapabilities: result.connection!.enabledCapabilities,
        }
      );
    }

    return NextResponse.json({
      success: true,
      type: "moderation",
      moderationDecision,
      updatedConfig: config,
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not process group bot command.");
  }
}
