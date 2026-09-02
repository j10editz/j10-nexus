import "server-only";

import type {
  ExternalTriggerActor,
  ExternalTriggerEvent,
  ExternalTriggerSubject,
} from "../../types/external-trigger";

import {
  EXTERNAL_TRIGGER_SCHEMA_VERSION,
} from "../../types/external-trigger";

import type {
  IntegrationWebhookEvent,
} from "../../types/integration-webhook";

import {
  IntegrationWebhookError,
} from "./webhooks/errors";

type AdapterResult = {
  capabilityId: string;
  providerEventType: string;
  subject: ExternalTriggerSubject;
  actor: ExternalTriggerActor | null;
  data: Record<string, unknown>;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function stringValue(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function subject(
  type: string,
  id: unknown,
  label?: unknown,
): ExternalTriggerSubject {
  return {
    type,
    id: stringValue(id),
    label: stringValue(label),
  };
}

function actor(
  type: string,
  id: unknown,
  label?: unknown,
): ExternalTriggerActor | null {
  const normalizedId = stringValue(id);
  const normalizedLabel = stringValue(label);

  if (!normalizedId && !normalizedLabel) {
    return null;
  }

  return {
    type,
    id: normalizedId,
    label: normalizedLabel,
  };
}

function adaptGenericWebhook(
  event: IntegrationWebhookEvent,
): AdapterResult {
  const payloadActor = isRecord(event.payload.actor)
    ? event.payload.actor
    : null;

  return {
    capabilityId: "webhook.request.received",
    providerEventType: event.eventType,
    subject: subject(
      stringValue(event.payload.subjectType) || "webhook_request",
      event.payload.id ?? event.externalEventId,
      event.payload.name ?? event.payload.title,
    ),
    actor: payloadActor
      ? actor(
          stringValue(payloadActor.type) || "external_actor",
          payloadActor.id,
          payloadActor.name ?? payloadActor.label,
        )
      : null,
    data: {
      payload: event.payload,
    },
  };
}

const STRIPE_CAPABILITY_BY_EVENT: Readonly<Record<string, string>> = {
  "payment_intent.succeeded": "stripe.payment.succeeded",
  "charge.succeeded": "stripe.payment.succeeded",
  "checkout.session.completed": "stripe.payment.succeeded",
  "payment_intent.payment_failed": "stripe.payment.failed",
  "charge.failed": "stripe.payment.failed",
  "customer.subscription.updated": "stripe.subscription.updated",
};

function adaptStripeWebhook(
  event: IntegrationWebhookEvent,
): AdapterResult {
  const dataEnvelope = isRecord(event.payload.data)
    ? event.payload.data
    : {};

  const stripeObject = isRecord(dataEnvelope.object)
    ? dataEnvelope.object
    : {};

  const providerEventType =
    stringValue(event.payload.type) || event.eventType;

  const capabilityId =
    STRIPE_CAPABILITY_BY_EVENT[providerEventType] ||
    "stripe.event.received";

  return {
    capabilityId,
    providerEventType,
    subject: subject(
      stringValue(stripeObject.object) || "stripe_object",
      stripeObject.id ?? event.externalEventId,
      stripeObject.description ??
        stripeObject.name ??
        stripeObject.email,
    ),
    actor: actor(
      "stripe_customer",
      stripeObject.customer,
      stripeObject.customer_email ??
        stripeObject.receipt_email,
    ),
    data: {
      object: stripeObject,
      event: {
        id: event.payload.id ?? event.externalEventId,
        type: providerEventType,
        created: event.payload.created ?? null,
        livemode: event.payload.livemode ?? null,
        apiVersion: event.payload.api_version ?? null,
      },
    },
  };
}

const SHOPIFY_CAPABILITY_BY_TOPIC: Readonly<Record<string, string>> = {
  "orders/create": "shopify.order.created",
  "orders/paid": "shopify.order.paid",
  "customers/create": "shopify.customer.created",
};

function adaptShopifyWebhook(
  event: IntegrationWebhookEvent,
): AdapterResult {
  const providerEventType = event.eventType;

  const capabilityId =
    SHOPIFY_CAPABILITY_BY_TOPIC[providerEventType] ||
    "shopify.webhook.received";

  const customer = isRecord(event.payload.customer)
    ? event.payload.customer
    : null;

  const subjectType = capabilityId.includes("customer")
    ? "shopify_customer"
    : capabilityId.includes("order")
      ? "shopify_order"
      : "shopify_resource";

  return {
    capabilityId,
    providerEventType,
    subject: subject(
      subjectType,
      event.payload.admin_graphql_api_id ??
        event.payload.id ??
        event.externalEventId,
      event.payload.name ??
        event.payload.email ??
        event.payload.title,
    ),
    actor: customer
      ? actor(
          "shopify_customer",
          customer.id,
          customer.email ??
            `${stringValue(customer.first_name) || ""} ${
              stringValue(customer.last_name) || ""
            }`.trim(),
        )
      : null,
    data: {
      resource: event.payload,
      shopDomain:
        event.headers["x-shopify-shop-domain"] ?? null,
    },
  };
}

function firstRecord(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return isRecord(value[0]) ? value[0] : null;
}

function adaptWhatsAppWebhook(
  event: IntegrationWebhookEvent,
): AdapterResult {
  const entry = firstRecord(event.payload.entry);
  const wrappedChange = firstRecord(entry?.changes);
  const sampleChange =
    typeof event.payload.field === "string" &&
    isRecord(event.payload.value)
      ? event.payload
      : null;
  const change =
    wrappedChange ?? sampleChange;
  const value = isRecord(change?.value) ? change.value : {};
  const message = firstRecord(value.messages);
  const status = firstRecord(value.statuses);
  const contact = firstRecord(value.contacts);
  const metadata = isRecord(value.metadata) ? value.metadata : {};

  if (message) {
    const profile = isRecord(contact?.profile)
      ? contact.profile
      : null;

    return {
      capabilityId: "whatsapp.message.received",
      providerEventType: event.eventType,
      subject: subject(
        "whatsapp_message",
        message.id ?? event.externalEventId,
        message.type,
      ),
      actor: actor(
        "whatsapp_contact",
        message.from ?? contact?.wa_id,
        profile?.name,
      ),
      data: {
        message,
        contact,
        metadata,
        field: change?.field ?? null,
      },
    };
  }

  if (status) {
    return {
      capabilityId: "whatsapp.message.status_updated",
      providerEventType: event.eventType,
      subject: subject(
        "whatsapp_message_status",
        status.id ?? event.externalEventId,
        status.status,
      ),
      actor: actor(
        "whatsapp_recipient",
        status.recipient_id,
      ),
      data: {
        status,
        metadata,
        field: change?.field ?? null,
      },
    };
  }

  return {
    capabilityId: "whatsapp.webhook.received",
    providerEventType: event.eventType,
    subject: subject(
      "whatsapp_webhook",
      entry?.id ?? event.externalEventId,
      change?.field,
    ),
    actor: null,
    data: {
      value,
      field: change?.field ?? null,
    },
  };
}

function adaptProviderEvent(
  event: IntegrationWebhookEvent,
): AdapterResult {
  switch (event.providerId) {
    case "generic-webhook":
      return adaptGenericWebhook(event);

    case "stripe":
      return adaptStripeWebhook(event);

    case "shopify":
      return adaptShopifyWebhook(event);

    case "whatsapp-business":
      return adaptWhatsAppWebhook(event);

    default:
      throw new IntegrationWebhookError(
        "The webhook provider does not have an external trigger adapter.",
        "EXTERNAL_TRIGGER_PROVIDER_UNSUPPORTED",
        422,
        true,
      );
  }
}

export function adaptIntegrationWebhookEvent(
  event: IntegrationWebhookEvent,
): ExternalTriggerEvent {
  if (event.signatureStatus === "invalid") {
    throw new IntegrationWebhookError(
      "An invalid webhook signature cannot become an external trigger.",
      "EXTERNAL_TRIGGER_SIGNATURE_INVALID",
      401,
      true,
    );
  }

  const adapted = adaptProviderEvent(event);

  return {
    schemaVersion: EXTERNAL_TRIGGER_SCHEMA_VERSION,
    id: event.id,
    externalEventId: event.externalEventId,
    dedupeKey: event.replayKey,
    capabilityId: adapted.capabilityId,
    providerEventType: adapted.providerEventType,
    workspaceId: event.userId,
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    source: {
      kind: "integration_webhook",
      providerId: event.providerId,
      integrationId: event.integrationId,
      endpointId: event.endpointId,
      requestId: event.requestId,
      signatureStatus: event.signatureStatus,
    },
    subject: adapted.subject,
    actor: adapted.actor,
    data: adapted.data,
    metadata: {
      payloadSha256: event.payloadSha256,
      adapterVersion: "day14h.v1",
    },
  };
}
