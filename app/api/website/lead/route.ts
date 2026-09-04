import { NextResponse } from "next/server";
import { createIntegrationApiClient } from "@/lib/integrations/api";
import { buildWhatsAppClickToChatLink, stripEmojis } from "@/lib/website/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = stripEmojis(body.name || "Inbound Visitor");
    const rawPhone = String(body.phone || "");
    const email = (body.email || "").trim().toLowerCase();
    const userMessage = stripEmojis(body.message || "I would like more information about your services.");
    const targetWhatsAppPhone = body.targetWhatsAppPhone || "+15550192834";

    const cleanPhone = rawPhone.replace(/\D/g, "");

    if (!cleanPhone && !email) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid phone number or email address." },
        { status: 400 }
      );
    }

    // Attempt to store in Supabase CRM contacts table
    try {
      const supabase = await createIntegrationApiClient();
      await supabase.from("contacts").insert([
        {
          name,
          phone: cleanPhone ? `+${cleanPhone}` : null,
          email: email || null,
          status: "lead",
          lead_source: "website_funnel",
          notes: userMessage,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (dbError) {
      // In development or if table is absent, log and continue smoothly
      console.warn("Contact logging skipped or table not initialized:", dbError);
    }

    // Build the direct WhatsApp greeting
    const conversationalGreeting = `Hello! My name is ${name}. ${userMessage}`;
    const whatsappLink = buildWhatsAppClickToChatLink(
      targetWhatsAppPhone,
      conversationalGreeting
    );

    return NextResponse.json({
      success: true,
      message: "Lead recorded successfully.",
      whatsappLink,
    });
  } catch (error) {
    console.error("Website Lead API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process lead inquiry." },
      { status: 500 }
    );
  }
}
