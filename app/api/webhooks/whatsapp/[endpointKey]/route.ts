import { NextRequest, NextResponse } from "next/server";

import type {
  WhatsAppWebhookEvent,
  WhatsAppWebhookMessage,
  WhatsAppWebhookStatus,
} from "@/types/integration-whatsapp";

type RouteContext = {
  params: Promise<{
    endpointKey: string;
  }>;
};

function isRecordValue(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function getString(
  value: unknown
): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function normalizeWhatsAppWebhookPayload(
  payload: unknown
): WhatsAppWebhookEvent {
  const messages: WhatsAppWebhookMessage[] = [];
  const statuses: WhatsAppWebhookStatus[] = [];

  if (!isRecordValue(payload)) {
    return {
      object: null,
      messages,
      statuses,
      raw: payload,
    };
  }

  const entries =
    Array.isArray(payload.entry)
      ? payload.entry
      : [];

  for (const entry of entries) {
    if (!isRecordValue(entry)) {
      continue;
    }

    const changes =
      Array.isArray(entry.changes)
        ? entry.changes
        : [];

    for (const change of changes) {
      if (!isRecordValue(change)) {
        continue;
      }

      const value =
        isRecordValue(change.value)
          ? change.value
          : {};

      const metadata =
        isRecordValue(value.metadata)
          ? value.metadata
          : {};

      const phoneNumberId =
        getString(metadata.phone_number_id);

      const displayPhoneNumber =
        getString(metadata.display_phone_number);

      const contacts =
        Array.isArray(value.contacts)
          ? value.contacts
          : [];

      const firstContact =
        isRecordValue(contacts[0])
          ? contacts[0]
          : null;

      const profile =
        firstContact &&
        isRecordValue(firstContact.profile)
          ? firstContact.profile
          : null;

      const contactWaId =
        firstContact
          ? getString(firstContact.wa_id)
          : null;

      const contactName =
        profile
          ? getString(profile.name)
          : null;

      const rawMessages =
        Array.isArray(value.messages)
          ? value.messages
          : [];

      for (const rawMessage of rawMessages) {
        if (!isRecordValue(rawMessage)) {
          continue;
        }

        const text =
          isRecordValue(rawMessage.text)
            ? getString(rawMessage.text.body)
            : null;

        messages.push({
          id: getString(rawMessage.id),
          from: getString(rawMessage.from) || contactWaId,
          timestamp: getString(rawMessage.timestamp),
          type: getString(rawMessage.type),
          text,
          contactName,
          phoneNumberId,
          displayPhoneNumber,
          raw: rawMessage,
        });
      }

      const rawStatuses =
        Array.isArray(value.statuses)
          ? value.statuses
          : [];

      for (const rawStatus of rawStatuses) {
        if (!isRecordValue(rawStatus)) {
          continue;
        }

        statuses.push({
          id: getString(rawStatus.id),
          recipientId: getString(rawStatus.recipient_id),
          status: getString(rawStatus.status),
          timestamp: getString(rawStatus.timestamp),
          phoneNumberId,
          displayPhoneNumber,
          raw: rawStatus,
        });
      }
    }
  }

  return {
    object: getString(payload.object),
    messages,
    statuses,
    raw: payload,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { endpointKey } =
    await context.params;

  const expectedEndpointKey =
    process.env.META_WHATSAPP_WEBHOOK_ENDPOINT_KEY ||
    "meta";

  const verifyToken =
    process.env.META_WHATSAPP_VERIFY_TOKEN ||
    "";

  if (endpointKey !== expectedEndpointKey) {
    return NextResponse.json(
      {
        success: false,
        error: "Unknown WhatsApp webhook endpoint.",
      },
      {
        status: 404,
      }
    );
  }

  const mode =
    request.nextUrl.searchParams.get("hub.mode");

  const token =
    request.nextUrl.searchParams.get("hub.verify_token");

  const challenge =
    request.nextUrl.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === verifyToken &&
    challenge
  ) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return NextResponse.json(
    {
      success: false,
      error: "WhatsApp webhook verification failed.",
    },
    {
      status: 403,
    }
  );
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { endpointKey } =
    await context.params;

  const expectedEndpointKey =
    process.env.META_WHATSAPP_WEBHOOK_ENDPOINT_KEY ||
    "meta";

  if (endpointKey !== expectedEndpointKey) {
    return NextResponse.json(
      {
        success: false,
        error: "Unknown WhatsApp webhook endpoint.",
      },
      {
        status: 404,
      }
    );
  }

  const payload =
    await request.json();

  const event =
    normalizeWhatsAppWebhookPayload(payload);

  console.log(
    "WhatsApp webhook received:",
    JSON.stringify({
      messageCount:
        event.messages.length,
      statusCount:
        event.statuses.length,
      messageTypes:
        event.messages.map(
          (message) => message.type
        ),
    })
  );

  return NextResponse.json({
    success: true,
    received: true,
    messages: event.messages,
    statuses: event.statuses,
  });
}
