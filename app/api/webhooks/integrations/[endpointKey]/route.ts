import {
  randomUUID,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import type {
  IntegrationLogSeverity,
  IntegrationLogStatus,
} from "../../../../../types/integration-observability";

import type {
  IntegrationWebhookEndpoint,
  IntegrationWebhookEvent,
} from "../../../../../types/integration-webhook";

import {
  adaptIntegrationWebhookEvent,
} from "../../../../../lib/integrations/external-trigger-adapter";

import {
  dispatchIntegrationAutomationEvent,
} from "../../../../../lib/integrations/automation-trigger-bridge";

import {
  summarizeIntegrationAutomationDispatchFailure,
} from "../../../../../lib/integrations/automation-dispatch-summary";

import {
  getIntegrationCredentials,
} from "../../../../../lib/integrations/credentials";

import {
  writeIntegrationOperationLog,
} from "../../../../../lib/integrations/observability";

import {
  evaluateIntegrationRetry,
} from "../../../../../lib/integrations/retry-policy";

import {
  buildWebhookReplayKey,
  sha256Hex,
} from "../../../../../lib/integrations/webhooks/crypto";

import {
  beginIntegrationWebhookEventAttempt,
  getIntegrationWebhookEndpointByKey,
  markIntegrationWebhookEventAdapted,
  markIntegrationWebhookEventAdapterFailed,
  markIntegrationWebhookEventProcessed,
  recordIntegrationWebhookEvent,
} from "../../../../../lib/integrations/webhooks/database";

import {
  IntegrationWebhookError,
  normalizeWebhookError,
} from "../../../../../lib/integrations/webhooks/errors";

import {
  createWebhookServiceClient,
} from "../../../../../lib/integrations/webhooks/service-client";

import {
  sanitizeWebhookHeaders,
  verifyWebhookDelivery,
  verifyWhatsAppChallenge,
} from "../../../../../lib/integrations/webhooks/verification";

type RouteContext = {
  params: Promise<{
    endpointKey: string;
  }>;
};

type WebhookServiceClient =
  ReturnType<
    typeof createWebhookServiceClient
  >;

type WebhookLogInput = {
  eventType: string;
  severity: IntegrationLogSeverity;
  status: IntegrationLogStatus;
  message: string;
  errorCode?: string | null;
  retryable?: boolean;
  nextRetryAt?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
};

const ENDPOINT_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function webhookResponse(
  body: Record<string, unknown>,
  status: number,
  requestId?: string,
) {
  const response =
    NextResponse.json(
      body,
      {
        status,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );

  if (requestId) {
    response.headers.set(
      "X-J10-Request-Id",
      requestId,
    );
  }

  return response;
}

function errorResponse(
  error: unknown,
  requestId?: string,
) {
  const normalized =
    normalizeWebhookError(
      error,
    );

  return webhookResponse(
    {
      success: false,
      error:
        normalized.expose
          ? normalized.message
          : "J10 NEXUS could not accept this webhook delivery.",
      code:
        normalized.code,
      requestId:
        requestId ?? null,
    },
    normalized.status,
    requestId,
  );
}

function parseWebhookPayload(
  rawBody: string,
  contentType: string,
) {
  if (!rawBody.trim()) {
    throw new IntegrationWebhookError(
      "Webhook payload is empty.",
      "WEBHOOK_PAYLOAD_EMPTY",
      400,
      true,
    );
  }

  const expectsJson =
    contentType.includes(
      "application/json",
    ) ||
    contentType.includes(
      "+json",
    );

  if (!expectsJson) {
    return {
      raw: rawBody,
    };
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(
        rawBody,
      ) as unknown;
  } catch {
    throw new IntegrationWebhookError(
      "Webhook payload contains invalid JSON.",
      "WEBHOOK_PAYLOAD_JSON_INVALID",
      400,
      true,
    );
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    return parsed as
      Record<string, unknown>;
  }

  return {
    value:
      parsed ?? null,
  };
}

async function loadActiveEndpoint(
  endpointKey: string,
) {
  if (
    !ENDPOINT_KEY_PATTERN.test(
      endpointKey,
    )
  ) {
    throw new IntegrationWebhookError(
      "Webhook endpoint was not found.",
      "WEBHOOK_ENDPOINT_NOT_FOUND",
      404,
      true,
    );
  }

  const supabase =
    createWebhookServiceClient();

  const endpoint =
    await getIntegrationWebhookEndpointByKey(
      supabase,
      endpointKey,
    );

  if (!endpoint) {
    throw new IntegrationWebhookError(
      "Webhook endpoint was not found.",
      "WEBHOOK_ENDPOINT_NOT_FOUND",
      404,
      true,
    );
  }

  if (
    endpoint.status !== "active"
  ) {
    throw new IntegrationWebhookError(
      "Webhook endpoint is disabled.",
      "WEBHOOK_ENDPOINT_DISABLED",
      410,
      true,
    );
  }

  return {
    supabase,
    endpoint,
  };
}

async function loadCredentialValues(
  supabase: WebhookServiceClient,
  userId: string,
  integrationId: string,
) {
  const envelope =
    await getIntegrationCredentials(
      supabase,
      userId,
      integrationId,
    );

  return envelope?.values ?? {};
}

async function writeWebhookLog(
  supabase: WebhookServiceClient,
  endpoint: IntegrationWebhookEndpoint,
  event: IntegrationWebhookEvent | null,
  requestId: string,
  input: WebhookLogInput,
) {
  await writeIntegrationOperationLog(
    supabase,
    {
      userId:
        endpoint.userId,
      integrationId:
        endpoint.integrationId,
      providerId:
        endpoint.providerId,
      source:
        "webhook",
      eventType:
        input.eventType,
      severity:
        input.severity,
      status:
        input.status,
      correlationId:
        requestId,
      webhookEventId:
        event?.id ?? null,
      attempt:
        event?.attemptCount ?? 0,
      maxAttempts:
        event?.maxAttempts ?? 1,
      retryable:
        input.retryable ??
        event?.retryable ??
        false,
      nextRetryAt:
        input.nextRetryAt ??
        event?.nextRetryAt ??
        null,
      errorCode:
        input.errorCode ?? null,
      message:
        input.message,
      metadata:
        input.metadata ?? {},
    },
  );
}

async function recordProcessingFailure(args: {
  supabase: WebhookServiceClient;
  endpoint: IntegrationWebhookEndpoint;
  event: IntegrationWebhookEvent;
  requestId: string;
  error: unknown;
  fallbackMessage: string;
  fallbackCode: string;
  persistenceMessage?: string;
}) {
  const normalizedError =
    args.error instanceof
    IntegrationWebhookError
      ? args.error
      : new IntegrationWebhookError(
          args.fallbackMessage,
          args.fallbackCode,
          500,
          true,
        );

  const retry =
    evaluateIntegrationRetry({
      domain:
        "webhook",
      attemptCount:
        args.event.attemptCount,
      maxAttempts:
        args.event.maxAttempts,
      errorCode:
        normalizedError.code,
      responseStatus:
        normalizedError.status,
    });

  let failedEvent =
    args.event;

  try {
    failedEvent =
      await markIntegrationWebhookEventAdapterFailed(
        args.supabase,
        args.event,
        normalizedError.code,
        args.persistenceMessage ??
          normalizedError.message,
        {
          retryable:
            retry.retryable,
          nextRetryAt:
            retry.nextRetryAt,
        },
      );
  } catch (persistenceError) {
    console.error(
      "J10 webhook failure persistence error:",
      persistenceError,
    );
  }

  await writeWebhookLog(
    args.supabase,
    args.endpoint,
    failedEvent,
    args.requestId,
    {
      eventType:
        retry.retryable
          ? "integration.webhook.retry_scheduled"
          : "integration.webhook.failed",
      severity:
        retry.retryable
          ? "warning"
          : "error",
      status:
        retry.retryable
          ? "retry_scheduled"
          : retry.exhausted
            ? "exhausted"
            : "failed",
      errorCode:
        normalizedError.code,
      retryable:
        retry.retryable,
      nextRetryAt:
        retry.nextRetryAt,
      message:
        args.persistenceMessage ??
        normalizedError.message,
      metadata: {
        providerEventType:
          args.event.eventType,
        retryReasonCode:
          retry.reasonCode,
      },
    },
  );

  return normalizedError;
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const requestId =
    randomUUID();

  try {
    const {
      endpointKey,
    } =
      await context.params;

    const {
      supabase,
      endpoint,
    } =
      await loadActiveEndpoint(
        endpointKey,
      );

    if (
      endpoint.providerId !==
        "whatsapp-business"
    ) {
      throw new IntegrationWebhookError(
        "This webhook endpoint does not support GET verification.",
        "WEBHOOK_METHOD_NOT_ALLOWED",
        405,
        true,
      );
    }

    const credentials =
      await loadCredentialValues(
        supabase,
        endpoint.userId,
        endpoint.integrationId,
      );

    const url =
      new URL(request.url);

    const challenge =
      verifyWhatsAppChallenge({
        mode:
          url.searchParams.get(
            "hub.mode",
          ),
        token:
          url.searchParams.get(
            "hub.verify_token",
          ),
        challenge:
          url.searchParams.get(
            "hub.challenge",
          ),
        credentials,
      });

    return new Response(
      challenge,
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store",
          "Content-Type":
            "text/plain; charset=utf-8",
          "X-J10-Request-Id":
            requestId,
        },
      },
    );
  } catch (error) {
    return errorResponse(
      error,
      requestId,
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const requestId =
    randomUUID();

  let loggingSupabase:
    WebhookServiceClient |
    null = null;

  let loggingEndpoint:
    IntegrationWebhookEndpoint |
    null = null;

  let loggingEvent:
    IntegrationWebhookEvent |
    null = null;

  let failureLogged =
    false;

  try {
    const {
      endpointKey,
    } =
      await context.params;

    const {
      supabase,
      endpoint,
    } =
      await loadActiveEndpoint(
        endpointKey,
      );

    loggingSupabase =
      supabase;

    loggingEndpoint =
      endpoint;

    const contentLengthHeader =
      request.headers.get(
        "content-length",
      );

    const contentLength =
      contentLengthHeader
        ? Number(
            contentLengthHeader,
          )
        : null;

    if (
      contentLength !== null &&
      Number.isFinite(
        contentLength,
      ) &&
      contentLength >
        endpoint.maxPayloadBytes
    ) {
      throw new IntegrationWebhookError(
        "Webhook payload exceeds the configured size limit.",
        "WEBHOOK_PAYLOAD_TOO_LARGE",
        413,
        true,
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
      throw new IntegrationWebhookError(
        "Webhook payload exceeds the configured size limit.",
        "WEBHOOK_PAYLOAD_TOO_LARGE",
        413,
        true,
      );
    }

    const payload =
      parseWebhookPayload(
        rawBody,
        request.headers
          .get("content-type")
          ?.toLowerCase() ||
          "",
      );

    const credentials =
      await loadCredentialValues(
        supabase,
        endpoint.userId,
        endpoint.integrationId,
      );

    const verification =
      verifyWebhookDelivery({
        providerId:
          endpoint.providerId,
        environment:
          endpoint.environment,
        headers:
          request.headers,
        rawBody,
        payload,
        credentials,
      });

    const payloadSha256 =
      sha256Hex(
        rawBody,
      );

    const timestampIdentity =
      request.headers.get(
        "x-j10-timestamp",
      ) ||
      request.headers
        .get(
          "stripe-signature",
        )
        ?.match(
          /(?:^|,)t=(\d+)/,
        )?.[1] ||
      request.headers.get(
        "x-shopify-triggered-at",
      ) ||
      verification.occurredAt;

    const replayKey =
      buildWebhookReplayKey({
        providerId:
          endpoint.providerId,
        eventType:
          verification.eventType,
        externalEventId:
          verification.externalEventId,
        payloadSha256,
        timestampIdentity,
      });

    const receipt =
      await recordIntegrationWebhookEvent(
        supabase,
        {
          endpoint,
          requestId,
          eventType:
            verification.eventType,
          externalEventId:
            verification.externalEventId,
          replayKey,
          signatureStatus:
            verification.signatureStatus,
          payloadSha256,
          payload,
          headers:
            sanitizeWebhookHeaders(
              request.headers,
            ),
          occurredAt:
            verification.occurredAt,
        },
      );

    let storedEvent =
      receipt.event;

    loggingEvent =
      storedEvent;

    await writeWebhookLog(
      supabase,
      endpoint,
      storedEvent,
      requestId,
      {
        eventType:
          receipt.duplicate
            ? "integration.webhook.duplicate"
            : "integration.webhook.received",
        severity:
          "info",
        status:
          receipt.duplicate
            ? "duplicate"
            : "received",
        message:
          receipt.duplicate
            ? "A replay-safe duplicate webhook receipt was detected."
            : "A webhook delivery was accepted and stored.",
        metadata: {
          providerEventType:
            storedEvent.eventType,
          signatureStatus:
            storedEvent.signatureStatus,
        },
      },
    );

    if (
      receipt.duplicate &&
      storedEvent.processingStatus ===
        "pending_adapter" &&
      storedEvent.attemptCount > 0
    ) {
      return webhookResponse(
        {
          success: true,
          accepted: true,
          duplicate: true,
          eventId:
            storedEvent.id,
          requestId,
          status:
            "processing",
          adaptationStatus:
            storedEvent.processingStatus,
          processingStatus:
            storedEvent.processingStatus,
        },
        200,
        requestId,
      );
    }

    let normalizedEvent =
      storedEvent.normalizedEvent;

    let adaptedDuringRequest =
      false;

    let recoveredAdapterFailure =
      false;

    const shouldAdapt =
      !normalizedEvent &&
      (
        storedEvent.processingStatus ===
          "pending_adapter" ||
        storedEvent.processingStatus ===
          "failed"
      );

    if (shouldAdapt) {
      recoveredAdapterFailure =
        receipt.duplicate &&
        storedEvent.processingStatus ===
          "failed";

      storedEvent =
        await beginIntegrationWebhookEventAttempt(
          supabase,
          storedEvent,
        );

      loggingEvent =
        storedEvent;

      await writeWebhookLog(
        supabase,
        endpoint,
        storedEvent,
        requestId,
        {
          eventType:
            recoveredAdapterFailure
              ? "integration.webhook.retrying"
              : "integration.webhook.started",
          severity:
            "info",
          status:
            recoveredAdapterFailure
              ? "retrying"
              : "started",
          message:
            recoveredAdapterFailure
              ? "A bounded webhook processing retry started."
              : "Webhook processing started.",
          metadata: {
            providerEventType:
              storedEvent.eventType,
          },
        },
      );

      try {
        normalizedEvent =
          adaptIntegrationWebhookEvent(
            storedEvent,
          );

        storedEvent =
          await markIntegrationWebhookEventAdapted(
            supabase,
            storedEvent,
            normalizedEvent,
          );

        loggingEvent =
          storedEvent;

        adaptedDuringRequest =
          true;
      } catch (error) {
        failureLogged =
          true;

        throw await recordProcessingFailure({
          supabase,
          endpoint,
          event:
            storedEvent,
          requestId,
          error,
          fallbackMessage:
            "J10 could not normalize the external trigger.",
          fallbackCode:
            "EXTERNAL_TRIGGER_ADAPTER_FAILED",
        });
      }
    }

    if (!normalizedEvent) {
      const stateError =
        new IntegrationWebhookError(
          "The webhook receipt does not contain an adapted external trigger.",
          "EXTERNAL_TRIGGER_ADAPTER_STATE_INVALID",
          500,
          true,
        );

      failureLogged =
        true;

      throw await recordProcessingFailure({
        supabase,
        endpoint,
        event:
          storedEvent,
        requestId,
        error:
          stateError,
        fallbackMessage:
          stateError.message,
        fallbackCode:
          stateError.code,
      });
    }

    let automationDispatch:
      Awaited<
        ReturnType<
          typeof dispatchIntegrationAutomationEvent
        >
      >;

    let dispatchFailureMessage:
      | string
      | undefined;

    try {
      automationDispatch =
        await dispatchIntegrationAutomationEvent({
          supabase,
          event:
            normalizedEvent,
          origin:
            new URL(
              request.url,
            ).origin,
        });

      if (
        !automationDispatch.success
      ) {
        dispatchFailureMessage =
          summarizeIntegrationAutomationDispatchFailure(
            automationDispatch,
          );

        throw new IntegrationWebhookError(
          "J10 accepted the webhook but could not dispatch every matched automation.",
          "INTEGRATION_AUTOMATION_DISPATCH_FAILED",
          503,
          true,
        );
      }
    } catch (error) {
      failureLogged =
        true;

      throw await recordProcessingFailure({
        supabase,
        endpoint,
        event:
          storedEvent,
        requestId,
        error,
        fallbackMessage:
          "J10 could not dispatch the adapted webhook event.",
        fallbackCode:
          "INTEGRATION_AUTOMATION_DISPATCH_FAILED",
        persistenceMessage:
          dispatchFailureMessage,
      });
    }

    storedEvent =
      await markIntegrationWebhookEventProcessed(
        supabase,
        storedEvent,
      );

    loggingEvent =
      storedEvent;

    await writeWebhookLog(
      supabase,
      endpoint,
      storedEvent,
      requestId,
      {
        eventType:
          "integration.webhook.succeeded",
        severity:
          "info",
        status:
          "succeeded",
        retryable:
          false,
        nextRetryAt:
          null,
        message:
          "Webhook processing and automation dispatch completed successfully.",
        metadata: {
          providerEventType:
            storedEvent.eventType,
          capabilityId:
            normalizedEvent.capabilityId,
          matchedAutomations:
            automationDispatch.matched,
          executedAutomations:
            automationDispatch.executed,
          failedAutomations:
            automationDispatch.failed,
        },
      },
    );

    return webhookResponse(
      {
        success: true,
        accepted: true,
        duplicate:
          receipt.duplicate,
        eventId:
          receipt.event.id,
        requestId,
        capabilityId:
          normalizedEvent.capabilityId,
        schemaVersion:
          normalizedEvent.schemaVersion,
        recoveredAdapterFailure,
        adaptedDuringRequest,
        status:
          receipt.duplicate &&
          automationDispatch.executed === 0
            ? "duplicate"
            : "processed",
        adaptationStatus:
          "adapted",
        processingStatus:
          storedEvent.processingStatus,
        automationDispatch: {
          eventId:
            automationDispatch.eventId,
          depth:
            automationDispatch.depth,
          matched:
            automationDispatch.matched,
          filtered:
            automationDispatch.filtered,
          deduplicated:
            automationDispatch.deduplicated,
          executed:
            automationDispatch.executed,
          completed:
            automationDispatch.completed,
          awaitingApproval:
            automationDispatch.awaitingApproval,
          failed:
            automationDispatch.failed,
          skipped:
            automationDispatch.skipped,
          results:
            automationDispatch.results,
        },
      },
      receipt.duplicate
        ? 200
        : 202,
      requestId,
    );
  } catch (error) {
    if (
      !failureLogged &&
      loggingSupabase &&
      loggingEndpoint
    ) {
      const normalized =
        normalizeWebhookError(
          error,
        );

      await writeWebhookLog(
        loggingSupabase,
        loggingEndpoint,
        loggingEvent,
        requestId,
        {
          eventType:
            "integration.webhook.failed",
          severity:
            "error",
          status:
            "failed",
          errorCode:
            normalized.code,
          message:
            normalized.message,
          metadata: {
            responseStatus:
              normalized.status,
          },
        },
      );
    }

    return errorResponse(
      error,
      requestId,
    );
  }
}
