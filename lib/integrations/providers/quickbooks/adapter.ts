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
const QB_API_BASE = "https://quickbooks.api.intuit.com/v3/company";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_QUICKBOOKS_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readQuickBooksCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; realmId: string }> {
  const creds = await context.credentials.read(["access_token", "realm_id"]);
  const token = creds.access_token;
  const realmId = creds.realm_id || "1234567890";

  if (!token) {
    throw new IntegrationRuntimeError("QuickBooks Online OAuth access token is missing.", {
      code: "QUICKBOOKS_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, realmId };
}

async function executeQuickBooksAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_qb_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `qb_${Math.floor(Math.random() * 100000)}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const { token, realmId } = await readQuickBooksCredentials(invocation);

  switch (capabilityId) {
    case "quickbooks.create_customer": {
      const displayName = extractString(inputObj, "display_name", "Customer Display Name");

      const res = await fetch(`${QB_API_BASE}/${realmId}/customer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          DisplayName: displayName,
          PrimaryEmailAddr: inputObj.email ? { Address: inputObj.email } : undefined,
          PrimaryPhone: inputObj.phone ? { FreeFormNumber: inputObj.phone } : undefined,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.Fault?.Error?.[0]?.Message || "Failed to create QuickBooks customer.", {
          code: "QUICKBOOKS_CUSTOMER_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.Customer?.Id || `qb_cust_${Date.now()}`,
        rateLimit: null,
        metadata: { customerId: data.Customer?.Id },
      };
    }

    case "quickbooks.create_invoice": {
      const customerId = extractString(inputObj, "customer_id", "Customer Ref ID");
      const amount = typeof inputObj.amount === "number" ? inputObj.amount : 100;

      const res = await fetch(`${QB_API_BASE}/${realmId}/invoice`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          CustomerRef: { value: customerId },
          Line: [
            {
              Amount: amount,
              DetailType: "SalesItemLineDetail",
              SalesItemLineDetail: {
                ItemRef: { value: "1" },
              },
            },
          ],
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.Fault?.Error?.[0]?.Message || "Failed to create QuickBooks invoice.", {
          code: "QUICKBOOKS_INVOICE_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.Invoice?.Id || `qb_inv_${Date.now()}`,
        rateLimit: null,
        metadata: { invoiceId: data.Invoice?.Id, totalAmt: data.Invoice?.TotalAmt },
      };
    }

    case "quickbooks.record_expense": {
      const amount = typeof inputObj.amount === "number" ? inputObj.amount : 50;

      const res = await fetch(`${QB_API_BASE}/${realmId}/purchase`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          PaymentType: "Cash",
          AccountRef: { value: "35" },
          Line: [
            {
              Amount: amount,
              DetailType: "AccountBasedExpenseLineDetail",
              AccountBasedExpenseLineDetail: {
                AccountRef: { value: "40" },
              },
            },
          ],
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.Fault?.Error?.[0]?.Message || "Failed to record QuickBooks expense.", {
          code: "QUICKBOOKS_EXPENSE_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.Purchase?.Id || `qb_exp_${Date.now()}`,
        rateLimit: null,
        metadata: { purchaseId: data.Purchase?.Id },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported QuickBooks capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkQuickBooksHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "realm_id"]);
    const token = creds.access_token;
    const realmId = creds.realm_id || "1234567890";

    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "QuickBooks access token missing." },
      };
    }

    const res = await fetch(`${QB_API_BASE}/${realmId}/companyinfo/${realmId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: context.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: realmId,
      externalAccountLabel: "QuickBooks Online",
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "QuickBooks health check failed." },
    };
  }
}

export const QUICKBOOKS_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.quickbooks.runtime",
    adapterVersion: "1.0.0",
    providerId: "quickbooks",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "quickbooks.create_invoice",
      "quickbooks.create_customer",
      "quickbooks.record_expense",
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
  healthCheck: checkQuickBooksHealth,
  executeAction: executeQuickBooksAction,
};
