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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_MAILCHIMP_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readMailchimpCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ apiKey: string; dataCenter: string }> {
  const creds = await context.credentials.read(["api_key", "data_center"]);
  const apiKey = creds.api_key;
  // Mailchimp API keys typically end with the datacenter, e.g. "xxxx-us19"
  let dataCenter: string = creds.data_center || "";
  if (!dataCenter && apiKey && apiKey.includes("-")) {
    dataCenter = apiKey.split("-").pop() || "";
  }
  dataCenter = dataCenter || "us1";

  if (!apiKey) {
    throw new IntegrationRuntimeError("Mailchimp API key is missing.", {
      code: "MAILCHIMP_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { apiKey, dataCenter };
}

async function executeMailchimpAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_mc_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `mc_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { apiKey, dataCenter } = await readMailchimpCredentials(invocation);
  const baseUrl = `https://${dataCenter}.api.mailchimp.com/3.0`;

  switch (capabilityId) {
    case "mailchimp.add_subscriber": {
      const listId = extractString(inputObj, "list_id", "Audience List ID");
      const email = extractString(inputObj, "email", "Subscriber Email");
      const status = typeof inputObj.status === "string" ? inputObj.status : "subscribed";

      const payload: Record<string, unknown> = {
        email_address: email,
        status,
        merge_fields: {},
      };

      if (typeof inputObj.first_name === "string") {
        (payload.merge_fields as Record<string, unknown>).FNAME = inputObj.first_name;
      }
      if (typeof inputObj.last_name === "string") {
        (payload.merge_fields as Record<string, unknown>).LNAME = inputObj.last_name;
      }

      const res = await fetch(`${baseUrl}/lists/${encodeURIComponent(listId)}/members`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Mailchimp subscriber addition failed: ${res.statusText}`, {
          code: "MAILCHIMP_SUBSCRIBER_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: isRecord(data) && data.id ? String(data.id) : `mc_sub_${Date.now()}`,
        rateLimit: null,
        metadata: {
          listId,
          email,
          status,
        },
      };
    }

    case "mailchimp.create_campaign": {
      const listId = extractString(inputObj, "list_id", "Audience List ID");
      const subjectLine = extractString(inputObj, "subject_line", "Campaign Subject Line");
      const title = typeof inputObj.title === "string" ? inputObj.title : subjectLine;
      const type = typeof inputObj.type === "string" ? inputObj.type : "regular";

      const payload = {
        type,
        recipients: { list_id: listId },
        settings: {
          subject_line: subjectLine,
          title,
          from_name: typeof inputObj.from_name === "string" ? inputObj.from_name : "J10 Nexus",
          reply_to: typeof inputObj.reply_to === "string" ? inputObj.reply_to : "noreply@j10nexus.com",
        },
      };

      const res = await fetch(`${baseUrl}/campaigns`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Mailchimp campaign creation failed: ${res.statusText}`, {
          code: "MAILCHIMP_CAMPAIGN_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const campaignId = isRecord(data) && data.id ? String(data.id) : `camp_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: campaignId,
        rateLimit: null,
        metadata: {
          campaignId,
          title,
          status: "created",
        },
      };
    }

    case "mailchimp.tag_contact": {
      const listId = extractString(inputObj, "list_id", "Audience List ID");
      const email = extractString(inputObj, "email", "Subscriber Email");
      const tags = Array.isArray(inputObj.tags) ? inputObj.tags : [{ name: "VIP", status: "active" }];

      // Mailchimp uses MD5 hash of lowercase email as subscriber hash
      // When crypto MD5 is not imported, can use simple endpoint or fallback
      const crypto = await import("crypto");
      const subscriberHash = crypto.createHash("md5").update(email.toLowerCase().trim()).digest("hex");

      const res = await fetch(`${baseUrl}/lists/${encodeURIComponent(listId)}/members/${subscriberHash}/tags`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tags: tags.map((t) => (typeof t === "string" ? { name: t, status: "active" } : t)),
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Mailchimp contact tagging failed: ${res.statusText}`, {
          code: "MAILCHIMP_TAG_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: `tag_${Date.now()}`,
        rateLimit: null,
        metadata: {
          listId,
          email,
          tagsApplied: tags.length,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Mailchimp adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkMailchimpHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["api_key", "data_center"]);
    if (!creds.api_key) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing API key" },
      };
    }

    let dc: string = creds.data_center || "";
    if (!dc && creds.api_key.includes("-")) {
      dc = creds.api_key.split("-").pop() || "";
    }
    dc = dc || "us1";

    const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${creds.api_key}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: dc,
      externalAccountLabel: res.ok ? "Mailchimp Account" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Mailchimp health check failed." },
    };
  }
}

export const MAILCHIMP_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.mailchimp.runtime",
    adapterVersion: "1.0.0",
    providerId: "mailchimp",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "mailchimp.add_subscriber",
      "mailchimp.create_campaign",
      "mailchimp.tag_contact",
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
  healthCheck: checkMailchimpHealth,
  executeAction: executeMailchimpAction,
};
