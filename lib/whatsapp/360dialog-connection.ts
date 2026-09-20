import "server-only";

import {
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  D360_WEBHOOK_SECRET_HEADER,
  whatsappTransportHeaders,
  whatsappTransportHealthEndpoint,
} from "@/lib/integrations/providers/whatsapp/transport";

export type Dialog360Mode = "sandbox" | "production";

export class Dialog360WebhookRegistrationError extends Error {
  constructor() {
    super("360dialog webhook registration could not be verified.");
    this.name = "Dialog360WebhookRegistrationError";
  }
}

export function generate360DialogWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function build360DialogWebhookUrl(
  requestUrl: string,
  endpointKey: string,
): string {
  return new URL(
    `/api/webhooks/whatsapp/${encodeURIComponent(endpointKey)}`,
    requestUrl,
  ).toString();
}

function equalSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readWebhookUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  return typeof data.url === "string"
    ? data.url
    : typeof data.webhook_url === "string"
      ? data.webhook_url
      : null;
}

function readWebhookHeaders(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const headers = (payload as Record<string, unknown>).headers;
  return headers && typeof headers === "object"
    ? headers as Record<string, unknown>
    : null;
}

/**
 * Registers a workspace-specific endpoint only after credentials are in the
 * encrypted vault. A readback confirms the callback URL and, when returned by
 * 360dialog, the secret header as well. Nothing from this function is safe to
 * return to a browser except that registration succeeded.
 */
export async function register360DialogWebhook(input: {
  apiKey: string;
  webhookSecret: string;
  callbackUrl: string;
  mode: Dialog360Mode;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = whatsappTransportHealthEndpoint({
    transport: "360dialog",
    mode: input.mode === "sandbox" ? "sandbox" : "live",
    phoneNumberId: "",
    graphApiVersion: "v26.0",
  });
  const headers = {
    ...whatsappTransportHeaders({
      transport: "360dialog",
      credential: input.apiKey,
    }),
    "Content-Type": "application/json",
  };

  const registration = await fetchImpl(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: input.callbackUrl,
      headers: {
        [D360_WEBHOOK_SECRET_HEADER]: input.webhookSecret,
      },
    }),
    cache: "no-store",
  });

  if (!registration.ok) {
    throw new Dialog360WebhookRegistrationError();
  }

  const readback = await fetchImpl(endpoint, {
    method: "GET",
    headers: whatsappTransportHeaders({
      transport: "360dialog",
      credential: input.apiKey,
    }),
    cache: "no-store",
  });

  if (!readback.ok) {
    throw new Dialog360WebhookRegistrationError();
  }

  const payload: unknown = await readback.json().catch(() => null);
  if (readWebhookUrl(payload) !== input.callbackUrl) {
    throw new Dialog360WebhookRegistrationError();
  }

  const returnedSecret = readWebhookHeaders(payload)?.[D360_WEBHOOK_SECRET_HEADER];
  if (returnedSecret !== undefined && (typeof returnedSecret !== "string" || !equalSecret(returnedSecret, input.webhookSecret))) {
    throw new Dialog360WebhookRegistrationError();
  }
}
