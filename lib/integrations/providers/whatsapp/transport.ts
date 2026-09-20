import "server-only";

import { IntegrationRuntimeError } from "@/types/integration-runtime";

export const WHATSAPP_TRANSPORTS = [
  "meta_cloud",
  "360dialog",
] as const;

export type WhatsAppTransportId = (typeof WHATSAPP_TRANSPORTS)[number];

const D360_SANDBOX_BASE_URL = "https://waba-sandbox.360dialog.io";
const D360_PRODUCTION_BASE_URL = "https://waba-v2.360dialog.io";

export function resolveWhatsAppTransport(
  configuration: Readonly<Record<string, unknown>>,
): WhatsAppTransportId {
  const configured = configuration.transport;

  // Existing connections remain on Meta Cloud unless an owner explicitly opts in.
  if (configured === undefined || configured === null || configured === "") {
    return "meta_cloud";
  }

  if (configured === "meta_cloud" || configured === "360dialog") {
    return configured;
  }

  throw new IntegrationRuntimeError("WhatsApp transport is unsupported.", {
    code: "WHATSAPP_TRANSPORT_UNSUPPORTED",
    category: "configuration",
    status: 409,
  });
}

export function whatsappTransportCredentialKeys(
  transport: WhatsAppTransportId,
): readonly string[] {
  return transport === "360dialog"
    ? ["api_key"]
    : ["access_token"];
}

export function whatsappTransportMessageEndpoint(input: {
  transport: WhatsAppTransportId;
  mode: "sandbox" | "live";
  phoneNumberId: string;
  graphApiVersion: string;
}): string {
  if (input.transport === "360dialog") {
    const baseUrl =
      input.mode === "sandbox"
        ? D360_SANDBOX_BASE_URL
        : D360_PRODUCTION_BASE_URL;
    return `${baseUrl}/v1/messages`;
  }

  return `https://graph.facebook.com/${input.graphApiVersion}/${input.phoneNumberId}/messages`;
}

export function whatsappTransportHealthEndpoint(input: {
  transport: WhatsAppTransportId;
  mode: "sandbox" | "live";
  phoneNumberId: string;
  graphApiVersion: string;
}): string {
  if (input.transport === "360dialog") {
    const baseUrl = input.mode === "sandbox" ? D360_SANDBOX_BASE_URL : D360_PRODUCTION_BASE_URL;
    return `${baseUrl}/v1/configs/webhook`;
  }

  const endpoint = new URL(`https://graph.facebook.com/${input.graphApiVersion}/${input.phoneNumberId}`);
  endpoint.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating");
  return endpoint.toString();
}

export function whatsappTransportHeaders(input: {
  transport: WhatsAppTransportId;
  credential: string;
}): Readonly<Record<string, string>> {
  return input.transport === "360dialog"
    ? { "D360-API-KEY": input.credential }
    : { Authorization: `Bearer ${input.credential}` };
}

/**
 * 360dialog forwards caller-configured headers. Its sandbox does not provide a
 * native request signature, so this per-workspace secret is mandatory and is
 * checked before a payload is parsed. Meta Cloud keeps its native HMAC path.
 */
export function whatsappTransportWebhookAuthMode(
  transport: WhatsAppTransportId,
): "meta_hmac" | "static_header" {
  return transport === "360dialog" ? "static_header" : "meta_hmac";
}

export const D360_WEBHOOK_SECRET_HEADER = "x-j10-webhook-secret";
