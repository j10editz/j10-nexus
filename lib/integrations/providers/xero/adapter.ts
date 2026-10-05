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
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_XERO_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readXeroCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; tenantId: string }> {
  const creds = await context.credentials.read(["access_token", "tenant_id"]);
  const token = creds.access_token;
  const tenantId = creds.tenant_id || "xero-tenant-default";

  if (!token) {
    throw new IntegrationRuntimeError("Xero OAuth access token is missing.", {
      code: "XERO_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, tenantId };
}

async function executeXeroAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_xero_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `xero_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, tenantId } = await readXeroCredentials(invocation);

  switch (capabilityId) {
    case "xero.create_invoice": {
      const contactName = extractString(inputObj, "contact_name", "Contact name");
      const lineAmount = typeof inputObj.amount === "number" ? inputObj.amount : 0;
      const description = typeof inputObj.description === "string" ? inputObj.description : "Services rendered";

      const payload = {
        Type: "ACCREC",
        Contact: { Name: contactName },
        LineItems: [
          {
            Description: description,
            Quantity: 1,
            UnitAmount: lineAmount,
            AccountCode: typeof inputObj.account_code === "string" ? inputObj.account_code : "200",
          },
        ],
        Date: new Date().toISOString().split("T")[0],
        DueDate: typeof inputObj.due_date === "string" ? inputObj.due_date : undefined,
        Status: typeof inputObj.status === "string" ? inputObj.status : "DRAFT",
      };

      const res = await fetch(`${XERO_API_BASE}/Invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Xero-tenant-id": tenantId,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Xero invoice creation failed: ${res.statusText}`, {
          code: "XERO_INVOICE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const invoiceId = isRecord(data) && Array.isArray(data.Invoices) && data.Invoices[0]
        ? (data.Invoices[0] as Record<string, unknown>).InvoiceID
        : null;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: typeof invoiceId === "string" ? invoiceId : `inv_${Date.now()}`,
        rateLimit: null,
        metadata: {
          invoiceId,
          contactName,
          amount: lineAmount,
        },
      };
    }

    case "xero.create_contact": {
      const name = extractString(inputObj, "name", "Contact name");
      const email = typeof inputObj.email === "string" ? inputObj.email.trim() : undefined;
      const phone = typeof inputObj.phone === "string" ? inputObj.phone.trim() : undefined;

      const payload = {
        Contacts: [
          {
            Name: name,
            EmailAddress: email,
            Phones: phone ? [{ PhoneType: "DEFAULT", PhoneNumber: phone }] : undefined,
          },
        ],
      };

      const res = await fetch(`${XERO_API_BASE}/Contacts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Xero-tenant-id": tenantId,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Xero contact creation failed: ${res.statusText}`, {
          code: "XERO_CONTACT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const contactId = isRecord(data) && Array.isArray(data.Contacts) && data.Contacts[0]
        ? (data.Contacts[0] as Record<string, unknown>).ContactID
        : null;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: typeof contactId === "string" ? contactId : `contact_${Date.now()}`,
        rateLimit: null,
        metadata: {
          contactId,
          name,
          email,
        },
      };
    }

    case "xero.create_bill": {
      const supplierName = extractString(inputObj, "supplier_name", "Supplier name");
      const amount = typeof inputObj.amount === "number" ? inputObj.amount : 0;
      const description = typeof inputObj.description === "string" ? inputObj.description : "Accounts payable bill";

      const payload = {
        Type: "ACCPAY",
        Contact: { Name: supplierName },
        LineItems: [
          {
            Description: description,
            Quantity: 1,
            UnitAmount: amount,
            AccountCode: typeof inputObj.account_code === "string" ? inputObj.account_code : "300",
          },
        ],
        Date: new Date().toISOString().split("T")[0],
        DueDate: typeof inputObj.due_date === "string" ? inputObj.due_date : undefined,
        Status: typeof inputObj.status === "string" ? inputObj.status : "DRAFT",
      };

      const res = await fetch(`${XERO_API_BASE}/Invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Xero-tenant-id": tenantId,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Xero bill creation failed: ${res.statusText}`, {
          code: "XERO_BILL_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const billId = isRecord(data) && Array.isArray(data.Invoices) && data.Invoices[0]
        ? (data.Invoices[0] as Record<string, unknown>).InvoiceID
        : null;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: typeof billId === "string" ? billId : `bill_${Date.now()}`,
        rateLimit: null,
        metadata: {
          billId,
          supplierName,
          amount,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Xero adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkXeroHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "tenant_id"]);
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

    const res = await fetch("https://api.xero.com/connections", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: creds.tenant_id || "xero_org",
      externalAccountLabel: res.ok ? "Xero Organization" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Xero health check failed." },
    };
  }
}

export const XERO_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.xero.runtime",
    adapterVersion: "1.0.0",
    providerId: "xero",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "xero.create_invoice",
      "xero.create_contact",
      "xero.create_bill",
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
  healthCheck: checkXeroHealth,
  executeAction: executeXeroAction,
};
