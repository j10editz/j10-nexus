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
const TELNYX_API_BASE = "https://api.telnyx.com/v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_TELNYX_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readTelnyxCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ apiKey: string; defaultFrom?: string }> {
  const creds = await context.credentials.read(["access_token", "api_key", "from_number"]);
  const apiKey = creds.access_token || creds.api_key;

  if (!apiKey) {
    throw new IntegrationRuntimeError("Telnyx API key is missing.", {
      code: "TELNYX_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { apiKey, defaultFrom: creds.from_number };
}

async function executeTelnyxAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_telnyx_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `telnyx_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { apiKey, defaultFrom } = await readTelnyxCredentials(invocation);

  switch (capabilityId) {
    case "telnyx.send_sms": {
      const to = extractString(inputObj, "to", "Destination phone number");
      const text = extractString(inputObj, "text", "SMS message text");
      const from = typeof inputObj.from === "string" ? inputObj.from : defaultFrom;

      if (!from) {
        throw new IntegrationRuntimeError("Originating 'from' phone number is required.", {
          code: "INVALID_TELNYX_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${TELNYX_API_BASE}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          text,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Telnyx SMS dispatch failed: ${res.statusText}`, {
          code: "TELNYX_SMS_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const messageId = isRecord(data) && isRecord((data as any).data) ? (data as any).data.id : `msg_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(messageId),
        rateLimit: null,
        metadata: {
          messageId,
          to,
          status: "queued",
        },
      };
    }

    case "telnyx.initiate_call": {
      const to = extractString(inputObj, "to", "Destination phone number");
      const connectionId = extractString(inputObj, "connection_id", "Call Control Application Connection ID");
      const from = typeof inputObj.from === "string" ? inputObj.from : defaultFrom;

      if (!from) {
        throw new IntegrationRuntimeError("Originating 'from' phone number is required.", {
          code: "INVALID_TELNYX_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${TELNYX_API_BASE}/calls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to,
          from,
          connection_id: connectionId,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Telnyx call initiation failed: ${res.statusText}`, {
          code: "TELNYX_CALL_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const callControlId = isRecord(data) && isRecord((data as any).data) ? (data as any).data.call_control_id : `call_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(callControlId),
        rateLimit: null,
        metadata: {
          callControlId,
          to,
          status: "initiated",
        },
      };
    }

    case "telnyx.send_number_verification": {
      const phoneNumber = extractString(inputObj, "phone_number", "Phone number to verify");
      const verifyProfileId = extractString(inputObj, "verify_profile_id", "Verify Profile ID");

      const res = await fetch(`${TELNYX_API_BASE}/verifications/sms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          verify_profile_id: verifyProfileId,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Telnyx 2FA verification dispatch failed: ${res.statusText}`, {
          code: "TELNYX_VERIFY_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const verifyId = isRecord(data) && isRecord((data as any).data) ? (data as any).data.id : `ver_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(verifyId),
        rateLimit: null,
        metadata: {
          verifyId,
          phoneNumber,
          status: "pending",
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Telnyx adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkTelnyxHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "api_key"]);
    const apiKey = creds.access_token || creds.api_key;
    if (!apiKey) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing API key" },
      };
    }

    const res = await fetch(`${TELNYX_API_BASE}/phone_numbers?page[size]=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: res.ok ? "telnyx_account" : null,
      externalAccountLabel: res.ok ? "Telnyx Communications" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Telnyx health check failed." },
    };
  }
}

export const TELNYX_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.telnyx.runtime",
    adapterVersion: "1.0.0",
    providerId: "telnyx",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "telnyx.send_sms",
      "telnyx.initiate_call",
      "telnyx.send_number_verification",
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
  healthCheck: checkTelnyxHealth,
  executeAction: executeTelnyxAction,
};
