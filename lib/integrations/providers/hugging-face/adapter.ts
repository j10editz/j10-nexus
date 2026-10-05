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

const REQUEST_TIMEOUT_MS = 20_000;
const HF_INFERENCE_BASE = "https://api-inference.huggingface.co/models";
const HF_API_BASE = "https://huggingface.co/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_HF_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readHFCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; defaultModel?: string }> {
  const creds = await context.credentials.read(["access_token", "api_key", "token", "default_model"]);
  const token = creds.access_token || creds.api_key || creds.token;

  if (!token) {
    throw new IntegrationRuntimeError("Hugging Face API token is missing.", {
      code: "HF_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, defaultModel: creds.default_model };
}

async function executeHFAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_hf_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `hf_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, defaultModel } = await readHFCredentials(invocation);

  switch (capabilityId) {
    case "hugging-face.run_inference": {
      const model = typeof inputObj.model === "string" && inputObj.model.trim()
        ? inputObj.model.trim()
        : (defaultModel || "mistralai/Mistral-7B-Instruct-v0.2");

      const inputs = inputObj.inputs;
      if (inputs === undefined || inputs === null) {
        throw new IntegrationRuntimeError("inputs is required.", {
          code: "INVALID_HF_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${HF_INFERENCE_BASE}/${encodeURIComponent(model)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs,
          parameters: isRecord(inputObj.parameters) ? inputObj.parameters : undefined,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error || "Hugging Face inference failed.", {
          code: "HF_INFERENCE_FAILED",
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
        metadata: {
          model,
          output: data,
        },
      };
    }

    case "hugging-face.generate_embedding": {
      const model = typeof inputObj.model === "string" && inputObj.model.trim()
        ? inputObj.model.trim()
        : (defaultModel || "sentence-transformers/all-MiniLM-L6-v2");

      const inputs = inputObj.inputs;
      if (inputs === undefined || inputs === null) {
        throw new IntegrationRuntimeError("inputs is required.", {
          code: "INVALID_HF_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${HF_INFERENCE_BASE}/${encodeURIComponent(model)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error || "Hugging Face embedding generation failed.", {
          code: "HF_EMBEDDING_FAILED",
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
        metadata: {
          model,
          embeddings: data,
        },
      };
    }

    case "hugging-face.classify_content": {
      const model = typeof inputObj.model === "string" && inputObj.model.trim()
        ? inputObj.model.trim()
        : (defaultModel || "facebook/bart-large-mnli");

      const inputs = extractString(inputObj, "inputs", "inputs");
      const candidateLabels = Array.isArray(inputObj.candidate_labels)
        ? inputObj.candidate_labels
        : ["urgent", "support", "inquiry", "sales", "general"];

      const res = await fetch(`${HF_INFERENCE_BASE}/${encodeURIComponent(model)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs,
          parameters: { candidate_labels: candidateLabels },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error || "Hugging Face classification failed.", {
          code: "HF_CLASSIFY_FAILED",
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
        metadata: {
          model,
          classification: data,
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

async function checkHFHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "api_key", "token"]);
    const token = creds.access_token || creds.api_key || creds.token;
    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing API token" },
      };
    }

    const res = await fetch(`${HF_API_BASE}/whoami-v2`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const name = isRecord(data) && typeof data.name === "string" ? data.name : "Hugging Face User";
    const type = isRecord(data) && typeof data.type === "string" ? data.type : "user";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: name,
      externalAccountLabel: `${name} (${type})`,
      metadata: { status: res.status, email: isRecord(data) ? data.email : undefined },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Hugging Face health check failed." },
    };
  }
}

export const HUGGING_FACE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.hugging-face.runtime",
    adapterVersion: "1.0.0",
    providerId: "hugging-face",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "hugging-face.run_inference",
      "hugging-face.generate_embedding",
      "hugging-face.classify_content",
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
  healthCheck: checkHFHealth,
  executeAction: executeHFAction,
};
