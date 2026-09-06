import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminSupabaseClient } from "@/lib/auth";
import { buildWhatsAppClickToChatLink, stripEmojis } from "@/lib/website/service";

const MAX_PAYLOAD_BYTES = 65536; // 64KB

export async function POST(request: Request) {
  try {
    // 1. Content-Type Header Check
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Content-Type must be application/json." },
        { status: 415 }
      );
    }

    // 2. Payload Size Enforcement
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: "Payload exceeds size limit of 64KB." },
        { status: 413 }
      );
    }

    const rawText = await request.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: "Payload exceeds size limit of 64KB." },
        { status: 413 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    // 3. Abuse Controls: Honeypot check
    if (body.honeypot || body.website_hp) {
      return NextResponse.json(
        { success: false, error: "Spam submission rejected." },
        { status: 400 }
      );
    }

    // 4. Field Length Limits and Normalization
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

    // 5. Resolve Destination Funnel & Workspace Server-Side
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

    // 6. Compute Deterministic Idempotency Key
    let idempotencyKey = String(
      body.idempotencyKey ||
      body.idempotency_key ||
      request.headers.get("x-idempotency-key") ||
      ""
    ).trim().slice(0, 128);

    if (!idempotencyKey) {
      const basis = `${funnel.id}:${cleanPhone}:${rawEmail}:${name}:${userMessage}`;
      const hash = crypto.createHash("sha256").update(basis, "utf8").digest("hex").slice(0, 32);
      idempotencyKey = `lead_${funnel.id}_${hash}`;
    }

    // 7. Atomic Database Persistence via secure create_website_lead RPC
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

    if (rpcError) {
      console.error("create_website_lead RPC error:", rpcError);
      return NextResponse.json(
        { success: false, error: "Failed to durably record lead in CRM." },
        { status: 500 }
      );
    }

    if (rpcResult?.conflict === true) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate submission conflict detected for this idempotency key.",
          conflict: true,
        },
        { status: 409 }
      );
    }

    if (!rpcResult?.success) {
      console.error("create_website_lead unsuccessful:", rpcResult?.error);
      return NextResponse.json(
        { success: false, error: "Failed to durably record lead in CRM." },
        { status: 500 }
      );
    }

    // 8. Build WhatsApp Conversational Greeting without Hardcoded Numbers
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

    // 9. Omit Internal UUIDs from Public Response
    return NextResponse.json({
      success: true,
      message: "Lead recorded successfully.",
      whatsappLink,
    });
  } catch (error: unknown) {
    console.error("Website Lead API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process lead inquiry.",
      },
      { status: 500 }
    );
  }
}
