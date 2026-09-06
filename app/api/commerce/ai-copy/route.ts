import { NextResponse } from "next/server";
import { runJ10AI } from "@/lib/ai/runtime";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  assertWorkspaceEntitlement,
  recordWorkspaceMessageUsage,
  BillingRequiredError,
} from "@/lib/billing/entitlements";

export async function POST(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const body = await request.json();
    const productName = String(body.productName || "").trim();
    const category = String(body.category || "General").trim();
    const audience = String(body.audience || "Business clients and retail buyers").trim();
    const price = body.price ? `$${body.price}` : "";

    if (!productName) {
      return NextResponse.json(
        { success: false, error: "Product name is required to generate AI copy." },
        { status: 400 },
      );
    }

    // Step 9 & 10: Verify entitlement and atomically reserve message quota before AI generation
    await assertWorkspaceEntitlement(supabase, wsContext.workspace.id, {
      requiredMessages: 1,
    });
    await recordWorkspaceMessageUsage(supabase, wsContext.workspace.id, 1);

    const instructions = `You are the lead commerce copywriter for J10 NEXUS.
Your task is to write high-converting, premium product marketing copy for an e-commerce catalog item.
Write:
1. One punchy headline hook.
2. An engaging 2-sentence value proposition.
3. Three compelling bullet points explaining benefits (not just features).
4. A 1-sentence WhatsApp closing pitch designed for conversational selling.

Keep the tone energetic, polished, and persuasive. Avoid robotic cliché.`;

    const input = `Product Name: ${productName}
Category: ${category}
Price: ${price}
Target Audience: ${audience}`;

    const aiResult = await runJ10AI({
      task: "content_generation",
      preference: "Automatic",
      maxOutputTokens: 600,
      instructions,
      input,
    });

    return NextResponse.json({
      success: true,
      copy: aiResult.text,
      model: aiResult.displayModel,
      provider: aiResult.provider,
    });
  } catch (error) {
    if (error instanceof BillingRequiredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code, reason: error.reason },
        { status: error.status },
      );
    }
    console.error("Commerce AI Copy error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate AI product copy." },
      { status: 500 },
    );
  }
}
