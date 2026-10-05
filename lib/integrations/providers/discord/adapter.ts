import "server-only";

import type {
  IntegrationConnectorRuntimeAdapter,
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeHealthResult,
  IntegrationRuntimeInvocationContext,
  IntegrationRuntimeResult,
} from "@/types/integration-runtime";
import {
  INTEGRATION_RUNTIME_SCHEMA_VERSION,
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

const REQUEST_TIMEOUT_MS = 15_000;
const DISCORD_API_BASE = "https://discord.com/api/v10";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_DISCORD_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readDiscordCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ botToken: string }> {
  const creds = await context.credentials.read(["secret_key", "bot_token", "access_token"]);
  const botToken = creds.secret_key || creds.bot_token || creds.access_token;

  if (!botToken) {
    throw new IntegrationRuntimeError("Discord Bot Token is missing.", {
      code: "DISCORD_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { botToken };
}

async function executeDiscordAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_discord_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `discord_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { botToken } = await readDiscordCredentials(invocation);

  switch (capabilityId) {
    case "discord.send_message": {
      const channelId = extractString(inputObj, "channel_id", "Discord Channel ID");
      const content = typeof inputObj.content === "string" ? inputObj.content : "";
      const embeds = Array.isArray(inputObj.embeds) ? inputObj.embeds : undefined;

      if (!content && !embeds?.length) {
        throw new IntegrationRuntimeError("Either message content or embeds must be provided.", {
          code: "INVALID_DISCORD_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${DISCORD_API_BASE}/channels/${encodeURIComponent(channelId)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          embeds,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Discord message dispatch failed: ${res.statusText}`, {
          code: "DISCORD_MESSAGE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const messageId = isRecord(data) && data.id ? String(data.id) : `msg_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: messageId,
        rateLimit: null,
        metadata: {
          messageId,
          channelId,
        },
      };
    }

    case "discord.assign_role": {
      const guildId = extractString(inputObj, "guild_id", "Guild/Server ID");
      const userId = extractString(inputObj, "user_id", "User ID");
      const roleId = extractString(inputObj, "role_id", "Role ID");

      const res = await fetch(
        `${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bot ${botToken}`,
          },
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new IntegrationRuntimeError(`Discord role assignment failed: ${res.statusText}`, {
          code: "DISCORD_ROLE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: 204,
        providerRequestId: `role_${Date.now()}`,
        rateLimit: null,
        metadata: {
          guildId,
          userId,
          roleId,
          assigned: true,
        },
      };
    }

    case "discord.moderate_member": {
      const guildId = extractString(inputObj, "guild_id", "Guild/Server ID");
      const userId = extractString(inputObj, "user_id", "User ID");
      const action = typeof inputObj.action === "string" ? inputObj.action : "timeout";
      const reason = typeof inputObj.reason === "string" ? inputObj.reason : "Automated AI moderation";

      if (action === "timeout") {
        const timeoutSeconds = typeof inputObj.duration_seconds === "number" ? inputObj.duration_seconds : 600;
        const until = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

        const res = await fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
            "X-Audit-Log-Reason": reason,
          },
          body: JSON.stringify({
            communication_disabled_until: until,
          }),
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new IntegrationRuntimeError(`Discord timeout moderation failed: ${res.statusText}`, {
            code: "DISCORD_MOD_FAILED",
            category: "provider",
            status: res.status,
            details: data,
          });
        }
      } else if (action === "kick") {
        const res = await fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bot ${botToken}`,
            "X-Audit-Log-Reason": reason,
          },
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new IntegrationRuntimeError(`Discord kick failed: ${res.statusText}`, {
            code: "DISCORD_KICK_FAILED",
            category: "provider",
            status: res.status,
            details: data,
          });
        }
      }

      return {
        success: true,
        responseStatus: 200,
        providerRequestId: `mod_${Date.now()}`,
        rateLimit: null,
        metadata: {
          guildId,
          userId,
          action,
          moderated: true,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Discord adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkDiscordHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["secret_key", "bot_token", "access_token"]);
    const botToken = creds.secret_key || creds.bot_token || creds.access_token;
    if (!botToken) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing bot token" },
      };
    }

    const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      method: "GET",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    const username = isRecord(data) && typeof data.username === "string" ? `${data.username} Bot` : "Discord Bot";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: isRecord(data) && data.id ? String(data.id) : "discord_bot",
      externalAccountLabel: username,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Discord health check failed." },
    };
  }
}

export const DISCORD_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.discord.runtime",
    adapterVersion: "1.0.0",
    providerId: "discord",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "discord.send_message",
      "discord.assign_role",
      "discord.moderate_member",
    ].map((capabilityId) => ({
      capabilityId,
      kind: "action" as const,
      modes: ["simulate", "sandbox", "live"] as const,
      requiredScopes: [],
      supportsIdempotency: true,
    })),
    supportsHealthChecks: true,
    supportsTokenRefresh: false,
    supportsTokenRevocation: false,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxConcurrency: 10,
  },
  healthCheck: checkDiscordHealth,
  executeAction: executeDiscordAction,
};
