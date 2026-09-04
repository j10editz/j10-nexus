import { NextResponse } from "next/server";

import { runJ10AI } from "@/lib/ai/runtime";
import { assertWorkspaceEntitlement, BillingRequiredError } from "@/lib/billing/entitlements";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
  parseRequestObject,
} from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { buildWhatsAppAgentInstructions, getWhatsAppAgentConfig } from "@/lib/integrations/whatsapp-agent";
import { getWorkspaceKnowledgeGrounding } from "@/lib/knowledge/service";

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

    await assertWorkspaceEntitlement(supabase, user.id, { feature: "whatsapp_reply_suggestions" });

    const body = parseRequestObject(await request.json());
    const customerMessage = typeof body.customerMessage === "string" ? body.customerMessage.trim() : "";
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "Customer";
    if (!customerMessage || customerMessage.length > 8000) {
      return NextResponse.json(
        { success: false, error: "A customer message is required to generate a suggestion." },
        { status: 400 },
      );
    }

    const agent = getWhatsAppAgentConfig(connection);
    const { groundingPrompt } = await getWorkspaceKnowledgeGrounding(supabase, user.id);
    const effectiveAgent = groundingPrompt
      ? {
          ...agent,
          businessKnowledge: [agent.businessKnowledge, groundingPrompt]
            .filter(Boolean)
            .join("\n\n"),
        }
      : agent;

    const result = await runJ10AI({
      task: "customer_support",
      preference: "Automatic",
      maxOutputTokens: 500,
      instructions: buildWhatsAppAgentInstructions(effectiveAgent),
      input: `Customer name: ${customerName}\nCustomer message: ${customerMessage}\n\nDraft the best safe reply.`,
    });

    return NextResponse.json({
      success: true,
      suggestion: result.text,
      agentName: agent.agentName,
      ai: {
        mode: result.executionMode,
        simulated: result.simulated,
        model: result.displayModel,
        apiCalled: result.apiCalled,
      },
    });
  } catch (error) {
    if (error instanceof BillingRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, reason: error.reason },
        { status: error.status },
      );
    }
    return integrationApiErrorResponse(error, "J10 AI could not generate a WhatsApp reply suggestion.");
  }
}
