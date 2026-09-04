import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import { generateMarketingCopy } from "@/lib/marketing/service";
import type { AudienceSegment, CampaignChannel } from "@/types/marketing";

export async function POST(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const objective = typeof body.objective === "string" ? body.objective.trim() : "";
    const channel: CampaignChannel =
      body.channel === "email" || body.channel === "sms" || body.channel === "social"
        ? body.channel
        : "whatsapp";
    const tone = typeof body.tone === "string" ? body.tone.trim() : "High Conversion & Direct";
    const targetAudience: AudienceSegment =
      body.targetAudience === "leads" ||
      body.targetAudience === "prospects" ||
      body.targetAudience === "customers"
        ? body.targetAudience
        : "leads";

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Campaign objective is required." },
        { status: 400 }
      );
    }

    const result = await generateMarketingCopy({
      supabase,
      userId: user.id,
      objective,
      channel,
      tone,
      targetAudience,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Generate marketing copy error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not generate marketing copy.",
      },
      { status: 500 }
    );
  }
}
