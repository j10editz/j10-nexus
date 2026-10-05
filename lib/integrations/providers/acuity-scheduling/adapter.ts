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
const ACUITY_API_BASE = "https://acuityscheduling.com/api/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_ACUITY_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readAcuityCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ authHeader: string; userId?: string }> {
  const creds = await context.credentials.read(["access_token", "user_id", "api_key", "password"]);
  
  if (creds.access_token) {
    return { authHeader: `Bearer ${creds.access_token}`, userId: creds.user_id };
  }

  if (creds.user_id && (creds.api_key || creds.password)) {
    const key = creds.api_key || creds.password;
    const encoded = Buffer.from(`${creds.user_id}:${key}`).toString("base64");
    return { authHeader: `Basic ${encoded}`, userId: creds.user_id };
  }

  throw new IntegrationRuntimeError("Acuity Scheduling credentials (access_token or user_id + api_key) are missing.", {
    code: "ACUITY_AUTH_MISSING",
    category: "authentication",
    status: 401,
  });
}

async function executeAcuityAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_acuity_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `acuity_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { authHeader } = await readAcuityCredentials(invocation);

  switch (capabilityId) {
    case "acuity-scheduling.book_appointment": {
      const datetime = extractString(inputObj, "datetime", "Appointment datetime (ISO or YYYY-MM-DDTHH:MM)");
      const appointmentTypeID = inputObj.appointmentTypeID ?? inputObj.appointment_type_id;
      if (!appointmentTypeID) {
        throw new IntegrationRuntimeError("appointmentTypeID is required.", {
          code: "INVALID_ACUITY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const firstName = extractString(inputObj, "firstName", "First Name");
      const lastName = extractString(inputObj, "lastName", "Last Name");
      const email = extractString(inputObj, "email", "Email Address");

      const res = await fetch(`${ACUITY_API_BASE}/appointments`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          datetime,
          appointmentTypeID,
          firstName,
          lastName,
          email,
          phone: typeof inputObj.phone === "string" ? inputObj.phone : undefined,
          notes: typeof inputObj.notes === "string" ? inputObj.notes : undefined,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to book appointment in Acuity Scheduling.", {
          code: "ACUITY_BOOKING_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "acuity-scheduling.cancel_appointment": {
      const id = inputObj.id ?? inputObj.appointment_id;
      if (!id) {
        throw new IntegrationRuntimeError("id or appointment_id is required.", {
          code: "INVALID_ACUITY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const cancelReason = typeof inputObj.cancel_reason === "string" ? inputObj.cancel_reason : "Cancelled via Nexus Scheduler.";

      const res = await fetch(`${ACUITY_API_BASE}/appointments/${encodeURIComponent(String(id))}/cancel`, {
        method: "PUT",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cancelReason,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to cancel Acuity appointment.", {
          code: "ACUITY_CANCEL_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "acuity-scheduling.check_availability": {
      const appointmentTypeID = inputObj.appointmentTypeID ?? inputObj.appointment_type_id;
      if (!appointmentTypeID) {
        throw new IntegrationRuntimeError("appointmentTypeID is required to check availability.", {
          code: "INVALID_ACUITY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const date = typeof inputObj.date === "string" && inputObj.date.trim()
        ? inputObj.date.trim()
        : typeof inputObj.month === "string" && inputObj.month.trim()
        ? inputObj.month.trim()
        : new Date().toISOString().slice(0, 7);

      const endpoint = date.length === 7
        ? `${ACUITY_API_BASE}/availability/dates?month=${encodeURIComponent(date)}&appointmentTypeID=${encodeURIComponent(String(appointmentTypeID))}`
        : `${ACUITY_API_BASE}/availability/times?date=${encodeURIComponent(date)}&appointmentTypeID=${encodeURIComponent(String(appointmentTypeID))}`;

      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: authHeader,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to check Acuity availability.", {
          code: "ACUITY_AVAILABILITY_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: { availability: data },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkAcuityHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const { authHeader } = await readAcuityCredentials(context);

    const res = await fetch(`${ACUITY_API_BASE}/me`, {
      headers: {
        Authorization: authHeader,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const name = isRecord(data) && typeof data.businessName === "string"
      ? data.businessName
      : isRecord(data) && typeof data.firstName === "string"
      ? `${data.firstName} ${data.lastName || ""}`.trim()
      : "Acuity Business";
    const id = isRecord(data) && data.id ? String(data.id) : "acuity_user";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: id,
      externalAccountLabel: name,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Acuity health check failed." },
    };
  }
}

export const ACUITY_SCHEDULING_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.acuity-scheduling.runtime",
    adapterVersion: "1.0.0",
    providerId: "acuity-scheduling",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "acuity-scheduling.book_appointment",
      "acuity-scheduling.cancel_appointment",
      "acuity-scheduling.check_availability",
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
  healthCheck: checkAcuityHealth,
  executeAction: executeAcuityAction,
};
