import { NextResponse } from "next/server";
import { runJ10AI } from "@/lib/ai/runtime";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  assertWorkspaceEntitlement,
  recordWorkspaceMessageUsage,
  BillingRequiredError,
} from "@/lib/billing/entitlements";
import { integrationApiErrorResponse, parseRequestObject } from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { buildWhatsAppAgentInstructions, getWhatsAppAgentConfig } from "@/lib/integrations/whatsapp-agent";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const connection = await getIntegrationConnectionById(
      supabase,
      { workspaceId: wsContext.workspace.id, actorUserId: wsContext.user.id },
      id,
    );
    if (!connection || connection.providerId !== "whatsapp-business") {
      return NextResponse.json(
        { success: false, error: "WhatsApp Business connection was not found." },
        { status: 404 },
      );
    }

    const body = parseRequestObject(await request.json());
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 8000) : "";
    if (!message) {
      return NextResponse.json(
        { success: false, error: "Enter a test customer message." },
        { status: 400 },
      );
    }

    // Step 9 & 10: Verify entitlement and atomically reserve message quota before AI runtime
    await assertWorkspaceEntitlement(supabase, wsContext.workspace.id, {
      requiredMessages: 1,
    });
    await recordWorkspaceMessageUsage(supabase, wsContext.workspace.id, 1);

    const config = getWhatsAppAgentConfig(connection);
    const ai = await runJ10AI({
      task: "customer_support",
      preference: "Automatic",
      maxOutputTokens: 500,
      instructions: buildWhatsAppAgentInstructions(config),
      input: `Test customer message: ${message}\n\nDraft the reply. This is a simulator: do not send anything or claim any action occurred.`,
    });

    return NextResponse.json({
      success: true,
      reply: ai.text,
      ai: {
        mode: ai.executionMode,
        simulated: ai.simulated,
        model: ai.displayModel,
        apiCalled: ai.apiCalled,
      },
      sent: false,
    });
  } catch (error) {
    if (error instanceof BillingRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, reason: error.reason },
        { status: error.status },
      );
    }
    return integrationApiErrorResponse(error, "Could not simulate the WhatsApp AI agent.");
  }
}
