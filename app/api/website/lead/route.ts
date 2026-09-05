import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/auth";
import { buildWhatsAppClickToChatLink, stripEmojis } from "@/lib/website/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Abuse Controls: Honeypot check
    if (body.honeypot || body.website_hp) {
      return NextResponse.json(
        { success: false, error: "Spam submission rejected." },
        { status: 400 }
      );
    }

    // 2. Field Length Limits
    const rawName = String(body.name || "").trim().slice(0, 100);
    const rawPhone = String(body.phone || "").trim().slice(0, 30);
    const rawEmail = String(body.email || "").trim().toLowerCase().slice(0, 120);
    const rawMessage = String(body.message || "").trim().slice(0, 1000);
    const sourceSlug = String(body.sourceFunnel || "").trim().toLowerCase();

    const name = stripEmojis(rawName || "Inbound Visitor");
    const userMessage = stripEmojis(rawMessage || "I would like more information about your services.");
    const cleanPhone = rawPhone.replace(/\D/g, "");

    if (!cleanPhone && !rawEmail) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid phone number or email address." },
        { status: 400 }
      );
    }

    if (!sourceSlug) {
      return NextResponse.json(
        { success: false, error: "Website funnel not found." },
        { status: 404 }
      );
    }

    // 3. Resolve Destination Funnel & Workspace Server-Side
    const admin = createAdminSupabaseClient();

    const { data: funnel, error: funnelError } = await admin
      .from("website_funnels")
      .select("id, workspace_id, slug, title, primary_cta_link, is_published")
      .eq("slug", sourceSlug)
      .eq("is_published", true)
      .maybeSingle();

    if (funnelError || !funnel) {
      return NextResponse.json(
        { success: false, error: "Website funnel not found." },
        { status: 404 }
      );
    }

    // 4. Atomic Database Persistence via secure create_website_lead RPC
    const idempotencyKey =
      String(body.idempotencyKey || body.idempotency_key || request.headers.get("x-idempotency-key") || "").trim().slice(0, 128) ||
      `lead_${funnel.id}_${cleanPhone || rawEmail}_${Date.now()}`;

    const { data: rpcResult, error: rpcError } = await admin.rpc("create_website_lead", {
      p_funnel_id: funnel.id,
      p_name: name,
      p_email: rawEmail || null,
      p_phone: cleanPhone ? `+${cleanPhone}` : null,
      p_message: userMessage,
      p_notes: `Lead intake via /site/${funnel.slug}`,
      p_idempotency_key: idempotencyKey,
      p_metadata: {
        source_url: String(body.sourceUrl || "").slice(0, 500) || null,
        submitted_at: new Date().toISOString(),
      },
    });

    if (rpcError || !rpcResult?.success) {
      console.error("create_website_lead RPC error:", rpcError || rpcResult?.error);
      return NextResponse.json(
        { success: false, error: "Failed to durably record lead in CRM." },
        { status: 500 }
      );
    }

    // 5. Build WhatsApp Conversational Greeting without Hardcoded Numbers
    let targetWhatsAppPhone: string | null = null;
    if (funnel.primary_cta_link && funnel.primary_cta_link.includes("wa.me/")) {
      const match = funnel.primary_cta_link.match(/wa\.me\/([0-9+]+)/);
      if (match && match[1]) {
        targetWhatsAppPhone = match[1];
      }
    }

    const conversationalGreeting = `Hello! My name is ${name}. ${userMessage}`;
    const whatsappLink = buildWhatsAppClickToChatLink(
      targetWhatsAppPhone,
      conversationalGreeting
    );

    return NextResponse.json({
      success: true,
      message: "Lead recorded successfully.",
      contactId: rpcResult.contact_id,
      threadId: rpcResult.thread_id,
      whatsappLink,
    });
  } catch (error: any) {
    console.error("Website Lead API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process lead inquiry." },
      { status: 500 }
    );
  }
}
