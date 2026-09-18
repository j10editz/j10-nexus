import { NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationConnection } from "@/types/integration";
import { processWhatsAppAiJobsOnce } from "@/lib/whatsapp/ai-worker";

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
 *    a. Extract wamid, fromPhone, textBody, contactName, and normalized media metadata.
 *    b. Atomically commit lead intake, CRM contact, inbox thread, inbox message,
 *       service conversion journey, and AI job via record_canonical_whatsapp_inbound_atomic.
 *    c. Enforce strict idempotency and payload conflict detection.
 *    d. Low-latency accelerator using Next.js after().
 *    e. Fast 200 acknowledgement with { success: true, accepted: true, wamid, threadId, jobId }.
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
      wamid,
      from: fromPhone,
      type: messageType,
      body: textBody,
      media: mediaMetadata,
    })).digest("hex");

    let origin = "https://j10-nexus.vercel.app";
    try {
      origin = new URL(requestUrl).origin;
    } catch {}

    // Atomic Canonical Ingestion via PostgreSQL RPC
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
      }
    );

    if (intakeError) {
      if (
        intakeError.code === "23505" ||
        intakeError.message?.includes("wamid payload conflict") ||
        intakeError.message?.includes("conflict")
      ) {
        return NextResponse.json(
          {
            success: true,
            accepted: true,
            quarantined: true,
            reason: "wamid_payload_conflict",
          },
          { status: 200 }
        );
      }

      console.error("[WhatsApp Webhook] Canonical inbound transaction failure:", intakeError);
      return NextResponse.json(
        { error: "Internal ingestion failure: message could not be durably committed" },
        { status: 500 }
      );
    }

    if (intakeData?.duplicate) {
      return NextResponse.json(
        {
          success: true,
          accepted: true,
          duplicate: true,
          wamid,
        },
        { status: 200 }
      );
    }

    if (!intakeData?.message_id) {
      await supabase.from("inbox_messages").insert({
        workspace_id: workspaceId,
        thread_id: intakeData?.thread_id || null,
        direction: "inbound",
        provider: "whatsapp",
        external_message_id: wamid,
        content: textBody,
        delivery_status: "delivered",
        idempotency_key: `wamid_${wamid}`,
        created_at: new Date().toISOString(),
      });
    }

    // Acknowledge unsupported non-text message without triggering AI job
    if (messageType !== "text") {
      return NextResponse.json(
        {
          success: true,
          accepted: true,
          event: "unsupported_message_type_ignored",
          messageType,
          threadId: intakeData?.thread_id,
          messageId: intakeData?.message_id,
        },
        { status: 200 }
      );
    }

    let jobId = intakeData?.job_id || null;
    if (!jobId) {
      const aiJobIdempotencyKey = `whatsapp-ai:${workspaceId}:${wamid}`;
      const { data: jobData, error: jobError } = await supabase
        .from("whatsapp_ai_jobs")
        .insert({
          workspace_id: workspaceId,
          integration_id: endpoint.integrationId || null,
          thread_id: intakeData?.thread_id || null,
          recipient_phone: fromPhone,
          inbound_text: textBody,
          sender_name: contactName,
          inbound_wamid: wamid,
          idempotency_key: aiJobIdempotencyKey,
          status: "pending",
          next_attempt_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (jobError) {
        if (
          jobError.code === "23505" ||
          jobError.message?.includes("unique") ||
          jobError.message?.includes("duplicate")
        ) {
          return NextResponse.json(
            {
              success: true,
              accepted: true,
              duplicate: true,
              wamid,
            },
            { status: 200 }
          );
        }

        console.error("[WhatsApp Webhook] Durable AI job enqueue failed code:", jobError.code || "DB_ERROR");
        return NextResponse.json(
          { error: "Internal enqueue failure: message could not be durably queued" },
          { status: 500 }
        );
      }
      jobId = jobData?.id || null;
    }

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
        // In non-supported contexts, outbox guarantees durability
      }
    }

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        wamid,
        threadId: intakeData?.thread_id,
        jobId,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { success: true, accepted: true, event: "whatsapp_generic_event" },
    { status: 200 }
  );
}
