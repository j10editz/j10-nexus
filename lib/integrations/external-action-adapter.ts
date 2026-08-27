import "server-only";

import {
  createHash,
} from "node:crypto";

import type {
  IntegrationCapabilityDefinition,
  IntegrationConnection,
} from "../../types/integration";

import {
  INTEGRATION_ACTION_MODES,
  INTEGRATION_ACTION_SCHEMA_VERSION,
} from "../../types/integration-action";

import type {
  IntegrationActionAdapterResult,
  IntegrationActionMode,
  IntegrationActionPlan,
  IntegrationActionPolicyDecision,
  IntegrationActionRequest,
  IntegrationActionRisk,
} from "../../types/integration-action";

import {
  getIntegrationCapability,
  getIntegrationProvider,
} from "./registry";

const MAX_ACTION_INPUT_BYTES =
  64 * 1024;

const MAX_SANDBOX_RESPONSE_BYTES =
  128 * 1024;

const SANDBOX_TIMEOUT_MS =
  10_000;

const BLOCKED_CUSTOM_HEADERS =
  new Set([
    "authorization",
    "connection",
    "content-length",
    "cookie",
    "host",
    "proxy-authenticate",
    "proxy-authorization",
    "set-cookie",
    "transfer-encoding",
  ]);

const HIGH_RISK_CAPABILITIES =
  new Set([
    "stripe.payment.refund",
    "stripe.subscription.cancel",
    "shopify.order.fulfill",
    "shopify.inventory.adjust",
  ]);

export class IntegrationActionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    message: string,
    code = "INTEGRATION_ACTION_ERROR",
    status = 400,
    details?: unknown,
  ) {
    super(message);

    this.name =
      "IntegrationActionError";

    this.code =
      code;

    this.status =
      status;

    this.details =
      details;
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function requireString(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): string {
  const value =
    input[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new IntegrationActionError(
      `${label} is required.`,
      "INTEGRATION_ACTION_INPUT_REQUIRED",
    );
  }

  return value.trim();
}

function optionalPositiveInteger(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): number | null {
  const value =
    input[key];

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new IntegrationActionError(
      `${label} must be a positive integer.`,
      "INVALID_INTEGRATION_ACTION_NUMBER",
    );
  }

  return parsed;
}

function requireFiniteNumber(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): number {
  const value =
    Number(input[key]);

  if (!Number.isFinite(value)) {
    throw new IntegrationActionError(
      `${label} must be a finite number.`,
      "INVALID_INTEGRATION_ACTION_NUMBER",
    );
  }

  return value;
}

function normalizeJsonValue(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    if (!Number.isFinite(value)) {
      throw new IntegrationActionError(
        "Integration action input contains an invalid number.",
        "INVALID_INTEGRATION_ACTION_INPUT",
      );
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      normalizeJsonValue,
    );
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          (key) => [
            key,
            normalizeJsonValue(
              value[key],
            ),
          ],
        ),
    );
  }

  throw new IntegrationActionError(
    "Integration action input must contain JSON-compatible values.",
    "INVALID_INTEGRATION_ACTION_INPUT",
  );
}

function stableJson(
  value: unknown,
): string {
  return JSON.stringify(
    normalizeJsonValue(value),
  );
}

function validateInputSize(
  input: Readonly<Record<string, unknown>>,
): void {
  const serialized =
    stableJson(input);

  if (
    Buffer.byteLength(
      serialized,
      "utf8",
    ) > MAX_ACTION_INPUT_BYTES
  ) {
    throw new IntegrationActionError(
      "Integration action input exceeds the 64 KB safety limit.",
      "INTEGRATION_ACTION_INPUT_TOO_LARGE",
      413,
    );
  }
}

function validateCustomHeaders(
  value: unknown,
): void {
  if (
    value === undefined ||
    value === null
  ) {
    return;
  }

  if (!isRecord(value)) {
    throw new IntegrationActionError(
      "Webhook headers must be a JSON object.",
      "INVALID_INTEGRATION_ACTION_HEADERS",
    );
  }

  for (
    const [name, headerValue]
    of Object.entries(value)
  ) {
    const normalizedName =
      name.trim().toLowerCase();

    if (
      !normalizedName ||
      BLOCKED_CUSTOM_HEADERS.has(
        normalizedName,
      )
    ) {
      throw new IntegrationActionError(
        `Webhook header is not allowed: ${name}`,
        "BLOCKED_INTEGRATION_ACTION_HEADER",
      );
    }

    if (
      typeof headerValue !== "string" ||
      headerValue.length > 4_096
    ) {
      throw new IntegrationActionError(
        `Webhook header value is invalid: ${name}`,
        "INVALID_INTEGRATION_ACTION_HEADER_VALUE",
      );
    }
  }
}

function validateGenericWebhookInput(
  capabilityId: string,
  input: Readonly<Record<string, unknown>>,
): string {
  if (
    capabilityId ===
    "webhook.response.return"
  ) {
    optionalPositiveInteger(
      input,
      "statusCode",
      "Status code",
    );

    return "Return webhook response";
  }

  const rawUrl =
    requireString(
      input,
      "url",
      "Webhook URL",
    );

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new IntegrationActionError(
      "Webhook URL is invalid.",
      "INVALID_INTEGRATION_ACTION_URL",
    );
  }

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new IntegrationActionError(
      "Webhook URL must use HTTP or HTTPS.",
      "INVALID_INTEGRATION_ACTION_URL_PROTOCOL",
    );
  }

  const method =
    typeof input.method === "string"
      ? input.method.trim().toUpperCase()
      : "POST";

  if (
    ![
      "GET",
      "POST",
      "PUT",
      "PATCH",
    ].includes(method)
  ) {
    throw new IntegrationActionError(
      "Webhook method must be GET, POST, PUT, or PATCH.",
      "INVALID_INTEGRATION_ACTION_METHOD",
    );
  }

  validateCustomHeaders(
    input.headers,
  );

  return `${method} ${url.origin}`;
}

function validateProviderInput(
  connection: IntegrationConnection,
  capabilityId: string,
  input: Readonly<Record<string, unknown>>,
): string {
  switch (capabilityId) {
    case "gmail.message.send":
      requireString(input, "to", "Recipient");
      requireString(input, "subject", "Subject");
      requireString(input, "body", "Email body");
      return "Send Gmail message";

    case "gmail.message.reply":
      requireString(input, "messageId", "Message ID");
      requireString(input, "body", "Reply body");
      return "Reply to Gmail message";

    case "gmail.message.add_label":
      requireString(input, "messageId", "Message ID");
      requireString(input, "labelId", "Label ID");
      return "Add Gmail label";

    case "google-calendar.event.create":
      requireString(input, "summary", "Event summary");
      requireString(input, "start", "Event start");
      requireString(input, "end", "Event end");
      return "Create calendar event";

    case "google-calendar.event.update":
      requireString(input, "eventId", "Event ID");
      return "Update calendar event";

    case "google-calendar.event.cancel":
      requireString(input, "eventId", "Event ID");
      return "Cancel calendar event";

    case "whatsapp.message.send":
      requireString(input, "to", "Recipient phone number");
      requireString(input, "message", "Message");
      return "Send WhatsApp message";

    case "whatsapp.template.send":
      requireString(input, "to", "Recipient phone number");
      requireString(input, "templateName", "Template name");
      return "Send WhatsApp template";

    case "whatsapp.media.send":
      requireString(input, "to", "Recipient phone number");
      requireString(input, "mediaUrl", "Media URL");
      requireString(input, "mediaType", "Media type");
      return "Send WhatsApp media";

    case "shopify.order.add_tag":
      requireString(input, "orderId", "Order ID");
      requireString(input, "tag", "Order tag");
      return "Add Shopify order tag";

    case "shopify.order.fulfill":
      requireString(input, "orderId", "Order ID");
      return "Fulfill Shopify order";

    case "shopify.inventory.adjust":
      requireString(input, "inventoryItemId", "Inventory item ID");
      requireString(input, "locationId", "Location ID");
      requireFiniteNumber(input, "delta", "Inventory delta");
      return "Adjust Shopify inventory";

    case "stripe.payment_link.create":
      requireString(input, "priceId", "Stripe price ID");
      optionalPositiveInteger(input, "quantity", "Quantity");
      return "Create Stripe payment link";

    case "stripe.payment.refund":
      requireString(input, "paymentIntentId", "Payment intent ID");
      optionalPositiveInteger(input, "amount", "Refund amount");
      return "Refund Stripe payment";

    case "stripe.subscription.cancel":
      requireString(input, "subscriptionId", "Subscription ID");
      return "Cancel Stripe subscription";

    case "webhook.request.send":
    case "webhook.response.return":
      return validateGenericWebhookInput(
        capabilityId,
        input,
      );

    default:
      if (
        getIntegrationProvider(
          connection.providerId,
        ).availability === "planned"
      ) {
        return `Preview ${capabilityId}`;
      }

      throw new IntegrationActionError(
        `No Day 14I adapter exists for capability: ${capabilityId}`,
        "INTEGRATION_ACTION_ADAPTER_NOT_IMPLEMENTED",
        501,
      );
  }
}

function getActionRisk(
  capabilityId: string,
): IntegrationActionRisk {
  return HIGH_RISK_CAPABILITIES.has(
    capabilityId,
  )
    ? "high_risk"
    : "external_side_effect";
}

export function parseIntegrationActionMode(
  value: unknown,
): IntegrationActionMode {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "simulate";
  }

  if (
    typeof value === "string" &&
    (
      INTEGRATION_ACTION_MODES as
        readonly string[]
    ).includes(value)
  ) {
    return value as
      IntegrationActionMode;
  }

  throw new IntegrationActionError(
    "Integration action mode must be simulate, sandbox, or live.",
    "INVALID_INTEGRATION_ACTION_MODE",
  );
}

export function parseIntegrationActionInput(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (
    value === undefined ||
    value === null
  ) {
    return {};
  }

  if (!isRecord(value)) {
    throw new IntegrationActionError(
      "Integration action input must be a JSON object.",
      "INVALID_INTEGRATION_ACTION_INPUT",
    );
  }

  validateInputSize(value);

  return value;
}

export function parseIntegrationActionIdempotencyKey(
  bodyValue: unknown,
  headerValue: string | null,
): string {
  const candidate =
    typeof bodyValue === "string"
      ? bodyValue.trim()
      : headerValue?.trim() ?? "";

  if (
    candidate.length < 8 ||
    candidate.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(
      candidate,
    )
  ) {
    throw new IntegrationActionError(
      "Idempotency key must contain 8-128 safe characters.",
      "INVALID_INTEGRATION_ACTION_IDEMPOTENCY_KEY",
    );
  }

  return candidate;
}

export function resolveIntegrationActionCapability(
  connection: IntegrationConnection,
  capabilityIdValue: unknown,
): IntegrationCapabilityDefinition {
  if (
    typeof capabilityIdValue !== "string" ||
    !capabilityIdValue.trim()
  ) {
    throw new IntegrationActionError(
      "Integration action capability ID is required.",
      "INTEGRATION_ACTION_CAPABILITY_REQUIRED",
    );
  }

  const capabilityId =
    capabilityIdValue.trim();

  const capability =
    getIntegrationCapability(
      connection.providerId,
      capabilityId,
    );

  if (
    !capability ||
    capability.kind !== "action"
  ) {
    throw new IntegrationActionError(
      `Unsupported action capability for this connection: ${capabilityId}`,
      "UNSUPPORTED_INTEGRATION_ACTION_CAPABILITY",
    );
  }

  if (
    !connection.enabledCapabilities.includes(
      capability.id,
    )
  ) {
    throw new IntegrationActionError(
      `Action capability is not enabled for this connection: ${capability.id}`,
      "INTEGRATION_ACTION_CAPABILITY_DISABLED",
      403,
    );
  }

  return capability;
}

export function evaluateIntegrationActionPolicy(
  connection: IntegrationConnection,
  capability: IntegrationCapabilityDefinition,
  mode: IntegrationActionMode,
): IntegrationActionPolicyDecision {
  const risk =
    getActionRisk(
      capability.id,
    );

  if (
    mode === "live" &&
    connection.environment !==
      "production"
  ) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      risk,
      code:
        "INTEGRATION_LIVE_ENVIRONMENT_REQUIRED",
      reason:
        "Live provider actions require a production integration connection.",
    };
  }

  if (
    mode === "live" &&
    connection.status !==
      "connected"
  ) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      risk,
      code:
        "INTEGRATION_LIVE_CONNECTION_NOT_READY",
      reason:
        "Live provider actions require a connected and authorized integration.",
    };
  }

  if (
    mode !== "simulate" &&
    [
      "disabled",
      "revoked",
      "error",
    ].includes(connection.status)
  ) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      risk,
      code: "INTEGRATION_CONNECTION_NOT_EXECUTABLE",
      reason:
        `Connection status ${connection.status} cannot execute external actions.`,
    };
  }


  const provider =
    getIntegrationProvider(
      connection.providerId,
    );

  if (
    mode === "sandbox" &&
    provider.availability === "planned"
  ) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      risk,
      code: "PLANNED_PROVIDER_SIMULATION_ONLY",
      reason:
        `${provider.name} is cataloged but its operational adapter is not installed.`,
    };
  }

  return {
    allowed: true,
    requiresHumanApproval:
      mode !== "simulate" &&
      (
        capability.requiresApprovalByDefault ||
        risk === "high_risk"
      ),
    risk,
    code:
      mode === "live"
        ? "LIVE_RUNTIME_ALLOWED"
        : mode === "sandbox"
          ? "DEVELOPMENT_SANDBOX_ALLOWED"
          : "SIMULATION_ALLOWED",
    reason:
      mode === "live"
        ? "The installed live provider runtime may execute after all J10 policy and approval requirements pass."
        : mode === "sandbox"
          ? "The action may execute only against the isolated J10 development sandbox."
          : "The action will be validated and planned without an external side effect.",
  };
}

export function createIntegrationActionFingerprint(
  connection: IntegrationConnection,
  request: IntegrationActionRequest,
): string {
  return createHash("sha256")
    .update(
      stableJson({
        schemaVersion:
          INTEGRATION_ACTION_SCHEMA_VERSION,
        integrationId:
          connection.id,
        providerId:
          connection.providerId,
        capabilityId:
          request.capabilityId,
        mode:
          request.mode,
        input:
          request.input,
      }),
      "utf8",
    )
    .digest("hex");
}

export function createIntegrationActionPlan(
  connection: IntegrationConnection,
  capability: IntegrationCapabilityDefinition,
  request: IntegrationActionRequest,
  requestOrigin: string,
): IntegrationActionPlan {
  const operation =
    validateProviderInput(
      connection,
      capability.id,
      request.input,
    );

  const provider =
    getIntegrationProvider(
      connection.providerId,
    );

  const target =
    request.mode === "sandbox"
      ? new URL(
          "/api/integrations/action-sandbox",
          requestOrigin,
        ).toString()
      : request.mode === "simulate"
        ? "no-external-request"
        : "live-provider-endpoint";

  return {
    schemaVersion:
      INTEGRATION_ACTION_SCHEMA_VERSION,
    providerId:
      connection.providerId,
    capabilityId:
      capability.id,
    mode:
      request.mode,
    environment:
      connection.environment,
    adapter:
      request.mode === "live"
        ? `${provider.id}.runtime`
        : `${provider.id}.day14i`,
    operation,
    inputKeys:
      Object.keys(request.input)
        .sort(),
    target,
    method:
      request.mode === "sandbox"
        ? "POST"
        : request.mode === "live"
          ? "PROVIDER"
          : "NONE",
  };
}

async function readBoundedResponse(
  response: Response,
): Promise<unknown> {
  const text =
    await response.text();

  if (
    Buffer.byteLength(
      text,
      "utf8",
    ) > MAX_SANDBOX_RESPONSE_BYTES
  ) {
    throw new IntegrationActionError(
      "Integration sandbox response exceeded the safety limit.",
      "INTEGRATION_ACTION_RESPONSE_TOO_LARGE",
      502,
    );
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      text:
        text.slice(0, 2_000),
    };
  }
}

export async function executeIntegrationActionPlan(
  plan: IntegrationActionPlan,
  request: IntegrationActionRequest,
  executionId: string,
): Promise<IntegrationActionAdapterResult> {
  if (
    plan.mode === "simulate"
  ) {
    return {
      success: true,
      responseStatus: null,
      metadata: {
        schemaVersion:
          plan.schemaVersion,
        adapter:
          plan.adapter,
        operation:
          plan.operation,
        simulated: true,
        externalRequestSent: false,
        inputKeys:
          plan.inputKeys,
      },
    };
  }

  if (
    plan.mode === "live"
  ) {
    throw new IntegrationActionError(
      "The requested live provider adapter is not installed.",
      "INTEGRATION_LIVE_ADAPTER_NOT_INSTALLED",
      501,
    );
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      SANDBOX_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        plan.target,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "X-J10-Internal-Action-Sandbox":
              "day14i",
            "X-J10-Action-Execution-ID":
              executionId,
          },
          body: JSON.stringify({
            schemaVersion:
              plan.schemaVersion,
            executionId,
            providerId:
              plan.providerId,
            capabilityId:
              plan.capabilityId,
            operation:
              plan.operation,
            input:
              request.input,
          }),
          redirect: "error",
          cache: "no-store",
          signal:
            controller.signal,
        },
      );

    const responseBody =
      await readBoundedResponse(
        response,
      );

    if (!response.ok) {
      throw new IntegrationActionError(
        "J10 integration action sandbox rejected the request.",
        "INTEGRATION_ACTION_SANDBOX_REJECTED",
        502,
        {
          responseStatus:
            response.status,
        },
      );
    }

    return {
      success: true,
      responseStatus:
        response.status,
      metadata: {
        schemaVersion:
          plan.schemaVersion,
        adapter:
          plan.adapter,
        operation:
          plan.operation,
        simulated: false,
        sandbox: true,
        externalRequestSent: false,
        inputKeys:
          plan.inputKeys,
        receipt:
          responseBody,
      },
    };
  } catch (error) {
    if (
      error instanceof
      IntegrationActionError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new IntegrationActionError(
        "J10 integration action sandbox timed out.",
        "INTEGRATION_ACTION_SANDBOX_TIMEOUT",
        504,
      );
    }

    throw new IntegrationActionError(
      "J10 integration action sandbox could not execute the request.",
      "INTEGRATION_ACTION_SANDBOX_FAILED",
      502,
      error,
    );
  } finally {
    clearTimeout(timeout);
  }
}
