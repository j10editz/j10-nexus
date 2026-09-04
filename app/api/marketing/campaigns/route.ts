import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import {
  computeMarketingSummary,
  getCRMAudienceCounts,
} from "@/lib/marketing/service";
import type { AudienceSegment, CampaignChannel, MarketingCampaign } from "@/types/marketing";

export async function GET(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel");
    const status = searchParams.get("status");

    let query = supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (channel && channel !== "all") {
      query = query.eq("channel", channel);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    // Gracefully handle if table doesn't exist yet
    const campaigns = error ? [] : ((data ?? []) as MarketingCampaign[]);
    const audienceCounts = await getCRMAudienceCounts(supabase, user.id);
    const summary = computeMarketingSummary(campaigns, audienceCounts);

    return NextResponse.json({
      success: true,
      campaigns,
      summary,
    });
  } catch (error) {
    console.error("Marketing GET error:", error);
    return NextResponse.json(
      { success: false, error: "Could not load marketing campaigns." },
      { status: 500 }
    );
  }
}

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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const channel: CampaignChannel =
      body.channel === "email" || body.channel === "sms" || body.channel === "social"
        ? body.channel
        : "whatsapp";
    const audienceSegment: AudienceSegment =
      body.audience_segment === "leads" ||
      body.audience_segment === "prospects" ||
      body.audience_segment === "customers"
        ? body.audience_segment
        : "all";
    const messageTemplate =
      typeof body.message_template === "string" ? body.message_template.trim() : "";
    const scheduledAt =
      typeof body.scheduled_at === "string" && body.scheduled_at.trim()
        ? body.scheduled_at.trim()
        : null;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Campaign name is required." },
        { status: 400 }
      );
    }

    if (!messageTemplate) {
      return NextResponse.json(
        { success: false, error: "Message template content is required." },
        { status: 400 }
      );
    }

    // Resolve audience count dynamically from real CRM data
    const audienceCounts = await getCRMAudienceCounts(supabase, user.id);
    const targetCount = audienceCounts[audienceSegment] || 0;

    const initialStatus = scheduledAt ? "scheduled" : "draft";

    const { data: campaign, error } = await supabase
      .from("marketing_campaigns")
      .insert({
        user_id: user.id,
        name,
        channel,
        audience_segment: audienceSegment,
        status: initialStatus,
        target_count: targetCount,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        message_template: messageTemplate,
        scheduled_at: scheduledAt,
      })
      .select("*")
      .single();

    if (error || !campaign) {
      console.error("Campaign creation error:", error);
      return NextResponse.json(
        { success: false, error: "Could not create campaign in database." },
        { status: 500 }
      );
    }

    // Write activity log
    try {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "marketing_campaign_created",
        entity_type: "marketing_campaign",
        entity_id: campaign.id,
        title: `Campaign Created: ${campaign.name}`,
        description: `Targeting ${targetCount} contacts in segment '${audienceSegment}'.`,
        metadata: {
          channel,
          audience_segment: audienceSegment,
          target_count: targetCount,
        },
      });
    } catch {}

    return NextResponse.json(
      {
        success: true,
        campaign,
        message: "Campaign created successfully.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Marketing POST error:", error);
    return NextResponse.json(
      { success: false, error: "Could not create marketing campaign." },
      { status: 500 }
    );
  }
}
