import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationConnection } from "@/types/integration";
import { processWhatsAppAiJobsOnce } from "@/lib/whatsapp/ai-worker";
import { persistCanonicalWhatsAppInbound } from "@/lib/omnichannel/provider-contract";

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
 *    a. Extract wamid, fromPhone, textBody, contactName.
 *    b. Handle unsupported message types safely without AI invocation.
 *    c. Verify wamid idempotency in inbox_messages (reject or deduplicate).
 *    d. Stage 1 Lead Intake & Contact persistence.
 *    e. Unified Inbox Thread & Message persistence.
 *    f. Durable Outbox Enqueue: whatsapp_ai_jobs (never acknowledge unqueued messages).
 *    g. Low-latency accelerator using Next.js after().
 *    h. Fast 200 acknowledgement with { success: true, accepted: true, wamid, threadId, jobId }.
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

    // Handle unsupported message types (e.g. image, video, audio, sticker) safely
    if (messageType !== "text") {
      const fallbackContent = `[${messageType} message]`;

      const { data: existingUnsupported } = await supabase
        .from("inbox_messages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("external_message_id", wamid)
        .maybeSingle();

      if (!existingUnsupported) {
        const { data: existingThread } = await supabase
          .from("inbox_threads")
          .select("id, unread_count")
          .eq("workspace_id", workspaceId)
          .eq("channel", "whatsapp")
          .eq("external_thread_id", fromPhone)
          .maybeSingle();

        let threadId: string;
        if (existingThread) {
          threadId = existingThread.id;
          await supabase
            .from("inbox_threads")
            .update({
              last_message_at: new Date().toISOString(),
              unread_count: (existingThread.unread_count || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", threadId)
            .eq("workspace_id", workspaceId);
        } else {
          const { data: newTh } = await supabase
            .from("inbox_threads")
            .insert({
              workspace_id: workspaceId,
              channel: "whatsapp",
              external_thread_id: fromPhone,
              status: "active",
              priority: "medium",
              unread_count: 1,
              last_message_at: new Date().toISOString(),
              metadata: {
                senderName: contactName,
                integrationId: endpoint.integrationId,
              },
            })
            .select("id")
            .single();
          threadId = newTh?.id || "";
        }

        if (threadId) {
          await supabase.from("inbox_messages").insert({
            workspace_id: workspaceId,
            thread_id: threadId,
            direction: "inbound",
            provider: "whatsapp",
            external_message_id: wamid,
            content: fallbackContent,
            delivery_status: "delivered",
            idempotency_key: `wamid_${wamid}`,
            created_at: new Date().toISOString(),
          });
        }
      }

      return NextResponse.json(
        {
          success: true,
          accepted: true,
          event: "unsupported_message_type_ignored",
          messageType,
        },
        { status: 200 }
      );
    }

    const textBody =
      typeof message.text?.body === "string" ? message.text.body.trim() : "";

    // 3. Idempotency Check on provider message ID (wamid)
    const { data: existingMsg } = await supabase
      .from("inbox_messages")
      .select("id, content")
      .eq("workspace_id", workspaceId)
      .eq("external_message_id", wamid)
      .maybeSingle();

    if (existingMsg) {
      if (existingMsg.content !== textBody) {
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

      return NextResponse.json(
        {
          success: true,
          accepted: true,
          duplicate: true,
        },
        { status: 200 }
      );
    }

    // 4. Stage 1 Lead Intake & Contact Persistence
    let contactId: string | null = null;
    let origin = "https://j10-nexus.vercel.app";
    try {
      origin = new URL(requestUrl).origin;
    } catch {}

    try {
      const intakeResult = await persistCanonicalWhatsAppInbound(supabase, {
        workspaceId,
        payload,
        origin,
      });
      contactId =
        typeof intakeResult?.contact_id === "string" ? intakeResult.contact_id : null;
    } catch (intakeErr) {
      console.warn("[WhatsApp Webhook] Canonical lead intake notice stage: lead_intake");
    }

    // 5. Unified Inbox Thread & Message Persistence
    let threadId: string;
    const { data: existingThread } = await supabase
      .from("inbox_threads")
      .select("id, unread_count, metadata")
      .eq("workspace_id", workspaceId)
      .eq("channel", "whatsapp")
      .eq("external_thread_id", fromPhone)
      .maybeSingle();

    if (existingThread) {
      threadId = existingThread.id;
      await supabase
        .from("inbox_threads")
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: (existingThread.unread_count || 0) + 1,
          metadata: {
            ...(existingThread.metadata || {}),
            lastMessageSnippet: textBody.slice(0, 100),
            senderName: contactName,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", threadId)
        .eq("workspace_id", workspaceId);
    } else {
      const { data: newThread, error: thError } = await supabase
        .from("inbox_threads")
        .insert({
          workspace_id: workspaceId,
          contact_id: contactId,
          channel: "whatsapp",
          external_thread_id: fromPhone,
          status: "active",
          priority: "medium",
          unread_count: 1,
          last_message_at: new Date().toISOString(),
          metadata: {
            senderName: contactName,
            lastMessageSnippet: textBody.slice(0, 100),
            integrationId: endpoint.integrationId,
          },
        })
        .select("id")
        .single();

      if (thError || !newThread) {
        throw new Error(`Failed to create WhatsApp inbox thread.`);
      }
      threadId = newThread.id;
    }

    await supabase.from("inbox_messages").insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      direction: "inbound",
      provider: "whatsapp",
      external_message_id: wamid,
      content: textBody,
      delivery_status: "delivered",
      idempotency_key: `wamid_${wamid}`,
      created_at: new Date().toISOString(),
    });

    // 6. Durable Outbox Enqueue: whatsapp_ai_jobs
    const aiJobIdempotencyKey = `whatsapp-ai:${workspaceId}:${wamid}`;
    const { data: jobData, error: jobError } = await supabase
      .from("whatsapp_ai_jobs")
      .insert({
        workspace_id: workspaceId,
        integration_id: endpoint.integrationId || null,
        thread_id: threadId,
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

    // 7. Low-latency accelerator using Next.js after()
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

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        wamid,
        threadId,
        jobId: jobData?.id,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { success: true, accepted: true, event: "whatsapp_generic_event" },
    { status: 200 }
  );
}
