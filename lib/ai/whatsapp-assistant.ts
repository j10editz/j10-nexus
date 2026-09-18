import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import https from "node:https";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceBotConfig, redactPii } from "@/lib/ai/telegram-assistant";
import { assertWorkspaceEntitlement, recordVerifiedWorkspaceUsage } from "@/lib/billing/entitlements";
import { WHATSAPP_RUNTIME_ADAPTER } from "@/lib/integrations/providers/whatsapp/adapter";
import { WHATSAPP_ACTION_CAPABILITY_IDS } from "@/types/integration-whatsapp";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import {
  defaultPlaybook,
  getPlaybook,
  resolveAuthoritativePlaybookKey,
  resolvePlaybookForWorkspace,
} from "@/lib/service-business/playbooks/registry";
import type { ServicePlaybook } from "@/lib/service-business/types";
import {
  extractConfiguredPrice,
  extractServiceIntent,
  isValidHttpsUrl,
  updateServiceJourneyLifecycleState,
} from "@/lib/service-business/conversion-service";

export interface WhatsAppAIMessageInput {
  supabase: SupabaseClient;
  workspaceId: string;
  integrationId: string;
  threadId: string;
  recipientPhone: string;
  inboundText: string;
  senderName: string;
  inboundWamid: string;
}

export interface WhatsAppAIResponseResult {
  replyText: string;
  deliveryStatus: "sent" | "failed";
  outboundWamid?: string;
  error?: string;
  skippedReason?: string;
}

const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

/**
 * Calls Google Gemini LLM with strict 8-second timeout, primary/fallback failover,
 * and prompt guardrails.
 */
async function callGeminiAPI(
  apiKey: string,
  sanitizedPrompt: string,
  systemInstruction: string,
  history: Array<{ role: "user" | "model"; text: string }> = []
): Promise<string | null> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];

  for (const model of models) {
    const contents: any[] = [];
    for (const h of history) {
      contents.push({
        role: h.role,
        parts: [{ text: h.text }],
      });
    }
    contents.push({
      role: "user",
      parts: [{ text: sanitizedPrompt }],
    });

    const body = JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.3,
        topP: 0.8,
      },
    });

    try {
      const reply = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          req.destroy(new Error("Gemini API timeout (8000ms exceeded)"));
        }, 8000);

        const req = https.request(
          {
            hostname: "generativelanguage.googleapis.com",
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            },
          },
          (res) => {
            clearTimeout(timeout);
            let responseData = "";
            res.on("data", (chunk) => (responseData += chunk));
            res.on("end", () => {
              try {
                const json = JSON.parse(responseData);
                if (res.statusCode === 200 && json.candidates?.[0]?.content?.parts?.[0]?.text) {
                  resolve(json.candidates[0].content.parts[0].text.trim());
                } else {
                  reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
                }
              } catch (e) {
                reject(e);
              }
            });
          }
        );

        req.on("error", (e) => {
          clearTimeout(timeout);
          reject(e);
        });

        req.write(body);
        req.end();
      });

      if (reply) return reply;
    } catch (err) {
      // Failover to next model
      continue;
    }
  }

  return null;
}

/**
 * Intelligent 24/7 AI conversational receptionist engine for WhatsApp.
 * Respects entitlements, human handoff, bot grounding, and sends reply via WhatsApp Graph API.
 */
export async function generateAndSendWhatsAppAIResponse(
  input: WhatsAppAIMessageInput
): Promise<WhatsAppAIResponseResult> {
  const {
    supabase,
    workspaceId,
    integrationId,
    threadId,
    recipientPhone,
    inboundText,
    senderName,
    inboundWamid,
  } = input;

  // 1. Thread-level AI-off and Human Handoff Enforcement
  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id, contact_id, metadata, priority")
    .eq("id", threadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const threadMeta = (thread?.metadata || {}) as Record<string, any>;
  if (threadMeta.aiBotEnabled === false || threadMeta.humanHandoff === true) {
    return {
      replyText: "",
      deliveryStatus: "failed",
      skippedReason: "human_handoff_active",
    };
  }

  // 2. Resolve Bot Configuration & Master Switch
  const { config: botConfig, brandName } = await getWorkspaceBotConfig(supabase, workspaceId);
  const businessName = botConfig.business_name || brandName;

  if (!botConfig.ai_enabled) {
    return {
      replyText: "",
      deliveryStatus: "failed",
      skippedReason: "master_ai_disabled",
    };
  }

  // 3. Human escalation check in free text
  const lower = inboundText.toLowerCase().trim();
  if (
    lower === "/human" ||
    lower === "/agent" ||
    lower === "human" ||
    lower === "agent" ||
    lower.includes("talk to human") ||
    lower.includes("speak to a person") ||
    lower.includes("real person")
  ) {
    const { data: handoffData, error: handoffError } = await supabase.rpc(
      "handoff_service_thread_atomic",
      {
        p_workspace_id: workspaceId,
        p_thread_id: threadId,
        p_reason: "Customer requested human representative",
        p_actor_type: "ai_assistant",
        p_actor_id: null,
      }
    );

    if (handoffError) {
      throw new Error(`Handoff transaction failed: ${handoffError.message}`);
    }

    const alreadySentNotice = handoffData?.already_sent_notice === true;
    if (alreadySentNotice) {
      return {
        replyText: "",
        deliveryStatus: "failed",
        skippedReason: "human_handoff_active",
      };
    }

    const handoffNotice = `Our team at ${businessName} has been alerted. A specialist will respond to you directly here shortly.`;
    const sendResult = await sendWhatsAppOutbound({
      supabase,
      workspaceId,
      integrationId,
      threadId,
      recipientPhone,
      text: handoffNotice,
      inboundWamid,
    });

    if (sendResult.deliveryStatus === "sent") {
      const { error: updateMetaError } = await supabase
        .from("inbox_threads")
        .update({
          metadata: {
            ...threadMeta,
            aiBotEnabled: false,
            humanHandoff: true,
            humanRequestedAt: new Date().toISOString(),
            humanHandoffNoticeSent: true,
          },
        })
        .eq("id", threadId)
        .eq("workspace_id", workspaceId);

      if (updateMetaError) {
        console.warn("[WhatsApp Assistant] Failed to record humanHandoffNoticeSent:", updateMetaError.message);
      }
    }

    return { replyText: handoffNotice, ...sendResult };
  }

  // 4. Entitlement & Quota Verification
  try {
    await assertWorkspaceEntitlement(supabase, workspaceId, {
      requiredMessages: 1,
    });
  } catch (billingErr) {
    return {
      replyText: "",
      deliveryStatus: "failed",
      error: billingErr instanceof Error ? billingErr.message : String(billingErr),
      skippedReason: "billing_or_quota_exceeded",
    };
  }

  // 5. Fetch past conversation history (up to 10 messages)
  const history: Array<{ role: "user" | "model"; text: string }> = [];
  try {
    const { data: pastMsgs } = await supabase
      .from("inbox_messages")
      .select("direction, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (pastMsgs && pastMsgs.length > 0) {
      for (const m of pastMsgs.reverse()) {
        if (m.content && m.content.trim()) {
          history.push({
            role: m.direction === "inbound" ? "user" : "model",
            text: m.content.trim(),
          });
        }
      }
    }
  } catch {
    // Non-fatal history retrieval
  }

  // 6. Resolve Gemini Key
  let geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
  if (!geminiKey) {
    const { data: integs } = await supabase
      .from("integrations")
      .select("id, provider")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google_gemini");

    if (integs && integs.length > 0) {
      for (const integ of integs) {
        try {
          const decrypted = await getIntegrationCredentials(supabase, workspaceId, integ.id);
          const foundKey = decrypted?.values?.gemini_api_key || decrypted?.values?.api_key;
          if (foundKey && foundKey.trim()) {
            geminiKey = foundKey.trim();
            break;
          }
        } catch {}
      }
    }
  }

  // 7. Grounded System Prompt
  let resolvedKey: string | null = null;
  const { data: journeyRow, error: journeyErr } = await supabase
    .from("service_conversion_journeys")
    .select("playbook_key")
    .eq("workspace_id", workspaceId)
    .eq("thread_id", threadId)
    .maybeSingle();

  if (journeyErr) {
    throw new Error(`Database error querying service journey playbook: ${journeyErr.message}`);
  }
  resolvedKey = journeyRow?.playbook_key || null;

  if (!resolvedKey) {
    const { data: wsRow, error: wsErr } = await supabase
      .from("workspaces")
      .select("metadata")
      .eq("id", workspaceId)
      .maybeSingle();

    if (wsErr) {
      throw new Error(`Database error querying workspace metadata for playbook: ${wsErr.message}`);
    }
    resolvedKey = resolveAuthoritativePlaybookKey({
      workspaceMetadata: wsRow?.metadata as Record<string, unknown>,
    });
  }

  const activePlaybook = getPlaybook(resolvedKey);
  const serviceLabel = activePlaybook.terminology.serviceLabel;
  const bookingLabel = activePlaybook.terminology.bookingLabel;

  // Workspace-configured services are authoritative.
  // Playbooks provide terminology and qualification guidance only.
  // Only preset industry playbooks (e.g. beauty_grooming, auto_detailing) provide starter services
  // when workspace has zero configured services. General service has no starter services.
  let effectiveServicesList: any[] = [];
  if (Array.isArray(botConfig.services) && botConfig.services.length > 0) {
    effectiveServicesList = botConfig.services;
  } else if (activePlaybook.playbookKey !== "general_service" && activePlaybook.services && activePlaybook.services.length > 0) {
    effectiveServicesList = activePlaybook.services.map((s) => ({
      name: s.name,
      description: s.description || "",
      price: s.priceDisplay || (s.price !== null && s.price !== undefined ? `$${s.price}` : "Custom Quote"),
      duration: s.durationMinutes ? `${s.durationMinutes} mins` : undefined,
    }));
  }

  const formattedServices = effectiveServicesList.length > 0
    ? effectiveServicesList
        .map((s, idx) => `${idx + 1}. ${s.name}: ${s.description || "No description"} (Price: ${s.price || "Custom Quote"}${s.duration ? `, Duration: ${s.duration}` : ""})`)
        .join("\n")
    : "";

  const formattedFaqs = (botConfig.faqs || [])
    .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
    .join("\n\n");

  const businessDescription =
    (botConfig as any).company_description?.trim() || botConfig.description?.trim() || undefined;
  const businessHours =
    botConfig.business_hours?.trim() || undefined;
  const policies =
    (botConfig as any).policies?.trim() || botConfig.pricing_details?.trim() || undefined;
  const rawBookingLink = botConfig.booking_link?.trim();
  const bookingLink = isValidHttpsUrl(rawBookingLink) ? rawBookingLink : undefined;

  const systemInstruction = buildAssistantSystemInstruction({
    businessName,
    businessDescription,
    businessHours,
    policies,
    bookingLink,
    formattedServices,
    formattedFaqs,
    activePlaybook,
    tone: botConfig.tone,
  });

  let replyText = "";
  if (geminiKey) {
    try {
      const sanitized = redactPii(inboundText);
      const aiResponse = await callGeminiAPI(geminiKey, sanitized, systemInstruction, history);
      if (aiResponse) {
        replyText = aiResponse;
      }
    } catch {
      // Non-fatal
    }
  }

  // Fallover message if LLM is unavailable
  if (!replyText) {
    replyText = `Thank you for reaching out to ${businessName}. Our team has received your message and will follow up with you shortly.`;
  }

  // 8. Dispatch Outbound Reply to WhatsApp
  const sendResult = await sendWhatsAppOutbound({
    supabase,
    workspaceId,
    integrationId,
    threadId,
    recipientPhone,
    text: replyText,
    inboundWamid,
  });

  // 9. If send succeeded, atomically record verified usage in billing ledger
  if (sendResult.deliveryStatus === "sent") {
    try {
      await recordVerifiedWorkspaceUsage(supabase, {
        workspaceId,
        metricName: "whatsapp_outbound",
        quantity: 1,
        idempotencyKey: `usage_${sendResult.outboundWamid || inboundWamid}`,
        metadata: {
          wamid: sendResult.outboundWamid,
          inboundWamid,
          channel: "whatsapp",
        },
      });
    } catch {
      // Usage recording notice
    }
  }

  // 10. Update service conversion journey state with effective services
  try {
    const effectiveCatalog = effectiveServicesList.map((s, idx) => ({
      key: (s as any).id || s.name || `svc_${idx}`,
      name: s.name,
      price: extractConfiguredPrice(s.price),
      priceDisplay: typeof s.price === "string" ? s.price : (s.price !== null && s.price !== undefined ? `$${s.price}` : undefined),
      durationMinutes: s.duration ? parseInt(s.duration, 10) || undefined : undefined,
      description: s.description,
      requiresQuote: !s.price || String(s.price).toLowerCase().includes("quote"),
    }));

    const extracted = extractServiceIntent({
      text: inboundText,
      playbook: activePlaybook,
      effectiveServices: effectiveCatalog,
      bookingLink: bookingLink || null,
      replyText,
    });

    await updateServiceJourneyLifecycleState(supabase, {
      workspaceId,
      threadId,
      status: extracted.suggestedStatus,
      requestedService: extracted.requestedService,
      preferredDate: extracted.preferredDate,
      preferredTime: extracted.preferredTime,
      estimatedServiceValue: extracted.estimatedServiceValue,
      qualificationCompleteness: extracted.qualificationCompleteness,
      bookingOfferedAt: extracted.offeredBookingLink ? new Date().toISOString() : undefined,
      actorType: "ai_assistant",
      reason: "Automated service qualification and response",
    });
  } catch (lifecycleErr) {
    console.warn("[WhatsApp Assistant] Journey update notice:", lifecycleErr);
  }

  return {
    replyText,
    ...sendResult,
  };
}

/**
 * Builds the fully grounded system instruction incorporating workspace services, hours, faqs, policies, and booking link.
 * Strictly adheres to truthfulness: missing fields are marked "Not configured" and model is forbidden from inventing facts.
 */
export function buildAssistantSystemInstruction(params: {
  workspaceMetadata?: any;
  playbookKey?: string;
  businessName?: string;
  businessDescription?: string;
  businessHours?: string;
  policies?: string;
  bookingLink?: string;
  formattedServices?: string;
  formattedFaqs?: string;
  services?: any[];
  faqs?: any[];
  pricingNotes?: string;
  escalationInstructions?: string;
  activePlaybook?: ServicePlaybook;
  playbook?: ServicePlaybook;
  tone?: string;
}): string {
  const meta = params.workspaceMetadata || {};
  const activePlaybook =
    params.activePlaybook ||
    params.playbook ||
    (params.playbookKey ? getPlaybook(params.playbookKey) : defaultPlaybook);
  const businessName =
    params.businessName || meta.business_name || meta.name || "Our Business";
  const businessDescription =
    params.businessDescription?.trim() ||
    meta.business_description?.trim() ||
    meta.description?.trim() ||
    "Not configured. (Do NOT invent business descriptions, background, or marketing claims.)";
  const businessHours =
    params.businessHours?.trim() ||
    meta.business_hours?.trim() ||
    "Not configured. (Do NOT state specific operating days or hours as fact. If asked, state that hours are not configured or offer to have a team member follow up.)";
  const policies =
    params.policies?.trim() ||
    meta.policies?.trim() ||
    meta.cancellation_policy?.trim() ||
    "Not configured. (Do NOT invent cancellation, deposit, or rescheduling policies.)";

  const rawBookingLink = params.bookingLink?.trim() || meta.booking_url?.trim() || meta.booking_link?.trim();
  const validatedBookingLink = isValidHttpsUrl(rawBookingLink) ? rawBookingLink : undefined;
  const tone = params.tone || meta.tone || "professional, warm, helpful, and concise";

  let formattedServices = params.formattedServices || "";
  const servicesList = params.services || meta.services;
  if (!formattedServices && Array.isArray(servicesList) && servicesList.length > 0) {
    formattedServices = servicesList
      .map((s: any) => {
        const price = s.price !== undefined && s.price !== null ? ` - $${s.price}` : "";
        const dur = s.durationMinutes || s.duration ? ` (${s.durationMinutes || s.duration})` : "";
        const desc = s.description ? `: ${s.description}` : "";
        return `• ${s.name}${price}${dur}${desc}`;
      })
      .join("\n");
  }

  let formattedFaqs = params.formattedFaqs || "";
  const faqsList = params.faqs || meta.faqs;
  if (!formattedFaqs && Array.isArray(faqsList) && faqsList.length > 0) {
    formattedFaqs = faqsList
      .map((f: any) => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");
  }

  const serviceLabel = activePlaybook.terminology?.serviceLabel || "service";
  const bookingLabel = activePlaybook.terminology?.bookingLabel || "appointment";

  const pricingNotesBlock = params.pricingNotes ? `\nPRICING NOTES:\n${params.pricingNotes}\n` : "";
  const escalationBlock = params.escalationInstructions ? `\nESCALATION INSTRUCTIONS:\n${params.escalationInstructions}\n` : "";

  const bookingLinkBlock = validatedBookingLink
    ? `OFFICIAL BOOKING LINK:\n${validatedBookingLink}`
    : `OFFICIAL BOOKING LINK:\nNot configured.\n(CRITICAL: No online booking link is configured for this workspace. You MUST NOT state or claim an online booking link exists, and you MUST NOT provide placeholder or synthetic URLs. Collect the client's preferred ${serviceLabel}, date, and time, and offer to have a human specialist follow up to confirm.)`;

  const servicesBlock = formattedServices
    ? `AVAILABLE ${serviceLabel.toUpperCase()}S & PRICING:\n${formattedServices}`
    : `AVAILABLE ${serviceLabel.toUpperCase()}S & PRICING:\nNot configured.\n(CRITICAL: No specific services or prices are configured. Do NOT invent prices, packages, or availability. Ask the client what they need and offer human assistance.)`;

  return `You are the official 24/7 AI Receptionist & Service Booking Assistant representing "${businessName}" on WhatsApp.
Your role is to help clients with inquiries, consultations, and ${bookingLabel} scheduling.

ABOUT ${businessName.toUpperCase()}:
${businessDescription}

OPERATING HOURS:
${businessHours}

POLICIES:
${policies}

${servicesBlock}
${pricingNotesBlock}
FREQUENTLY ASKED QUESTIONS:
${formattedFaqs || "No specific FAQs listed."}

${bookingLinkBlock}
${escalationBlock}
INDUSTRY GUIDANCE:
${activePlaybook.systemPromptInstructions || ""}

CRITICAL SAFETY & GROUNDING RULES:
1. You represent "${businessName}". You MUST NOT mention J10 NEXUS unless "${businessName}" is explicitly J10 NEXUS.
2. Answer questions accurately and exclusively about "${businessName}", its configured services, pricing, business hours, and policies. Missing configuration must never be assumed, invented, or stated as fact.
3. If a question is in Spanish, answer in natural fluent Spanish. If in French, answer in French. Match the user's language automatically.
4. Tone: ${tone.toUpperCase()} (warm, professional, helpful, concise).
5. NEVER invent or hallucinate ${serviceLabel} prices, packages, discounts, operating hours, cancellation policies, or availability not provided in the knowledge base above.
6. NEVER claim an appointment or reservation is booked or confirmed unless explicitly confirmed by external calendar/system. ${validatedBookingLink ? `If the customer wants to book, provide the official booking link: ${validatedBookingLink}.` : `Since no booking link is configured, collect their preferred ${serviceLabel}, date, and time, and offer to connect them with a human specialist.`}
7. NEVER invent synthetic meeting or calendar URLs (e.g. meet.j10nexus.com, booking.j10nexus.com). Only provide the configured official HTTPS booking link if one exists: ${validatedBookingLink || "NONE CONFIGURED"}.
8. NEVER provide regulated medical, legal, or financial advice. Advise clients to consult a licensed professional for regulated questions.
9. NEVER claim a deposit was paid or charge cards over text.
10. If you are uncertain or the client asks for custom requests outside your knowledge, politely offer to connect them with a human specialist.

CONVERSION WORKFLOW:
- Inquire which ${serviceLabel} the client is looking for if not already specified.
- Ask for their preferred date and time or time window (e.g., morning/afternoon).
- When ${serviceLabel} and preference are discussed:
  ${validatedBookingLink ? `Offer the official booking link: ${validatedBookingLink}.` : `Offer to connect them with a human specialist to confirm scheduling. Do NOT claim an online booking link exists.`}`;
}

/**
 * Sends outbound message to WhatsApp via WHATSAPP_RUNTIME_ADAPTER or direct Graph API.
 * Stores outbound message in inbox_messages idempotently.
 */
async function sendWhatsAppOutbound(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  integrationId: string;
  threadId: string;
  recipientPhone: string;
  text: string;
  inboundWamid: string;
}): Promise<{ deliveryStatus: "sent" | "failed"; outboundWamid?: string; error?: string }> {
  const {
    supabase,
    workspaceId,
    integrationId,
    threadId,
    recipientPhone,
    text,
    inboundWamid,
  } = args;

  const outboundIdempotencyKey = `reply_${inboundWamid}`;

  // Check if outbound reply already recorded for this inbound wamid
  const { data: existingOutbound } = await supabase
    .from("inbox_messages")
    .select("id, external_message_id, delivery_status")
    .eq("workspace_id", workspaceId)
    .eq("idempotency_key", outboundIdempotencyKey)
    .maybeSingle();

  if (existingOutbound?.external_message_id) {
    return {
      deliveryStatus: existingOutbound.delivery_status === "sent" ? "sent" : "failed",
      outboundWamid: existingOutbound.external_message_id,
    };
  }

  // Resolve integration credentials & config
  const { data: integrationRow } = await supabase
    .from("integrations")
    .select("id, workspace_id, public_configuration, environment")
    .eq("id", integrationId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!integrationRow) {
    return { deliveryStatus: "failed", error: "integration_not_found" };
  }

  let credentials;
  try {
    credentials = await getIntegrationCredentials(supabase, workspaceId, integrationId);
  } catch (credErr) {
    return {
      deliveryStatus: "failed",
      error: credErr instanceof Error ? credErr.message : "credential_retrieval_failed",
    };
  }

  const accessToken = credentials?.values?.access_token?.trim();
  const publicConfig = (integrationRow.public_configuration || {}) as Record<string, any>;
  const phoneNumberId = publicConfig.phone_number_id ? String(publicConfig.phone_number_id).trim() : "";

  if (!accessToken || !phoneNumberId) {
    return {
      deliveryStatus: "failed",
      error: "whatsapp_credentials_or_phone_id_missing",
    };
  }

  const digits = recipientPhone.replace(/\D/g, "");
  const version = publicConfig.graph_api_version || process.env.META_WHATSAPP_GRAPH_API_VERSION || "v26.0";
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digits,
    type: "text",
    text: {
      preview_url: false,
      body: text,
    },
  };

  let outboundWamid: string | undefined = undefined;
  let deliveryError: string | null = null;
  let isDelivered = false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.messages?.[0]?.id) {
      isDelivered = true;
      outboundWamid = String(data.messages[0].id);
    } else {
      deliveryError = data?.error?.message || `HTTP ${res.status}`;
    }
  } catch (networkErr: any) {
    deliveryError = networkErr?.message || "network_send_failure";
  }

  // Insert outbound message into inbox_messages
  try {
    await supabase.from("inbox_messages").insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      direction: "outbound",
      provider: "whatsapp",
      external_message_id: outboundWamid || null,
      idempotency_key: outboundIdempotencyKey,
      content: text,
      delivery_status: isDelivered ? "sent" : "failed",
      last_delivery_error: deliveryError,
      message_type: "text",
      metadata: {
        inbound_wamid: inboundWamid,
        recipient_phone: digits,
        is_ai_generated: true,
      },
    });

    // Update thread last_message_at
    await supabase
      .from("inbox_threads")
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq("id", threadId)
      .eq("workspace_id", workspaceId);
  } catch (dbErr) {
    // Database record notice
  }

  if (isDelivered && outboundWamid) {
    return { deliveryStatus: "sent", outboundWamid };
  }

  return { deliveryStatus: "failed", error: deliveryError || "send_failed" };
}
