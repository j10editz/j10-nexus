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
const SQUARE_API_BASE = "https://connect.squareup.com/v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_SQUARE_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readSquareCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; merchantId?: string }> {
  const creds = await context.credentials.read(["access_token", "merchant_id"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Square access token is missing.", {
      code: "SQUARE_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, merchantId: creds.merchant_id };
}

async function executeSquareAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode, idempotencyKey } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_square_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `sq_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readSquareCredentials(invocation);

  switch (capabilityId) {
    case "square.create_payment": {
      const sourceId = extractString(inputObj, "source_id", "source_id");
      const amountMoney = isRecord(inputObj.amount_money)
        ? inputObj.amount_money
        : {
            amount: typeof inputObj.amount === "number" ? inputObj.amount : 1000,
            currency: typeof inputObj.currency === "string" ? inputObj.currency : "USD",
          };

      const res = await fetch(`${SQUARE_API_BASE}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_id: sourceId,
          idempotency_key: idempotencyKey || `idem_sq_${Date.now()}`,
          amount_money: amountMoney,
          autocomplete: true,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.errors?.[0]?.detail || "Failed to create Square payment.", {
          code: "SQUARE_PAYMENT_FAILED",
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

    case "square.create_customer": {
      const givenName = typeof inputObj.given_name === "string" ? inputObj.given_name.trim() : (typeof inputObj.firstName === "string" ? inputObj.firstName.trim() : undefined);
      const familyName = typeof inputObj.family_name === "string" ? inputObj.family_name.trim() : (typeof inputObj.lastName === "string" ? inputObj.lastName.trim() : undefined);
      const emailAddress = typeof inputObj.email_address === "string" ? inputObj.email_address.trim() : (typeof inputObj.email === "string" ? inputObj.email.trim() : undefined);

      if (!givenName && !emailAddress) {
        throw new IntegrationRuntimeError("given_name or email_address is required to create customer.", {
          code: "INVALID_SQUARE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${SQUARE_API_BASE}/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey || `idem_sq_cust_${Date.now()}`,
          given_name: givenName,
          family_name: familyName,
          email_address: emailAddress,
          phone_number: typeof inputObj.phone_number === "string" ? inputObj.phone_number : undefined,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.errors?.[0]?.detail || "Failed to create Square customer.", {
          code: "SQUARE_CUSTOMER_FAILED",
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

    case "square.issue_refund": {
      const paymentId = inputObj.payment_id ?? inputObj.id;
      if (!paymentId) {
        throw new IntegrationRuntimeError("payment_id is required to issue refund.", {
          code: "INVALID_SQUARE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const amountMoney = isRecord(inputObj.amount_money)
        ? inputObj.amount_money
        : {
            amount: typeof inputObj.amount === "number" ? inputObj.amount : 1000,
            currency: typeof inputObj.currency === "string" ? inputObj.currency : "USD",
          };

      const res = await fetch(`${SQUARE_API_BASE}/refunds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey || `idem_sq_ref_${Date.now()}`,
          payment_id: String(paymentId),
          amount_money: amountMoney,
          reason: typeof inputObj.reason === "string" ? inputObj.reason : "Automated refund",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.errors?.[0]?.detail || "Failed to issue Square refund.", {
          code: "SQUARE_REFUND_FAILED",
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

    default:
      throw new IntegrationRuntimeError(`Unsupported capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkSquareHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token"]);
    const token = creds.access_token;
    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing access token" },
      };
    }

    const res = await fetch(`${SQUARE_API_BASE}/merchants/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const merchant = isRecord(data) && isRecord(data.merchant) ? data.merchant : null;
    const businessName = merchant && typeof merchant.business_name === "string" ? merchant.business_name : "Square Merchant";
    const id = merchant && typeof merchant.id === "string" ? merchant.id : "square_merchant";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: id,
      externalAccountLabel: businessName,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Square health check failed." },
    };
  }
}

export const SQUARE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.square.runtime",
    adapterVersion: "1.0.0",
    providerId: "square",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "square.create_payment",
      "square.create_customer",
      "square.issue_refund",
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
  healthCheck: checkSquareHealth,
  executeAction: executeSquareAction,
};
