import {
  NextResponse,
} from "next/server";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  GmailSubscriptionOptions,
  GoogleCalendarSubscriptionOptions,
  IntegrationProviderSubscriptionKind,
  IntegrationProviderSubscriptionMode,
} from "@/types/integration-provider-subscription";

import type {
  IntegrationRuntimeCredentialReader,
} from "@/types/integration-runtime";

import {
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
  writeIntegrationActivity,
} from "@/lib/integrations/api";

import {
  getIntegrationCredentials,
} from "@/lib/integrations/credentials";

import {
  getIntegrationConnectionById,
} from "@/lib/integrations/database";

import {
  createProviderSubscriptionRecord,
  getActiveProviderSubscription,
  getProviderSubscriptionById,
  listProviderSubscriptions,
  markProviderSubscriptionStopped,
  ProviderSubscriptionDatabaseError,
} from "@/lib/integrations/provider-subscriptions/database";

import {
  requireProviderSubscriptionAdapter,
} from "@/lib/integrations/provider-subscriptions/runtime-registry";

import {
  createOrEnableIntegrationWebhookEndpoint,
} from "@/lib/integrations/webhooks/database";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

class ProviderSubscriptionApiError
  extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    message: string,
    code: string,
    status = 400,
  ) {
    super(message);

    this.name =
      "ProviderSubscriptionApiError";

    this.code =
      code;

    this.status =
      status;
  }
}

function subscriptionErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
    ProviderSubscriptionApiError
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          error.message,

        code:
          error.code,
      },
      {
        status:
          error.status,
      },
    );
  }

  if (
    error instanceof
    IntegrationRuntimeError
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          error.status >= 500
            ? "J10 could not complete the provider subscription request."
            : error.message,

        code:
          error.code,

        retryable:
          error.retryable,

        retryAfterSeconds:
          error.retryAfterSeconds,
      },
      {
        status:
          error.status,
      },
    );
  }

  if (
    error instanceof
    ProviderSubscriptionDatabaseError
  ) {
    const status =
      error.code ===
        "INTEGRATION_PROVIDER_SUBSCRIPTION_ALREADY_ACTIVE"
        ? 409
        : error.code ===
            "INTEGRATION_PROVIDER_SUBSCRIPTION_SIMULATION_NOT_PERSISTED"
          ? 400
          : 500;

    if (
      status ===
        500
    ) {
      console.error(
        "J10 provider subscription database error:",
        error,
      );
    }

    return NextResponse.json(
      {
        success:
          false,

        error:
          status ===
            500
            ? "J10 could not persist the provider subscription."
            : error.message,

        code:
          error.code,
      },
      {
        status,
      },
    );
  }

  return integrationApiErrorResponse(
    error,
    "J10 could not manage the provider subscription.",
  );
}

function parseMode(
  value: unknown,
): IntegrationProviderSubscriptionMode {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return "simulate";
  }

  if (
    value !==
      "simulate" &&
    value !==
      "live"
  ) {
    throw new ProviderSubscriptionApiError(
      "Subscription mode must be simulate or live.",
      "INTEGRATION_PROVIDER_SUBSCRIPTION_MODE_INVALID",
    );
  }

  return value;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return undefined;
  }

  if (
    typeof value !==
      "string"
  ) {
    throw new ProviderSubscriptionApiError(
      `${field} must be a string.`,
      "INTEGRATION_PROVIDER_SUBSCRIPTION_INPUT_INVALID",
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw new ProviderSubscriptionApiError(
      `${field} is invalid.`,
      "INTEGRATION_PROVIDER_SUBSCRIPTION_INPUT_INVALID",
    );
  }

  return normalized;
}

function parseLabelIds(
  value: unknown,
): readonly string[] | undefined {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return undefined;
  }

  if (
    !Array.isArray(
      value,
    ) ||
    value.some(
      (entry) =>
        typeof entry !==
          "string",
    )
  ) {
    throw new ProviderSubscriptionApiError(
      "labelIds must be an array of strings.",
      "INTEGRATION_PROVIDER_SUBSCRIPTION_LABELS_INVALID",
    );
  }

  return value.map(
    (entry) =>
      (
        entry as string
      ).trim(),
  );
}

function parseGmailOptions(
  value: unknown,
): GmailSubscriptionOptions {
  const options =
    value ===
      undefined
      ? {}
      : parseRequestObject(
          value,
        );

  const labelFilterBehavior =
    options.labelFilterBehavior;

  if (
    labelFilterBehavior !==
      undefined &&
    labelFilterBehavior !==
      "include" &&
    labelFilterBehavior !==
      "exclude"
  ) {
    throw new ProviderSubscriptionApiError(
      "labelFilterBehavior must be include or exclude.",
      "INTEGRATION_PROVIDER_SUBSCRIPTION_LABEL_FILTER_INVALID",
    );
  }

  return {
    topicName:
      optionalString(
        options.topicName,
        "topicName",
        1_024,
      ),

    labelIds:
      parseLabelIds(
        options.labelIds,
      ),

    labelFilterBehavior:
      labelFilterBehavior as
        "include" |
        "exclude" |
        undefined,
  };
}

function parseCalendarOptions(
  value: unknown,
): GoogleCalendarSubscriptionOptions {
  const options =
    value ===
      undefined
      ? {}
      : parseRequestObject(
          value,
        );

  const ttlValue =
    options.ttlSeconds;

  if (
    ttlValue !==
      undefined &&
    (
      typeof ttlValue !==
        "number" ||
      !Number.isInteger(
        ttlValue,
      )
    )
  ) {
    throw new ProviderSubscriptionApiError(
      "ttlSeconds must be a whole number.",
      "INTEGRATION_PROVIDER_SUBSCRIPTION_TTL_INVALID",
    );
  }

  return {
    calendarId:
      optionalString(
        options.calendarId,
        "calendarId",
        1_024,
      ),

    ttlSeconds:
      ttlValue as
        number |
        undefined,
  };
}

function subscriptionKind(
  providerId:
    string,
): IntegrationProviderSubscriptionKind {
  if (
    providerId ===
      "gmail"
  ) {
    return "gmail.mailbox.watch";
  }

  if (
    providerId ===
      "google-calendar"
  ) {
    return "google-calendar.events.watch";
  }

  throw new ProviderSubscriptionApiError(
    "Provider subscriptions are currently available for Gmail and Google Calendar.",
    "INTEGRATION_PROVIDER_SUBSCRIPTION_PROVIDER_UNSUPPORTED",
    400,
  );
}

async function createCredentialReader(
  supabase:
    SupabaseClient,

  userId:
    string,

  integrationId:
    string,

  required:
    boolean,
): Promise<
  IntegrationRuntimeCredentialReader
> {
  if (!required) {
    return {
      async read() {
        return {};
      },
    };
  }

  const envelope =
    await getIntegrationCredentials(
      supabase,
      userId,
      integrationId,
    );

  if (!envelope) {
    throw new ProviderSubscriptionApiError(
      "This live subscription requires connected Google OAuth credentials.",
      "INTEGRATION_PROVIDER_SUBSCRIPTION_CREDENTIALS_REQUIRED",
      409,
    );
  }

  return {
    async read(
      keys:
        readonly string[],
    ) {
      const selected:
        Record<string, string> = {};

      for (
        const key of
        keys
      ) {
        const value =
          envelope.values[
            key
          ];

        if (
          typeof value ===
            "string" &&
          value
        ) {
          selected[key] =
            value;
        }
      }

      return selected;
    },
  };
}

function serializeSubscription(
  subscription:
    Awaited<
      ReturnType<
        typeof getProviderSubscriptionById
      >
    >,
) {
  return subscription;
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const {
      id,
    } = await context.params;

    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (!user) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Authentication required.",
        },
        {
          status:
            401,
        },
      );
    }

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!connection) {
      throw new ProviderSubscriptionApiError(
        "Integration connection was not found.",
        "INTEGRATION_NOT_FOUND",
        404,
      );
    }

    const subscriptions =
      await listProviderSubscriptions(
        supabase,
        user.id,
        connection.id,
      );

    return NextResponse.json(
      {
        success:
          true,

        connectionId:
          connection.id,

        providerId:
          connection.providerId,

        subscriptions,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
  catch (error) {
    return subscriptionErrorResponse(
      error,
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const {
      id,
    } = await context.params;

    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (!user) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Authentication required.",
        },
        {
          status:
            401,
        },
      );
    }

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!connection) {
      throw new ProviderSubscriptionApiError(
        "Integration connection was not found.",
        "INTEGRATION_NOT_FOUND",
        404,
      );
    }

    const kind =
      subscriptionKind(
        connection.providerId,
      );

    const body =
      parseRequestObject(
        await request.json(),
      );

    const mode =
      parseMode(
        body.mode,
      );

    const activeSubscription =
      await getActiveProviderSubscription(
        supabase,
        user.id,
        connection.id,
        kind,
      );

    if (
      activeSubscription
    ) {
      throw new ProviderSubscriptionApiError(
        "This integration already has an active provider subscription.",
        "INTEGRATION_PROVIDER_SUBSCRIPTION_ALREADY_ACTIVE",
        409,
      );
    }

    const adapter =
      requireProviderSubscriptionAdapter(
        connection.providerId,
      );

    const credentials =
      await createCredentialReader(
        supabase,
        user.id,
        connection.id,
        mode ===
          "live",
      );

    let endpoint:
      Awaited<
        ReturnType<
          typeof createOrEnableIntegrationWebhookEndpoint
        >
      > |
      null =
        null;

    let callbackUrl =
      "https://sandbox.j10.local/api/webhooks/google/simulated";

    if (
      mode ===
        "live"
    ) {
      endpoint =
        await createOrEnableIntegrationWebhookEndpoint(
          supabase,
          connection,
          262_144,
        );

      callbackUrl =
        `${new URL(
          request.url,
        ).origin}/api/webhooks/google/${endpoint.endpointKey}`;
    }

    const requestId =
      crypto.randomUUID();

    const correlationId =
      request.headers.get(
        "x-j10-correlation-id",
      )?.trim() ||
      requestId;

    const invocationBase = {
      requestId,
      correlationId,
      userId:
        user.id,
      connection,
      environment:
        connection.environment,
      mode,
      callbackUrl,
      signal:
        request.signal,
      credentials,
    } as const;

    const options =
      connection.providerId ===
        "gmail"
        ? parseGmailOptions(
            body.options,
          )
        : parseCalendarOptions(
            body.options,
          );

    const result =
      connection.providerId ===
        "gmail"
        ? await adapter.create({
            ...invocationBase,

            providerId:
              "gmail",

            kind:
              "gmail.mailbox.watch",

            options:
              options as
                GmailSubscriptionOptions,
          })
        : await adapter.create({
            ...invocationBase,

            providerId:
              "google-calendar",

            kind:
              "google-calendar.events.watch",

            options:
              options as
                GoogleCalendarSubscriptionOptions,
          });

    if (
      result.simulated
    ) {
      return NextResponse.json(
        {
          success:
            true,

          persisted:
            false,

          subscription:
            null,

          result,
        },
        {
          status:
            200,

          headers: {
            "Cache-Control":
              "no-store",

            "X-J10-Request-Id":
              requestId,
          },
        },
      );
    }

    if (!endpoint) {
      throw new ProviderSubscriptionApiError(
        "The live provider subscription is missing its secure webhook endpoint.",
        "INTEGRATION_PROVIDER_SUBSCRIPTION_ENDPOINT_MISSING",
        500,
      );
    }

    const subscription =
      await createProviderSubscriptionRecord(
        supabase,
        {
          userId:
            user.id,

          integrationId:
            connection.id,

          endpointId:
            endpoint.id,

          providerId:
            connection.providerId as
              "gmail" |
              "google-calendar",

          environment:
            connection.environment,

          result,

          options:
            options as
              Readonly<
                Record<
                  string,
                  unknown
                >
              >,
        },
      );

    await writeIntegrationActivity(
      supabase,
      {
        userId:
          user.id,

        action:
          "integration_provider_subscription_created",

        entityId:
          connection.id,

        title:
          "Google provider subscription activated",

        description:
          `${connection.name} can now receive protected provider notifications.`,

        metadata: {
          providerId:
            connection.providerId,

          subscriptionId:
            subscription.id,

          subscriptionKind:
            subscription.kind,

          expiresAt:
            subscription.expiresAt,
        },
      },
    );

    return NextResponse.json(
      {
        success:
          true,

        persisted:
          true,

        subscription,

        result,
      },
      {
        status:
          201,

        headers: {
          "Cache-Control":
            "no-store",

          "X-J10-Request-Id":
            requestId,
        },
      },
    );
  }
  catch (error) {
    return subscriptionErrorResponse(
      error,
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  try {
    const {
      id,
    } = await context.params;

    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (!user) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Authentication required.",
        },
        {
          status:
            401,
        },
      );
    }

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!connection) {
      throw new ProviderSubscriptionApiError(
        "Integration connection was not found.",
        "INTEGRATION_NOT_FOUND",
        404,
      );
    }

    const body =
      parseRequestObject(
        await request.json(),
      );

    const subscriptionId =
      optionalString(
        body.subscriptionId,
        "subscriptionId",
        128,
      );

    if (!subscriptionId) {
      throw new ProviderSubscriptionApiError(
        "subscriptionId is required.",
        "INTEGRATION_PROVIDER_SUBSCRIPTION_ID_REQUIRED",
      );
    }

    const subscription =
      await getProviderSubscriptionById(
        supabase,
        user.id,
        connection.id,
        subscriptionId,
      );

    if (!subscription) {
      throw new ProviderSubscriptionApiError(
        "Provider subscription was not found.",
        "INTEGRATION_PROVIDER_SUBSCRIPTION_NOT_FOUND",
        404,
      );
    }

    if (
      subscription.state !==
        "active"
    ) {
      return NextResponse.json(
        {
          success:
            true,

          duplicate:
            true,

          subscription,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    const adapter =
      requireProviderSubscriptionAdapter(
        connection.providerId,
      );

    const credentials =
      await createCredentialReader(
        supabase,
        user.id,
        connection.id,
        true,
      );

    const requestId =
      crypto.randomUUID();

    const invocationBase = {
      requestId,
      correlationId:
        request.headers.get(
          "x-j10-correlation-id",
        )?.trim() ||
        requestId,
      userId:
        user.id,
      connection,
      environment:
        connection.environment,
      mode:
        "live" as const,
      callbackUrl:
        subscription.callbackUrl,
      signal:
        request.signal,
      credentials,
    };

    const stopResult =
      subscription.providerId ===
        "gmail"
        ? await adapter.stop({
            ...invocationBase,

            providerId:
              "gmail",

            kind:
              "gmail.mailbox.watch",
          })
        : await adapter.stop({
            ...invocationBase,

            providerId:
              "google-calendar",

            kind:
              "google-calendar.events.watch",

            externalChannelId:
              subscription.externalChannelId ??
              "",

            externalResourceId:
              subscription.externalResourceId ??
              "",
          });

    const stoppedSubscription =
      await markProviderSubscriptionStopped(
        supabase,
        subscription,
      );

    await writeIntegrationActivity(
      supabase,
      {
        userId:
          user.id,

        action:
          "integration_provider_subscription_stopped",

        entityId:
          connection.id,

        title:
          "Google provider subscription stopped",

        description:
          `${connection.name} provider notifications were stopped.`,

        metadata: {
          providerId:
            connection.providerId,

          subscriptionId:
            stoppedSubscription.id,

          subscriptionKind:
            stoppedSubscription.kind,
        },
      },
    );

    return NextResponse.json(
      {
        success:
          true,

        duplicate:
          false,

        subscription:
          stoppedSubscription,

        result:
          stopResult,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",

          "X-J10-Request-Id":
            requestId,
        },
      },
    );
  }
  catch (error) {
    return subscriptionErrorResponse(
      error,
    );
  }
}