import {
  randomUUID,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
} from "../../../../../../lib/integrations/api";

import {
  getIntegrationConnectionById,
} from "../../../../../../lib/integrations/database";

import {
  createIntegrationActionFingerprint,
  createIntegrationActionPlan,
  IntegrationActionError,
  parseIntegrationActionInput,
  resolveIntegrationActionCapability,
} from "../../../../../../lib/integrations/external-action-adapter";

import {
  createIntegrationOperatorApproval,
} from "../../../../../../lib/integrations/operator-approval";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
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
        {
          status: 401,
        },
      );
    }

    const body =
      parseRequestObject(
        await request.json(),
      );

    const connection =
      await getIntegrationConnectionById(
        supabase,
        user.id,
        id,
      );

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Integration connection was not found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      connection.providerId !==
        "whatsapp-business" ||
      connection.status !==
        "connected"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A connected WhatsApp Business integration is required.",
        },
        {
          status: 409,
        },
      );
    }

    const capability =
      resolveIntegrationActionCapability(
        connection,
        "whatsapp.template.send",
      );

    const input =
      parseIntegrationActionInput({
        to:
          body.to,
        templateName:
          "hello_world",
        languageCode:
          "en_US",
      });

    const idempotencyKey =
      `day17c-${randomUUID()}`;

    const actionRequest = {
      capabilityId:
        capability.id,
      mode:
        "live" as const,
      idempotencyKey,
      input,
    };

    createIntegrationActionPlan(
      connection,
      capability,
      actionRequest,
      new URL(request.url).origin,
    );

    const fingerprint =
      createIntegrationActionFingerprint(
        connection,
        actionRequest,
      );

    const approval =
      createIntegrationOperatorApproval({
        userId:
          user.id,
        connectionId:
          connection.id,
        fingerprint,
      });

    const recipient =
      typeof input.to === "string"
        ? input.to
        : "";

    return NextResponse.json({
      success: true,
      approvalToken:
        approval.token,
      expiresAt:
        approval.expiresAt,
      idempotencyKey,
      capabilityId:
        capability.id,
      input,
      preview: {
        recipient:
          recipient.length > 4
            ? `••••${recipient.slice(-4)}`
            : "••••",
        templateName:
          "hello_world",
        languageCode:
          "en_US",
        externalSideEffect:
          true,
      },
    });
  } catch (error) {
    if (
      error instanceof
      IntegrationActionError
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            error.message,
          code:
            error.code,
          details:
            error.details,
        },
        {
          status:
            error.status,
        },
      );
    }

    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not prepare the WhatsApp test delivery.",
    );
  }
}
