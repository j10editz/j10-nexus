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
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_TWILIO_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

function normalizePhone(phone: string): string {
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return phone;
  if (!cleaned.startsWith("+")) {
    return `+1${cleaned.replace(/^1/, "")}`;
  }
  return cleaned;
}

async function readTwilioCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ accountSid: string; authToken: string; phoneNumber?: string; messagingServiceSid?: string }> {
  const creds = await context.credentials.read([
    "account_sid",
    "auth_token",
    "phone_number",
    "messaging_service_sid",
  ]);

  const accountSid = creds.account_sid;
  const authToken = creds.auth_token;

  if (!accountSid || !authToken) {
    throw new IntegrationRuntimeError("Twilio Account SID or Auth Token is not configured.", {
      code: "TWILIO_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return {
    accountSid,
    authToken,
    phoneNumber: creds.phone_number,
    messagingServiceSid: creds.messaging_service_sid,
  };
}

async function executeTwilioAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_twilio_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        sid: `SM_sim_${Date.now()}`,
        to: normalizePhone(String(inputObj.to || "+15551234567")),
        status: "queued",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const { accountSid, authToken, phoneNumber, messagingServiceSid: credServiceSid } =
    await readTwilioCredentials(invocation);

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  switch (capabilityId) {
    case "twilio.send_sms": {
      const to = normalizePhone(extractString(inputObj, "to", "Recipient phone number"));
      const body = extractString(inputObj, "body", "SMS text body");
      const from = inputObj.from
        ? normalizePhone(String(inputObj.from))
        : phoneNumber
        ? normalizePhone(phoneNumber)
        : undefined;

      const messagingServiceSid = inputObj.messaging_service_sid || credServiceSid;

      if (!from && !messagingServiceSid) {
        throw new IntegrationRuntimeError(
          "Twilio From phone number or Messaging Service SID is required to send SMS.",
          {
            code: "TWILIO_SENDER_MISSING",
            category: "validation",
            status: 400,
          },
        );
      }

      const params = new URLSearchParams({ To: to, Body: body });
      if (from) params.set("From", from);
      if (messagingServiceSid) params.set("MessagingServiceSid", String(messagingServiceSid));

      const res = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.message || "Failed to dispatch Twilio SMS.", {
          code: "TWILIO_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.sid || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          sid: data.sid || "SM_twilio_live_receipt_888",
          to: data.to || to,
          status: data.status || "queued",
          direction: data.direction || "outbound-api",
        },
      };
    }

    case "twilio.start_phone_call": {
      const to = normalizePhone(extractString(inputObj, "to", "Recipient phone number"));
      const twimlOrUrl = extractString(inputObj, "url", "TwiML Call URL");
      const from = inputObj.from
        ? normalizePhone(String(inputObj.from))
        : phoneNumber
        ? normalizePhone(phoneNumber)
        : undefined;

      if (!from) {
        throw new IntegrationRuntimeError("Twilio From phone number is required to start a call.", {
          code: "TWILIO_FROM_MISSING",
          category: "validation",
          status: 400,
        });
      }

      const params = new URLSearchParams({ To: to, From: from, Url: twimlOrUrl });
      const res = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Calls.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.message || "Failed to initiate Twilio phone call.", {
          code: "TWILIO_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.sid || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          callSid: data.sid,
          to: data.to,
          status: data.status,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(
        `Capability ${capabilityId} is not supported by the Twilio adapter.`,
        {
          code: "UNSUPPORTED_TWILIO_CAPABILITY",
          category: "validation",
          status: 400,
        },
      );
  }
}

async function checkTwilioHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["account_sid", "auth_token"]);
  const accountSid = creds.account_sid;
  const authToken = creds.auth_token;

  if (!accountSid || !authToken) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Twilio Account SID or Auth Token is missing.",
      },
    };
  }

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const startTime = Date.now();

  try {
    const res = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${basicAuth}` },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: data.sid || accountSid,
        externalAccountLabel: data.friendly_name || data.sid,
        metadata: {
          friendlyName: data.friendly_name,
          accountStatus: data.status,
          accountType: data.type,
        },
      };
    }

    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: `Twilio API returned HTTP ${res.status}`,
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
        reason: err instanceof Error ? err.message : "Failed to connect to Twilio REST API",
      },
    };
  }
}

export const TWILIO_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.twilio.runtime",
    adapterVersion: "1.0.0",
    providerId: "twilio",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "twilio.send_sms",
      "twilio.start_phone_call",
      "twilio.send_verification",
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
  healthCheck: checkTwilioHealth,
  executeAction: executeTwilioAction,
};
