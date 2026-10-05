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
const JOBBER_GRAPHQL_ENDPOINT = "https://api.getjobber.com/api/graphql";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_JOBBER_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readJobberCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string }> {
  const creds = await context.credentials.read(["access_token"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Jobber OAuth access token is missing.", {
      code: "JOBBER_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token };
}

async function executeJobberAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_jobber_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `jobber_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readJobberCredentials(invocation);

  switch (capabilityId) {
    case "jobber.create_job": {
      const title = extractString(inputObj, "title", "Job title");
      const clientId = extractString(inputObj, "client_id", "Client ID");
      const description = typeof inputObj.description === "string" ? inputObj.description : "";

      const query = `
        mutation JobCreate($input: JobCreateInput!) {
          jobCreate(input: $input) {
            job {
              id
              title
              jobStatus
            }
            userErrors {
              message
              path
            }
          }
        }
      `;

      const res = await fetch(JOBBER_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-JOBBER-GRAPHQL-VERSION": "2024-03-01",
        },
        body: JSON.stringify({
          query,
          variables: {
            input: {
              title,
              clientId,
              description,
            },
          },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Jobber job creation failed: ${res.statusText}`, {
          code: "JOBBER_JOB_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const jobId = isRecord(data) && isRecord((data as any).data?.jobCreate?.job)
        ? (data as any).data.jobCreate.job.id
        : `job_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: jobId,
        rateLimit: null,
        metadata: {
          jobId,
          title,
          clientId,
        },
      };
    }

    case "jobber.schedule_visit": {
      const jobId = extractString(inputObj, "job_id", "Job ID");
      const startAt = extractString(inputObj, "start_at", "Start timestamp");
      const endAt = typeof inputObj.end_at === "string" ? inputObj.end_at : startAt;
      const title = typeof inputObj.title === "string" ? inputObj.title : "Service Visit";

      const query = `
        mutation VisitCreate($input: VisitCreateInput!) {
          visitCreate(input: $input) {
            visit {
              id
              title
              startAt
              endAt
            }
            userErrors {
              message
            }
          }
        }
      `;

      const res = await fetch(JOBBER_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-JOBBER-GRAPHQL-VERSION": "2024-03-01",
        },
        body: JSON.stringify({
          query,
          variables: {
            input: {
              jobId,
              title,
              startAt,
              endAt,
            },
          },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Jobber visit scheduling failed: ${res.statusText}`, {
          code: "JOBBER_VISIT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const visitId = isRecord(data) && isRecord((data as any).data?.visitCreate?.visit)
        ? (data as any).data.visitCreate.visit.id
        : `visit_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: visitId,
        rateLimit: null,
        metadata: {
          visitId,
          jobId,
          startAt,
        },
      };
    }

    case "jobber.create_invoice": {
      const jobId = extractString(inputObj, "job_id", "Job ID");
      const amount = typeof inputObj.amount === "number" ? inputObj.amount : 0;

      const query = `
        mutation InvoiceCreate($input: InvoiceCreateInput!) {
          invoiceCreate(input: $input) {
            invoice {
              id
              invoiceNumber
              total
            }
            userErrors {
              message
            }
          }
        }
      `;

      const res = await fetch(JOBBER_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-JOBBER-GRAPHQL-VERSION": "2024-03-01",
        },
        body: JSON.stringify({
          query,
          variables: {
            input: {
              jobId,
            },
          },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Jobber invoice creation failed: ${res.statusText}`, {
          code: "JOBBER_INVOICE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const invoiceId = isRecord(data) && isRecord((data as any).data?.invoiceCreate?.invoice)
        ? (data as any).data.invoiceCreate.invoice.id
        : `inv_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: invoiceId,
        rateLimit: null,
        metadata: {
          invoiceId,
          jobId,
          amount,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Jobber adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkJobberHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token"]);
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

    const res = await fetch(JOBBER_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
        "X-JOBBER-GRAPHQL-VERSION": "2024-03-01",
      },
      body: JSON.stringify({
        query: `query HealthCheck { currentUser { id name } }`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: res.ok ? "jobber_account" : null,
      externalAccountLabel: res.ok ? "Jobber Field Service" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Jobber health check failed." },
    };
  }
}

export const JOBBER_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.jobber.runtime",
    adapterVersion: "1.0.0",
    providerId: "jobber",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "jobber.create_job",
      "jobber.schedule_visit",
      "jobber.create_invoice",
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
  healthCheck: checkJobberHealth,
  executeAction: executeJobberAction,
};
