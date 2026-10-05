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
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v16";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_GOOGLE_ADS_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readGoogleAdsCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; developerToken: string; customerId?: string }> {
  const creds = await context.credentials.read(["access_token", "developer_token", "customer_id"]);
  const token = creds.access_token;
  const developerToken = creds.developer_token || "mock_dev_token";

  if (!token) {
    throw new IntegrationRuntimeError("Google Ads OAuth access token is missing.", {
      code: "GOOGLE_ADS_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, developerToken, customerId: creds.customer_id };
}

async function executeGoogleAdsAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_gads_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `gads_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, developerToken, customerId: defaultCustomerId } = await readGoogleAdsCredentials(invocation);

  switch (capabilityId) {
    case "google-ads.upload_offline_conversion": {
      const customerId = (typeof inputObj.customer_id === "string" ? inputObj.customer_id : defaultCustomerId)?.replace(/-/g, "");
      const conversionAction = extractString(inputObj, "conversion_action", "Conversion action resource name");
      const gclid = extractString(inputObj, "gclid", "Google Click ID (GCLID)");
      const conversionDateTime = typeof inputObj.conversion_date_time === "string" ? inputObj.conversion_date_time : new Date().toISOString();
      const conversionValue = typeof inputObj.conversion_value === "number" ? inputObj.conversion_value : 1.0;

      if (!customerId) {
        throw new IntegrationRuntimeError("Google Ads Customer ID is required.", {
          code: "INVALID_GOOGLE_ADS_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const payload = {
        conversions: [
          {
            conversionAction,
            gclid,
            conversionDateTime,
            conversionValue,
            currencyCode: typeof inputObj.currency_code === "string" ? inputObj.currency_code : "USD",
          },
        ],
        partialFailure: true,
      };

      const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}:uploadClickConversions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Google Ads conversion upload failed: ${res.statusText}`, {
          code: "GOOGLE_ADS_CONVERSION_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: `conv_${Date.now()}`,
        rateLimit: null,
        metadata: {
          customerId,
          conversionAction,
          gclid,
          status: "uploaded",
        },
      };
    }

    case "google-ads.create_customer_list": {
      const customerId = (typeof inputObj.customer_id === "string" ? inputObj.customer_id : defaultCustomerId)?.replace(/-/g, "");
      const listName = extractString(inputObj, "list_name", "Customer list name");
      const description = typeof inputObj.description === "string" ? inputObj.description : "";

      if (!customerId) {
        throw new IntegrationRuntimeError("Google Ads Customer ID is required.", {
          code: "INVALID_GOOGLE_ADS_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const payload = {
        operations: [
          {
            create: {
              name: listName,
              description,
              membershipLifeSpan: 30,
              crmBasedUserList: {
                uploadKeyType: "CONTACT_INFO",
              },
            },
          },
        ],
      };

      const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/userLists:mutate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Google Ads customer list creation failed: ${res.statusText}`, {
          code: "GOOGLE_ADS_LIST_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const listResource = isRecord(data) && Array.isArray((data as any).results) && (data as any).results[0]
        ? (data as any).results[0].resourceName
        : `customers/${customerId}/userLists/${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: listResource,
        rateLimit: null,
        metadata: {
          customerId,
          listName,
          resourceName: listResource,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Google Ads adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkGoogleAdsHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "developer_token", "customer_id"]);
    if (!creds.access_token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing access token" },
      };
    }

    const customerId = creds.customer_id?.replace(/-/g, "") || "accessibleCustomers";
    const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "developer-token": creds.developer_token || "mock_dev_token",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: customerId,
      externalAccountLabel: res.ok ? "Google Ads Manager" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Google Ads health check failed." },
    };
  }
}

export const GOOGLE_ADS_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.google-ads.runtime",
    adapterVersion: "1.0.0",
    providerId: "google-ads",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "google-ads.upload_offline_conversion",
      "google-ads.create_customer_list",
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
  healthCheck: checkGoogleAdsHealth,
  executeAction: executeGoogleAdsAction,
};
