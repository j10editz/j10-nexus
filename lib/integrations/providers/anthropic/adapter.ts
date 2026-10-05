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

const REQUEST_TIMEOUT_MS = 30_000;
const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_ANTHROPIC_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readAnthropicApiKey(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new IntegrationRuntimeError("Anthropic API Key is not configured in credentials vault.", {
      code: "ANTHROPIC_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return apiKey;
}

async function executeAnthropicAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_anthropic_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        messageId: `msg_sim_${Date.now()}`,
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Hello from J10 NEXUS simulated Claude 3.5 Sonnet agent. Your enterprise workflows and tools are operational.",
          },
          ...(inputObj.tools
            ? [
                {
                  type: "tool_use",
                  id: `toolu_sim_${Date.now()}`,
                  name: "schedule_calendar_event",
                  input: { summary: "VIP Client Consultation", start: new Date().toISOString() },
                },
              ]
            : []),
        ],
        model: inputObj.model || "claude-3-5-sonnet-20241022",
        usage: { input_tokens: 25, output_tokens: 42 },
        stop_reason: inputObj.tools ? "tool_use" : "end_turn",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const apiKey = await readAnthropicApiKey(invocation);

  switch (capabilityId) {
    case "anthropic.generate_message":
    case "anthropic.create_message": {
      const messages = Array.isArray(inputObj.messages)
        ? inputObj.messages
        : typeof inputObj.prompt === "string"
        ? [{ role: "user", content: inputObj.prompt }]
        : [{ role: "user", content: "Hello" }];

      const model = typeof inputObj.model === "string" ? inputObj.model : "claude-3-5-sonnet-20241022";
      const maxTokens = typeof inputObj.max_tokens === "number" ? inputObj.max_tokens : 4096;
      const temperature = typeof inputObj.temperature === "number" ? inputObj.temperature : 0.7;

      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages,
        temperature,
      };

      if (typeof inputObj.system === "string") {
        body.system = inputObj.system;
      }
      if (Array.isArray(inputObj.tools)) {
        body.tools = inputObj.tools;
      }
      if (inputObj.tool_choice) {
        body.tool_choice = inputObj.tool_choice;
      }

      const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to execute Anthropic message creation.", {
          code: "ANTHROPIC_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          messageId: data.id,
          model: data.model,
          role: data.role,
          content: data.content,
          stopReason: data.stop_reason,
          usage: data.usage,
        },
      };
    }

    case "anthropic.use_tools":
    case "anthropic.execute_tool": {
      if (!Array.isArray(inputObj.tools) || inputObj.tools.length === 0) {
        throw new IntegrationRuntimeError("At least one tool definition is required for tool use.", {
          code: "ANTHROPIC_TOOLS_REQUIRED",
          category: "validation",
          status: 400,
        });
      }

      const messages = Array.isArray(inputObj.messages)
        ? inputObj.messages
        : typeof inputObj.prompt === "string"
        ? [{ role: "user", content: inputObj.prompt }]
        : [{ role: "user", content: "Execute tool workflow" }];

      const model = typeof inputObj.model === "string" ? inputObj.model : "claude-3-5-sonnet-20241022";
      const maxTokens = typeof inputObj.max_tokens === "number" ? inputObj.max_tokens : 4096;

      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages,
        tools: inputObj.tools,
      };

      if (typeof inputObj.system === "string") body.system = inputObj.system;
      if (inputObj.tool_choice) body.tool_choice = inputObj.tool_choice;

      const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to execute Anthropic tool use request.", {
          code: "ANTHROPIC_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const toolUses = Array.isArray(data.content)
        ? data.content.filter((block: { type?: string }) => block.type === "tool_use")
        : [];

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          messageId: data.id,
          model: data.model,
          content: data.content,
          toolUses,
          stopReason: data.stop_reason,
          usage: data.usage,
        },
      };
    }

    case "anthropic.analyze_document": {
      const documentText =
        typeof inputObj.document_text === "string"
          ? inputObj.document_text
          : typeof inputObj.content === "string"
          ? inputObj.content
          : "";

      const prompt =
        typeof inputObj.prompt === "string"
          ? inputObj.prompt
          : "Analyze this document and extract key business insights.";

      if (!documentText && !inputObj.document_source) {
        throw new IntegrationRuntimeError("document_text or document_source is required for document analysis.", {
          code: "ANTHROPIC_DOCUMENT_REQUIRED",
          category: "validation",
          status: 400,
        });
      }

      const contentBlocks: unknown[] = [];
      if (inputObj.document_source && isRecord(inputObj.document_source)) {
        contentBlocks.push(inputObj.document_source);
      } else {
        contentBlocks.push({
          type: "text",
          text: `Document Content:\n${documentText}`,
        });
      }
      contentBlocks.push({
        type: "text",
        text: prompt,
      });

      const model = typeof inputObj.model === "string" ? inputObj.model : "claude-3-5-sonnet-20241022";
      const maxTokens = typeof inputObj.max_tokens === "number" ? inputObj.max_tokens : 4096;

      const body = {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: contentBlocks }],
      };

      const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to analyze document with Anthropic.", {
          code: "ANTHROPIC_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const textBlock = Array.isArray(data.content)
        ? data.content.find((b: { type?: string; text?: string }) => b.type === "text")
        : null;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          messageId: data.id,
          model: data.model,
          analysis: textBlock?.text || "",
          content: data.content,
          usage: data.usage,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Anthropic adapter.`, {
        code: "UNSUPPORTED_ANTHROPIC_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkAnthropicHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Anthropic API key missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok || res.status === 400) {
      // 200 or 400 with valid auth implies authenticated API reachability
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.type === "error" && data.error?.type !== "authentication_error") {
        return {
          healthy: true,
          checkedAt: new Date().toISOString(),
          latencyMs,
          externalAccountId: "anthropic_platform",
          externalAccountLabel: "Anthropic Claude 3.5 Sonnet / Haiku",
          metadata: {
            service: "Anthropic Messages API v1",
          },
        };
      }
    }

    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: `Anthropic API returned HTTP ${res.status}`,
      },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: err instanceof Error ? err.message : "Failed to connect to Anthropic API",
      },
    };
  }
}

export const ANTHROPIC_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.anthropic.runtime",
    adapterVersion: "1.0.0",
    providerId: "anthropic",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "anthropic.generate_message",
      "anthropic.analyze_document",
      "anthropic.use_tools",
      "anthropic.create_message",
      "anthropic.execute_tool",
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
  healthCheck: checkAnthropicHealth,
  executeAction: executeAnthropicAction,
};
