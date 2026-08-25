import {
  randomUUID,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import type {
  IntegrationWebhookEndpoint,
  IntegrationWebhookEvent,
} from "@/types/integration-webhook";

import {
  dispatchIntegrationAutomationEvent,
} from "@/lib/integrations/automation-trigger-bridge";

import {
  getActiveProviderSubscriptionByEndpoint,
} from "@/lib/integrations/provider-subscriptions/database";

import {
  buildGoogleExternalTriggerEvent,
  GoogleProviderNotificationError,
  parseGoogleProviderNotification,
} from "@/lib/integrations/providers/google/notification-runtime";

import type {
  GoogleNotificationProviderId,
  GoogleProviderNotificationSubscription,
} from "@/lib/integrations/providers/google/notification-runtime";

import {
  beginIntegrationWebhookEventAttempt,
  getIntegrationWebhookEndpointByKey,
  markIntegrationWebhookEventAdapted,
  markIntegrationWebhookEventAdapterFailed,
  markIntegrationWebhookEventProcessed,
  recordIntegrationWebhookEvent,
} from "@/lib/integrations/webhooks/database";

import {
  createWebhookServiceClient,
} from "@/lib/integrations/webhooks/service-client";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params: Promise<{
    endpointKey: string;
  }>;
};

type WebhookServiceClient =
  ReturnType<
    typeof createWebhookServiceClient
  >;

const ENDPOINT_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  requestId: string,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store",
        "X-Content-Type-Options":
          "nosniff",
        "X-J10-Request-Id":
          requestId,
      },
    },
  );
}

function safeRequestId(
  request: Request,
): string {
  const supplied =
    request.headers
      .get(
        "x-j10-request-id",
      )
      ?.trim();

  if (
    supplied &&
    supplied.length <= 160 &&
    /^[A-Za-z0-9._:-]+$/.test(
      supplied,
    )
  ) {
    return supplied;
  }

  return randomUUID();
}

function safeError(
  error: unknown,
): {
  code: string;
  message: string;
  status: number;
} {
  if (
    error instanceof
    GoogleProviderNotificationError
  ) {
    return {
      code:
        error.code,
      message:
        error.expose
          ? error.message
          : "J10 could not accept this Google notification.",
      status:
        error.status,
    };
  }

  const possibleError =
    error as {
      code?: unknown;
      message?: unknown;
      status?: unknown;
    } | null;

  return {
    code:
      typeof possibleError?.code ===
      "string"
        ? possibleError.code
            .slice(
              0,
              120,
            )
        : "GOOGLE_NOTIFICATION_PROCESSING_FAILED",

    message:
      "J10 could not accept this Google notification.",

    status:
      typeof possibleError?.status ===
        "number" &&
      possibleError.status >= 400 &&
      possibleError.status <= 599
        ? possibleError.status
        : 500,
  };
}

function requireGoogleProvider(
  endpoint:
    IntegrationWebhookEndpoint,
): GoogleNotificationProviderId {
  if (
    endpoint.providerId ===
      "gmail" ||
    endpoint.providerId ===
      "google-calendar"
  ) {
    return endpoint.providerId;
  }

  throw new GoogleProviderNotificationError(
    "This endpoint does not accept Google provider notifications.",
    {
      code:
        "GOOGLE_NOTIFICATION_ENDPOINT_PROVIDER_INVALID",
      status:
        404,
      expose:
        true,
    },
  );
}

function normalizeSubscription(
  value:
    Awaited<
      ReturnType<
        typeof getActiveProviderSubscriptionByEndpoint
      >
    >,
): GoogleProviderNotificationSubscription {
  if (!value) {
    throw new GoogleProviderNotificationError(
      "No active Google provider subscription was found.",
      {
        code:
          "GOOGLE_PROVIDER_SUBSCRIPTION_NOT_FOUND",
        status:
          410,
        expose:
          true,
      },
    );
  }

  if (
    value.providerId !==
      "gmail" &&
    value.providerId !==
      "google-calendar"
  ) {
    throw new GoogleProviderNotificationError(
      "The active subscription is not a Google provider subscription.",
      {
        code:
          "GOOGLE_PROVIDER_SUBSCRIPTION_INVALID",
        status:
          409,
        expose:
          true,
      },
    );
  }

  if (
    value.kind !==
      "gmail.mailbox.watch" &&
    value.kind !==
      "google-calendar.events.watch"
  ) {
    throw new GoogleProviderNotificationError(
      "The active Google subscription kind is unsupported.",
      {
        code:
          "GOOGLE_PROVIDER_SUBSCRIPTION_KIND_INVALID",
        status:
          409,
        expose:
          true,
      },
    );
  }

  if (
    value.state !==
      "active"
  ) {
    throw new GoogleProviderNotificationError(
      "The Google provider subscription is not active.",
      {
        code:
          "GOOGLE_PROVIDER_SUBSCRIPTION_NOT_ACTIVE",
        status:
          410,
        expose:
          true,
      },
    );
  }

  return {
    id:
      value.id,

    providerId:
      value.providerId,

    kind:
      value.kind,

    state:
      "active",

    externalChannelId:
      value.externalChannelId,

    externalResourceId:
      value.externalResourceId,

    externalHistoryId:
      value.externalHistoryId,

    channelTokenSha256:
      value.channelTokenSha256,
  };
}

async function markSubscriptionActivity(args: {
  readonly supabase:
    WebhookServiceClient;

  readonly subscriptionId: string;
  readonly externalHistoryId:
    string | null;

  readonly receivedAt: string;
}) {
  const update:
    Record<string, unknown> = {
      last_notification_at:
        args.receivedAt,
      updated_at:
        args.receivedAt,
    };

  if (
    args.externalHistoryId
  ) {
    update.external_history_id =
      args.externalHistoryId;
  }

  const {
    error,
  } =
    await args.supabase
      .from(
        "integration_provider_subscriptions",
      )
      .update(
        update,
      )
      .eq(
        "id",
        args.subscriptionId,
      );

  if (error) {
    /*
    Notification activity metadata must not block an
    already durable and successfully processed receipt.
    */
    console.error(
      "J10 Google subscription activity update failed:",
      {
        code:
          error.code,
      },
    );
  }
}

async function persistFailure(args: {
  readonly supabase:
    WebhookServiceClient | null;

  readonly event:
    IntegrationWebhookEvent | null;

  readonly code: string;
  readonly message: string;
}) {
  if (
    !args.supabase ||
    !args.event
  ) {
    return;
  }

  try {
    await markIntegrationWebhookEventAdapterFailed(
      args.supabase,
      args.event,
      args.code,
      args.message,
      {
        retryable:
          false,
        nextRetryAt:
          null,
      },
    );
  }
  catch (persistenceError) {
    console.error(
      "J10 Google notification failure persistence error:",
      persistenceError,
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const requestId =
    safeRequestId(
      request,
    );

  let supabase:
    WebhookServiceClient | null =
      null;

  let processingEvent:
    IntegrationWebhookEvent | null =
      null;

  try {
    const {
      endpointKey,
    } =
      await context.params;

    if (
      !ENDPOINT_KEY_PATTERN.test(
        endpointKey,
      )
    ) {
      throw new GoogleProviderNotificationError(
        "Google notification endpoint was not found.",
        {
          code:
            "GOOGLE_NOTIFICATION_ENDPOINT_NOT_FOUND",
          status:
            404,
          expose:
            true,
        },
      );
    }

    supabase =
      createWebhookServiceClient();

    const endpoint =
      await getIntegrationWebhookEndpointByKey(
        supabase,
        endpointKey,
      );

    if (!endpoint) {
      throw new GoogleProviderNotificationError(
        "Google notification endpoint was not found.",
        {
          code:
            "GOOGLE_NOTIFICATION_ENDPOINT_NOT_FOUND",
          status:
            404,
          expose:
            true,
        },
      );
    }

    if (
      endpoint.status !==
        "active"
    ) {
      throw new GoogleProviderNotificationError(
        "Google notification endpoint is disabled.",
        {
          code:
            "GOOGLE_NOTIFICATION_ENDPOINT_DISABLED",
          status:
            410,
          expose:
            true,
        },
      );
    }

    const providerId =
      requireGoogleProvider(
        endpoint,
      );

    const storedSubscription =
      await getActiveProviderSubscriptionByEndpoint(
        supabase,
        endpoint.id,
        providerId,
      );

    const subscription =
      normalizeSubscription(
        storedSubscription,
      );

    if (
      subscription.providerId !==
        providerId
    ) {
      throw new GoogleProviderNotificationError(
        "The Google notification provider does not match the active subscription.",
        {
          code:
            "GOOGLE_NOTIFICATION_PROVIDER_MISMATCH",
          status:
            409,
          expose:
            true,
        },
      );
    }

    const rawBody =
      await request.text();

    const payloadBytes =
      Buffer.byteLength(
        rawBody,
        "utf8",
      );

    if (
      payloadBytes >
      endpoint.maxPayloadBytes
    ) {
      throw new GoogleProviderNotificationError(
        "Google notification payload is too large.",
        {
          code:
            "GOOGLE_NOTIFICATION_PAYLOAD_TOO_LARGE",
          status:
            413,
          expose:
            true,
        },
      );
    }

    const receivedAt =
      new Date().toISOString();

    const receipt =
      parseGoogleProviderNotification({
        providerId,
        rawBody,
        headers:
          request.headers,
        subscription,
        receivedAt,
      });

    const persistedReceipt =
      await recordIntegrationWebhookEvent(
        supabase,
        {
          endpoint,
          requestId,
          eventType:
            receipt.eventType,
          externalEventId:
            receipt.externalEventId,
          replayKey:
            receipt.replayKey,
          signatureStatus:
            receipt.signatureStatus,
          payloadSha256:
            receipt.payloadSha256,
          payload: {
            ...receipt.payload,
          },
          headers: {
            ...receipt.headers,
          },
          occurredAt:
            receipt.occurredAt,
        },
      );

    processingEvent =
      persistedReceipt.event;

    if (
      persistedReceipt.duplicate
    ) {
      return jsonResponse(
        {
          success: true,
          accepted: true,
          duplicate: true,
          requestId,
          eventId:
            persistedReceipt.event.id,
          processingStatus:
            persistedReceipt.event
              .processingStatus,
        },
        200,
        requestId,
      );
    }

    processingEvent =
      await beginIntegrationWebhookEventAttempt(
        supabase,
        processingEvent,
      );

    const normalizedEvent =
      buildGoogleExternalTriggerEvent({
        endpoint,
        event:
          processingEvent,
        receipt,
      });

    processingEvent =
      await markIntegrationWebhookEventAdapted(
        supabase,
        processingEvent,
        normalizedEvent,
      );

    if (!receipt.dispatch) {
      processingEvent =
        await markIntegrationWebhookEventProcessed(
          supabase,
          processingEvent,
        );

      await markSubscriptionActivity({
        supabase,
        subscriptionId:
          subscription.id,
        externalHistoryId:
          receipt.externalHistoryId,
        receivedAt,
      });

      return jsonResponse(
        {
          success: true,
          accepted: true,
          duplicate: false,
          dispatched: false,
          reason:
            "google_calendar_channel_synchronized",
          requestId,
          eventId:
            processingEvent.id,
          processingStatus:
            processingEvent.processingStatus,
        },
        200,
        requestId,
      );
    }

    const dispatch =
      await dispatchIntegrationAutomationEvent({
        supabase,
        event:
          normalizedEvent,
        origin:
          new URL(
            request.url,
          ).origin,
      });

    await markSubscriptionActivity({
      supabase,
      subscriptionId:
        subscription.id,
      externalHistoryId:
        receipt.externalHistoryId,
      receivedAt,
    });

    /*
    The receipt is already durable. A workflow dispatch
    failure is accepted so Google does not create an
    uncontrolled delivery storm. Internal retry policy
    owns subsequent processing.
    */
    return jsonResponse(
      {
        success: true,
        accepted: true,
        duplicate: false,
        dispatched:
          dispatch.success,
        requestId,
        eventId:
          normalizedEvent.id,
        matched:
          dispatch.matched,
        executed:
          dispatch.executed,
        failed:
          dispatch.failed,
        skipped:
          dispatch.skipped,
        status:
          dispatch.success
            ? "processed"
            : "dispatch_deferred",
      },
      dispatch.success
        ? 200
        : 202,
      requestId,
    );
  }
  catch (error) {
    const normalized =
      safeError(
        error,
      );

    await persistFailure({
      supabase,
      event:
        processingEvent,
      code:
        normalized.code,
      message:
        normalized.message,
    });

    return jsonResponse(
      {
        success: false,
        accepted: false,
        error:
          normalized.message,
        code:
          normalized.code,
        requestId,
      },
      normalized.status,
      requestId,
    );
  }
}