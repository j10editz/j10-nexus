import { NextResponse } from "next/server";
import { runJ10AI } from "@/lib/ai/runtime";
import { createIntegrationApiClient, getAuthenticatedIntegrationUser, integrationApiErrorResponse, parseRequestObject } from "@/lib/integrations/api";
import { getIntegrationConnectionById } from "@/lib/integrations/database";
import { buildWhatsAppAgentInstructions, getWhatsAppAgentConfig } from "@/lib/integrations/whatsapp-agent";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const connection = await getIntegrationConnectionById(supabase, user.id, id);
    if (!connection || connection.providerId !== "whatsapp-business") return NextResponse.json({ success: false, error: "WhatsApp Business connection was not found." }, { status: 404 });
    const body = parseRequestObject(await request.json());
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 8000) : "";
    if (!message) return NextResponse.json({ success: false, error: "Enter a test customer message." }, { status: 400 });
    const config = getWhatsAppAgentConfig(connection);
    const ai = await runJ10AI({ task: "customer_support", preference: "Automatic", maxOutputTokens: 500, instructions: buildWhatsAppAgentInstructions(config), input: `Test customer message: ${message}\n\nDraft the reply. This is a simulator: do not send anything or claim any action occurred.` });
    return NextResponse.json({ success: true, reply: ai.text, ai: { mode: ai.executionMode, simulated: ai.simulated, model: ai.displayModel, apiCalled: ai.apiCalled }, sent: false });
  } catch (error) {
    return integrationApiErrorResponse(error, "Could not simulate the WhatsApp AI agent.");
  }
}
