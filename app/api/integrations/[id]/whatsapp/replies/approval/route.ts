import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { assertWorkspaceEntitlement, BillingRequiredError } from "@/lib/billing/entitlements";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import {
  createIntegrationActionFingerprint,
  createIntegrationActionPlan,
  IntegrationActionError,
  parseIntegrationActionInput,
  resolveIntegrationActionCapability,
} from "@/lib/integrations/external-action-adapter";
import { createIntegrationOperatorApproval } from "@/lib/integrations/operator-approval";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const connection = await getIntegrationConnectionById(supabase, user.id, id);
    if (!connection || connection.providerId !== "whatsapp-business" || connection.status !== "connected") {
      return NextResponse.json(
        { success: false, error: "A connected WhatsApp Business integration is required." },
        { status: 409 },
      );
    }

    await assertWorkspaceEntitlement(supabase, user.id, { feature: "whatsapp.message.send" });

    const body = parseRequestObject(await request.json());
    const to = typeof body.to === "string" ? body.to.replace(/\D/g, "") : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (to.length < 7 || to.length > 15 || !message || message.length > 4096) {
      return NextResponse.json(
        { success: false, error: "Enter a valid recipient and a reply between 1 and 4,096 characters." },
        { status: 400 },
      );
    }

    const capability = resolveIntegrationActionCapability(connection, "whatsapp.message.send");
    const input = parseIntegrationActionInput({ to, message, previewUrl: false });
    const idempotencyKey = `whatsapp-reply-${randomUUID()}`;
    const actionRequest = { capabilityId: capability.id, mode: "live" as const, idempotencyKey, input };

    createIntegrationActionPlan(connection, capability, actionRequest, new URL(request.url).origin);
    const fingerprint = createIntegrationActionFingerprint(connection, actionRequest);
    const approval = createIntegrationOperatorApproval({ userId: user.id, connectionId: connection.id, fingerprint });

    return NextResponse.json({
      success: true,
      approvalToken: approval.token,
      expiresAt: approval.expiresAt,
      idempotencyKey,
      capabilityId: capability.id,
      input,
      preview: { recipient: `••••${to.slice(-4)}`, message, externalSideEffect: true },
    });
  } catch (error) {
    if (error instanceof BillingRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, reason: error.reason },
        { status: error.status },
      );
    }
    if (error instanceof IntegrationActionError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }
    return integrationApiErrorResponse(error, "J10 could not prepare this WhatsApp reply.");
  }
}
