import {
  NextResponse,
} from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "@/lib/integrations/api";

import {
  getIntegrationConnectionById,
} from "@/lib/integrations/database";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type EndpointRow = {
  id: string;
  status: string;
  last_received_at: string | null;
};

type EventRow = {
  id: string;
  event_type: string;
  signature_status: string;
  processing_status: string;
  normalized_event: unknown;
  received_at: string;
  processed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
};

type LogRow = {
  status: string;
  metadata: unknown;
  created_at: string;
};

function record(value: unknown) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string"
    ? value
    : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : 0;
}

function maskSender(value: unknown) {
  const digits =
    stringValue(value)
      ?.replace(/\D/g, "") || "";

  if (!digits) {
    return null;
  }

  return `••••${digits.slice(-4)}`;
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { id } =
      await context.params;

    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        { status: 401 },
      );
    }

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (
      !connection ||
      connection.providerId !==
        "whatsapp-business"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "WhatsApp Business connection was not found.",
        },
        { status: 404 },
      );
    }

    const {
      data: endpointData,
      error: endpointError,
    } = await supabase
      .from("integration_webhook_endpoints")
      .select(
        "id,status,last_received_at",
      )
      .eq("integration_id", id)
      .eq("user_id", user.id)
      .limit(1);

    if (endpointError) {
      throw endpointError;
    }

    const endpoint =
      ((endpointData ?? []) as EndpointRow[])[0] ??
      null;

    if (!endpoint) {
      return NextResponse.json(
        {
          success: true,
          webhook: {
            configured: false,
            active: false,
            lastReceivedAt: null,
          },
          latestInbound: null,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const {
      data: eventData,
      error: eventError,
    } = await supabase
      .from("integration_webhook_events")
      .select(
        "id,event_type,signature_status,processing_status,normalized_event,received_at,processed_at,failure_code,failure_message",
      )
      .eq("integration_id", id)
      .eq("user_id", user.id)
      .order("received_at", {
        ascending: false,
      })
      .limit(25);

    if (eventError) {
      throw eventError;
    }

    const inboundEvent =
      ((eventData ?? []) as EventRow[])
        .find((event) => {
          const normalized =
            record(event.normalized_event);

          return normalized?.capabilityId ===
            "whatsapp.message.received";
        }) ?? null;

    let workflowDispatch = null;

    if (inboundEvent) {
      const {
        data: logData,
        error: logError,
      } = await supabase
        .from("integration_operation_logs")
        .select("status,metadata,created_at")
        .eq("integration_id", id)
        .eq("user_id", user.id)
        .eq("webhook_event_id", inboundEvent.id)
        .eq(
          "event_type",
          "integration.webhook.succeeded",
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(1);

      if (logError) {
        throw logError;
      }

      const log =
        ((logData ?? []) as LogRow[])[0] ??
        null;

      if (log) {
        const metadata =
          record(log.metadata) ?? {};

        workflowDispatch = {
          status: log.status,
          matched:
            numberValue(
              metadata.matchedAutomations,
            ),
          executed:
            numberValue(
              metadata.executedAutomations,
            ),
          failed:
            numberValue(
              metadata.failedAutomations,
            ),
          completedAt: log.created_at,
        };
      }
    }

    const normalized =
      record(inboundEvent?.normalized_event);
    const actor =
      record(normalized?.actor);
    const data =
      record(normalized?.data);
    const message =
      record(data?.message);

    return NextResponse.json(
      {
        success: true,
        webhook: {
          configured: true,
          active:
            endpoint.status === "active",
          lastReceivedAt:
            endpoint.last_received_at,
        },
        latestInbound: inboundEvent
          ? {
              eventId:
                inboundEvent.id,
              capabilityId:
                "whatsapp.message.received",
              providerEventType:
                inboundEvent.event_type,
              signatureStatus:
                inboundEvent.signature_status,
              processingStatus:
                inboundEvent.processing_status,
              receivedAt:
                inboundEvent.received_at,
              processedAt:
                inboundEvent.processed_at,
              sender:
                maskSender(actor?.id),
              messageType:
                stringValue(message?.type) ||
                "unknown",
              failureCode:
                inboundEvent.failure_code,
              failureMessage:
                inboundEvent.failure_message,
              workflowDispatch,
            }
          : null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not load WhatsApp inbound status.",
    );
  }
}
