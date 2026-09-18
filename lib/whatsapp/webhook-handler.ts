import { NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationConnection } from "@/types/integration";
import { processWhatsAppAiJobsOnce } from "@/lib/whatsapp/ai-worker";
import { resolveAuthoritativePlaybookKey } from "@/lib/service-business/playbooks/registry";

export interface ProcessWhatsAppPayloadOptions {
  supabase: SupabaseClient;
  connection: IntegrationConnection;
  endpoint: { id: string; integrationId?: string; endpointKey?: string };
  payload: Record<string, any>;
  requestUrl: string;
}

/**
 * Reusable durable pipeline for WhatsApp Inbound & Status webhooks.
 *
 * Pipeline:
 * 1. Status Callbacks -> Update delivery_status in inbox_messages.
 * 2. Inbound Messages ->
 *    a. Authoritatively resolve workspace/integration playbook.
 *    b. Atomically commit lead intake, CRM contact, integration-scoped thread, inbox message,
 *       service conversion journey, and AI job via record_canonical_whatsapp_inbound_atomic.
 *    c. Enforce strict idempotency (200 on identical duplicate, 409 on payload conflict).
 *    d. Validate atomic RPC return (zero non-atomic fallback inserts).
 *    e. Low-latency accelerator using Next.js after().
 *    f. Return structured acknowledgement.
 */
export async function processWhatsAppPayload({
  supabase,
  connection,
  endpoint,
  payload,
  requestUrl,
}: ProcessWhatsAppPayloadOptions): Promise<Response> {
  const workspaceId = connection.workspaceId;
  const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
  const changes = Array.isArray(entry?.changes) ? entry.changes[0] : null;
  const value = changes?.value || {};
  const messages = Array.isArray(value.messages) ? value.messages : [];
  const statuses = Array.isArray(value.statuses) ? value.statuses : [];
  const contacts = Array.isArray(value.contacts) ? value.contacts : [];

  // 1. Handle Meta Delivery / Status Callbacks
  if (statuses.length > 0) {
    for (const st of statuses) {
      const statusWamid = typeof st.id === "string" ? st.id : null;
      const deliveryStatus = typeof st.status === "string" ? st.status : null;

      if (statusWamid && deliveryStatus) {
        await supabase
          .from("inbox_messages")
          .update({
            delivery_status: deliveryStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .eq("external_message_id", statusWamid);
      }
    }

    return NextResponse.json(
      { success: true, accepted: true, event: "status_callback" },
      { status: 200 }
    );
  }

  // 2. Handle Inbound WhatsApp Messages
  if (messages.length > 0) {
    const message = messages[0];
    const wamid = typeof message.id === "string" ? message.id.trim() : null;
    const fromPhone = typeof message.from === "string" ? message.from.trim() : null;
    const messageType = typeof message.type === "string" ? message.type : "unknown";
    const contactName =
      (contacts[0]?.profile?.name as string | undefined) || "WhatsApp User";

    if (!wamid || !fromPhone) {
      return NextResponse.json(
        { success: true, accepted: true, ignored: true, reason: "missing_wamid_or_sender" },
        { status: 200 }
      );
    }

    let textBody = "";
    let mediaMetadata: Record<string, any> = {};

    if (messageType === "text") {
      textBody = typeof message.text?.body === "string" ? message.text.body.trim() : "";
    } else if (messageType === "image") {
      textBody = typeof message.image?.caption === "string" ? message.image.caption.trim() : "[image message]";
      mediaMetadata = {
        providerMediaId: message.image?.id || null,
        mimeType: message.image?.mime_type || "image/jpeg",
        caption: message.image?.caption || null,
        sha256: message.image?.sha256 || null,
      };
    } else if (messageType === "document") {
      textBody = typeof message.document?.caption === "string"
        ? message.document.caption.trim()
        : (message.document?.filename || "[document message]");
      mediaMetadata = {
        providerMediaId: message.document?.id || null,
        mimeType: message.document?.mime_type || null,
        filename: message.document?.filename || null,
        caption: message.document?.caption || null,
      };
    } else if (messageType === "audio" || messageType === "voice") {
      const audioObj = message.audio || message.voice;
      textBody = "[audio message]";
      mediaMetadata = {
        providerMediaId: audioObj?.id || null,
        mimeType: audioObj?.mime_type || null,
      };
    } else {
      textBody = `[${messageType} message]`;
      mediaMetadata = {
        messageType,
      };
    }

    const payloadHash = createHash("sha256").update(JSON.stringify({
      from: fromPhone,
      text: textBody,
      type: messageType,
      media: mediaMetadata,
    })).digest("hex");

    let origin = "https://j10-nexus.vercel.app";
    try {
      origin = new URL(requestUrl).origin;
    } catch {}

    // Step A: Authoritatively resolve the workspace & integration playbook
    let workspaceMetadata: Record<string, unknown> | null = null;
    let integrationConfig: Record<string, unknown> | null = null;

    try {
      const { data: wsRow } = await supabase
        .from("workspaces")
        .select("metadata")
        .eq("id", workspaceId)
        .maybeSingle();
      if (wsRow?.metadata) {
        workspaceMetadata = wsRow.metadata as Record<string, unknown>;
      }
    } catch {}

    if (endpoint.integrationId) {
      try {
        const { data: integRow } = await supabase
          .from("integrations")
          .select("public_configuration")
          .eq("id", endpoint.integrationId)
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        if (integRow?.public_configuration) {
          integrationConfig = integRow.public_configuration as Record<string, unknown>;
        }
      } catch {}
    }

    const canonicalPlaybookKey = resolveAuthoritativePlaybookKey({
      workspaceMetadata,
      integrationConfig,
    });

    // Step B: Atomic Canonical Ingestion via PostgreSQL RPC
    const { data: intakeData, error: intakeError } = await supabase.rpc(
      "record_canonical_whatsapp_inbound_atomic",
      {
        p_workspace_id: workspaceId,
        p_wamid: wamid,
        p_from_phone: fromPhone,
        p_sender_name: contactName,
        p_message_type: messageType,
        p_content: textBody,
        p_media_metadata: mediaMetadata,
        p_payload_hash: payloadHash,
        p_integration_id: endpoint.integrationId || null,
        p_playbook_key: canonicalPlaybookKey,
      }
    );

    if (intakeError) {
      console.error("[WhatsApp Webhook] Canonical inbound transaction failure:", intakeError);
      return NextResponse.json(
        { error: "Internal ingestion failure: message could not be durably committed" },
        { status: 500 }
      );
    }

    // Step C: Handle Payload Conflict -> 409 Conflict
    if (intakeData?.conflict) {
      return NextResponse.json(
        {
          error: "WHATSAPP_WAMID_PAYLOAD_CONFLICT",
          message: "wamid payload conflict",
        },
        { status: 409 }
      );
    }

    // Step D: Handle Idempotent Duplicate -> 200 OK
    if (intakeData?.duplicate) {
      return NextResponse.json(
        {
          success: true,
          accepted: true,
          duplicate: true,
          wamid,
          threadId: intakeData.thread_id,
          jobId: intakeData.job_id || null,
        },
        { status: 200 }
      );
    }

    // Step E: Enforce strict atomic contract (zero fallback inserts permitted)
    if (
      !intakeData?.success ||
      !intakeData.thread_id ||
      !intakeData.message_id ||
      !intakeData.contact_id ||
      !intakeData.intake_id ||
      !intakeData.journey_id
    ) {
      console.error("[WhatsApp Webhook] Incomplete atomic ingestion response:", intakeData);
      return NextResponse.json(
        { error: "Internal ingestion failure: incomplete canonical record commitment" },
        { status: 500 }
      );
    }

    // Non-text messages don't require an AI job
    if (messageType !== "text") {
      return NextResponse.json(
        {
          success: true,
          accepted: true,
          event: "unsupported_message_type_ignored",
          messageType,
          threadId: intakeData.thread_id,
          messageId: intakeData.message_id,
          jobId: null,
          suppressionReason: intakeData.suppression_reason || "non_text_message",
        },
        { status: 200 }
      );
    }

    // For text messages where AI was required, ensure job_id was enqueued
    if (intakeData.ai_job_required && !intakeData.job_id) {
      console.error("[WhatsApp Webhook] AI job required but missing job_id:", intakeData);
      return NextResponse.json(
        { error: "Internal enqueue failure: AI job could not be enqueued" },
        { status: 500 }
      );
    }

    const jobId = intakeData.job_id || null;

    // Low-latency accelerator using Next.js after() for text AI jobs
    if (jobId) {
      try {
        after(async () => {
          try {
            const workerSecret =
              process.env.WHATSAPP_WORKER_SECRET?.trim() ||
              process.env.TELEGRAM_WORKER_SECRET?.trim();

            if (workerSecret) {
              await fetch(`${origin}/api/workers/whatsapp-ai`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${workerSecret}`,
                  "Content-Type": "application/json",
                },
              });
            } else {
              await processWhatsAppAiJobsOnce(supabase, { limit: 1, leaseSeconds: 120 });
            }
          } catch (accelErr) {
            console.warn("[WhatsApp Webhook] Low-latency after() worker notice stage: worker_trigger");
          }
        });
      } catch {
        // Outbox guarantees durability
      }
    }

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        wamid,
        threadId: intakeData.thread_id,
        jobId,
        journeyId: intakeData.journey_id,
        playbookKey: canonicalPlaybookKey,
        suppressionReason: intakeData.suppression_reason || null,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { success: true, accepted: true, ignored: true, reason: "no_messages_or_statuses_in_payload" },
    { status: 200 }
  );
}
