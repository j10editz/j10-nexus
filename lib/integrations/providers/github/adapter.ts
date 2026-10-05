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
const GITHUB_API_BASE = "https://api.github.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_GITHUB_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readGitHubCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; defaultOwner?: string; defaultRepo?: string }> {
  const creds = await context.credentials.read(["access_token", "token", "default_owner", "default_repo"]);
  const token = creds.access_token || creds.token;

  if (!token) {
    throw new IntegrationRuntimeError("GitHub personal access token is missing.", {
      code: "GITHUB_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, defaultOwner: creds.default_owner, defaultRepo: creds.default_repo };
}

async function executeGitHubAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_gh_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `gh_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, defaultOwner, defaultRepo } = await readGitHubCredentials(invocation);

  const owner = typeof inputObj.owner === "string" && inputObj.owner.trim()
    ? inputObj.owner.trim()
    : defaultOwner;
  const repo = typeof inputObj.repo === "string" && inputObj.repo.trim()
    ? inputObj.repo.trim()
    : defaultRepo;

  if (!owner || !repo) {
    throw new IntegrationRuntimeError("owner and repo are required.", {
      code: "INVALID_GITHUB_INPUT",
      category: "validation",
      status: 400,
    });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "J10-Nexus-Engine",
  };

  switch (capabilityId) {
    case "github.create_issue": {
      const title = extractString(inputObj, "title", "Issue Title");
      const body = typeof inputObj.body === "string" ? inputObj.body : "";

      const res = await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          body,
          labels: Array.isArray(inputObj.labels) ? inputObj.labels : undefined,
          assignees: Array.isArray(inputObj.assignees) ? inputObj.assignees : undefined,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to create GitHub issue.", {
          code: "GITHUB_ISSUE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-github-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "github.add_comment": {
      const issueNumber = inputObj.issue_number ?? inputObj.id;
      if (!issueNumber) {
        throw new IntegrationRuntimeError("issue_number is required.", {
          code: "INVALID_GITHUB_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const body = extractString(inputObj, "body", "Comment Body");

      const res = await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(String(issueNumber))}/comments`, {
        method: "POST",
        headers,
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to add GitHub comment.", {
          code: "GITHUB_COMMENT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-github-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "github.dispatch_workflow": {
      const workflowId = inputObj.workflow_id ?? inputObj.id;
      if (!workflowId) {
        throw new IntegrationRuntimeError("workflow_id is required.", {
          code: "INVALID_GITHUB_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const ref = typeof inputObj.ref === "string" ? inputObj.ref : "main";

      const res = await fetch(`${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(String(workflowId))}/dispatches`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ref,
          inputs: isRecord(inputObj.inputs) ? inputObj.inputs : undefined,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new IntegrationRuntimeError(data?.message || "Failed to dispatch GitHub workflow.", {
          code: "GITHUB_DISPATCH_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-github-request-id") || null,
        rateLimit: null,
        metadata: {
          dispatched: true,
          owner,
          repo,
          workflowId,
          ref,
        },
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

async function checkGitHubHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "token"]);
    const token = creds.access_token || creds.token;
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

    const res = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "J10-Nexus-Engine",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const login = isRecord(data) && typeof data.login === "string" ? data.login : "github_user";
    const name = isRecord(data) && typeof data.name === "string" ? data.name : login;

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: login,
      externalAccountLabel: `${name} (@${login})`,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "GitHub health check failed." },
    };
  }
}

export const GITHUB_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.github.runtime",
    adapterVersion: "1.0.0",
    providerId: "github",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "github.create_issue",
      "github.add_comment",
      "github.dispatch_workflow",
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
  healthCheck: checkGitHubHealth,
  executeAction: executeGitHubAction,
};
