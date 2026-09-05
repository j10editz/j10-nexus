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

    // 3. Resolve Destination Funnel & Workspace Server-Side
    const admin = createAdminSupabaseClient();

    let workspaceId: string | null = null;
    let targetWhatsAppPhone = "+15550192834"; // Default fallback

    if (sourceSlug) {
      const { data: funnel } = await admin
        .from("website_funnels")
        .select("workspace_id, primary_cta_link")
        .eq("slug", sourceSlug)
        .maybeSingle();

      if (funnel?.workspace_id) {
        workspaceId = funnel.workspace_id;
        if (funnel.primary_cta_link && funnel.primary_cta_link.includes("wa.me/")) {
          const match = funnel.primary_cta_link.match(/wa\.me\/([0-9+]+)/);
          if (match && match[1]) {
            targetWhatsAppPhone = match[1];
          }
        }
      }
    }

    // If no funnel matched, resolve primary workspace
    if (!workspaceId) {
      const { data: defaultWs } = await admin
        .from("workspaces")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (defaultWs?.id) {
        workspaceId = defaultWs.id;
      }
    }

    if (!workspaceId) {
      return NextResponse.json(
        { success: false, error: "No destination workspace configured for lead intake." },
        { status: 500 }
      );
    }

    // 4. Durable Database Persistence (CRM Contact + Inbox Thread + Initial Message)
    const formattedPhone = cleanPhone ? `+${cleanPhone}` : null;

    // A. Insert/Upsert CRM Contact
    const { data: contact, error: contactError } = await admin
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        first_name: name.split(" ")[0] || name,
        last_name: name.split(" ").slice(1).join(" ") || null,
        phone: formattedPhone,
        email: rawEmail || null,
        status: "New",
        type: "Lead",
        lead_source: sourceSlug ? `website_funnel:${sourceSlug}` : "website_funnel",
        estimated_value: 0,
        notes: userMessage,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (contactError || !contact) {
      console.error("Durable lead persistence failed in contacts:", contactError);
      return NextResponse.json(
        { success: false, error: "Failed to durably record lead in CRM." },
        { status: 500 }
      );
    }

    // B. Create or update Inbox Thread for real-time conversation visibility
    const customerIdentifier = formattedPhone || rawEmail || name;
    const { data: thread } = await admin
      .from("inbox_threads")
      .insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        customer_name: name,
        customer_phone: formattedPhone,
        customer_email: rawEmail || null,
        channel: formattedPhone ? "whatsapp" : "email",
        status: "open",
        priority: "normal",
        last_message_preview: userMessage.slice(0, 120),
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (thread?.id) {
      // C. Insert Initial Inbound Message
      await admin.from("inbox_messages").insert({
        workspace_id: workspaceId,
        thread_id: thread.id,
        direction: "inbound",
        sender_type: "customer",
        sender_name: name,
        content: userMessage,
        delivery_status: "delivered",
        created_at: new Date().toISOString(),
      });
    }

    // 5. Build Direct WhatsApp Conversational Greeting
    const conversationalGreeting = `Hello! My name is ${name}. ${userMessage}`;
    const whatsappLink = buildWhatsAppClickToChatLink(
      targetWhatsAppPhone,
      conversationalGreeting
    );

    return NextResponse.json({
      success: true,
      message: "Lead recorded successfully.",
      contactId: contact.id,
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
