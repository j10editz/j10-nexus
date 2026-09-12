import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminSupabaseClient } from "@/lib/auth";
import { buildWhatsAppClickToChatLink, stripEmojis } from "@/lib/website/service";
import { recordCanonicalLeadIntake, type LeadConsent } from "@/lib/leads/intake";

const MAX_PAYLOAD_BYTES = 65536; // 64KB
const PUBLIC_RATE_WINDOW_MS = 60_000;
const PUBLIC_RATE_MAX = 12;
const publicLeadAttempts = new Map<string, { count: number; resetAt: number }>();

function withinPublicLeadRateLimit(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const current = publicLeadAttempts.get(key);
  if (!current || current.resetAt <= now) {
    publicLeadAttempts.set(key, { count: 1, resetAt: now + PUBLIC_RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= PUBLIC_RATE_MAX) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    if (!withinPublicLeadRateLimit(request)) {
      return NextResponse.json({ success: false, error: "Please try again shortly." }, { status: 429 });
    }
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

    // 7. Server-resolved tenant + one transactional intake/outbox write.
    const intake = await recordCanonicalLeadIntake(admin, {
      workspaceId: funnel.workspace_id,
      source: "website_form",
      channel: "website",
      idempotencyKey,
      name,
      email: rawEmail || null,
      phone: cleanPhone ? `+${cleanPhone}` : null,
      message: userMessage,
      campaign: typeof body.campaign === "string" ? body.campaign : null,
      attribution: {
        source_url: String(body.sourceUrl || "").slice(0, 500) || null,
        utm_source: typeof body.utm_source === "string" ? body.utm_source.slice(0, 200) : null,
        utm_medium: typeof body.utm_medium === "string" ? body.utm_medium.slice(0, 200) : null,
        utm_campaign: typeof body.utm_campaign === "string" ? body.utm_campaign.slice(0, 200) : null,
      },
      consents: Array.isArray(body.consents) && body.consents.length > 0
        ? body.consents as LeadConsent[]
        : [{ status: "not_provided", communicationChannel: "website", purpose: "marketing", disclosureVersion: "website-form-v1", captureSource: "website_form" }],
      metadata: { funnel_id: funnel.id, funnel_slug: funnel.slug, submitted_at: new Date().toISOString() },
    }, new URL(request.url).origin);

    if (intake.resolution_status === "ambiguous") {
      return NextResponse.json({ success: true, message: "Lead received successfully." }, { status: 202 });
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
        error: "J10 could not accept this lead inquiry. Please try again.",
      },
      { status: 500 }
    );
  }
}
