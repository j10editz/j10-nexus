import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxChannel, InboxPriority } from "@/types/inbox";
import { attachSlaToThread } from "./sla";
import { routeAndAssignThread } from "./routing";

export interface NormalizedInboundMessage {
  channel: InboxChannel;
  externalThreadId: string;
  senderIdentifier: string;
  senderName: string;
  company?: string;
  content: string;
  priority?: InboxPriority;
  metadata?: Record<string, any>;
}

/**
 * Normalizes raw channel-specific webhook payloads into canonical format
 */
export function normalizeInboundPayload(
  channel: InboxChannel,
  payload: Record<string, any>,
): NormalizedInboundMessage {
  switch (channel) {
    case "email": {
      const from = payload.from || payload.sender || "unknown@example.com";
      const subject = payload.subject || "No Subject";
      const body = payload.text || payload.body || payload.html || "";
      const name = payload.fromName || from.split("@")[0] || "Email Contact";
      const messageId = payload.messageId || payload.id || `email_${Date.now()}`;

      return {
        channel: "email",
        externalThreadId: payload.threadId || from,
        senderIdentifier: from,
        senderName: name,
        content: body,
        priority: payload.priority || "medium",
        metadata: {
          subject,
          emailMessageId: messageId,
          headers: payload.headers,
        },
      };
    }

    case "sms": {
      const from = payload.From || payload.from || "+10000000000";
      const body = payload.Body || payload.body || "";
      const sid = payload.MessageSid || payload.smsId || `sms_${Date.now()}`;

      return {
        channel: "sms",
        externalThreadId: from,
        senderIdentifier: from,
        senderName: payload.senderName || from,
        content: body,
        priority: payload.priority || "high",
        metadata: {
          smsMessageSid: sid,
          to: payload.To || payload.to,
        },
      };
    }

    case "webchat": {
      const visitorId = payload.visitorId || `visitor_${Date.now()}`;
      const name = payload.visitorName || "Website Visitor";
      const message = payload.message || payload.content || "";

      return {
        channel: "webchat",
        externalThreadId: visitorId,
        senderIdentifier: payload.email || visitorId,
        senderName: name,
        company: payload.company,
        content: message,
        priority: "medium",
        metadata: {
          pageUrl: payload.pageUrl,
          userAgent: payload.userAgent,
          visitorId,
        },
      };
    }

    case "instagram": {
      const senderId = payload.sender?.id || payload.sender_id || `ig_${Date.now()}`;
      const text = payload.message?.text || payload.text || "";
      const mid = payload.message?.mid || payload.mid || `mid_${Date.now()}`;

      return {
        channel: "instagram",
        externalThreadId: senderId,
        senderIdentifier: senderId,
        senderName: payload.username || `IG User @${senderId.slice(-6)}`,
        content: text,
        priority: "medium",
        metadata: {
          instagramMid: mid,
          recipientId: payload.recipient?.id,
        },
      };
    }

    case "messenger": {
      const senderId = payload.sender?.id || payload.sender_id || `fb_${Date.now()}`;
      const text = payload.message?.text || payload.text || "";
      const mid = payload.message?.mid || payload.mid || `mid_${Date.now()}`;

      return {
        channel: "messenger",
        externalThreadId: senderId,
        senderIdentifier: senderId,
        senderName: payload.senderName || `FB User ${senderId.slice(-4)}`,
        content: text,
        priority: "medium",
        metadata: {
          messengerMid: mid,
          recipientId: payload.recipient?.id,
        },
      };
    }

    case "whatsapp_group": {
      const groupId = payload.groupId || payload.group_id || `grp_${Date.now()}`;
      const groupName = payload.groupName || payload.group_name || "Enterprise VIP Group";
      const senderPhone = payload.participant || payload.sender || "+10000000000";
      const senderName = payload.participantName || senderPhone;
      const text = payload.text || payload.body || "";

      return {
        channel: "whatsapp_group",
        externalThreadId: groupId,
        senderIdentifier: senderPhone,
        senderName: `${senderName} [${groupName}]`,
        company: groupName,
        content: text,
        priority: payload.priority || "urgent",
        metadata: {
          groupId,
          groupName,
          participantPhone: senderPhone,
          isMentioned: payload.isMentioned ?? true,
        },
      };
    }

    case "whatsapp":
    default: {
      const sender = payload.from || payload.sender || "+10000000000";
      const text = payload.text || payload.body || "";
      const name = payload.senderName || payload.name || sender;

      return {
        channel: "whatsapp",
        externalThreadId: sender,
        senderIdentifier: sender,
        senderName: name,
        company: payload.company,
        content: text,
        priority: payload.priority || "high",
        metadata: {
          whatsappId: payload.id,
        },
      };
    }
  }
}

/**
 * Ingests normalized inbound message into workspace unified inbox
 */
export async function ingestOmnichannelMessage(
  supabase: SupabaseClient,
  workspaceId: string,
  rawPayload: Record<string, any>,
  channel: InboxChannel,
): Promise<{
  threadId: string;
  messageId: string;
  contactId: string;
  isNewThread: boolean;
}> {
  const norm = normalizeInboundPayload(channel, rawPayload);
  const now = new Date().toISOString();
  const priority = norm.priority || "medium";

  // 1. Resolve or create contact
  let contactId: string | null = null;
  const isEmail = norm.senderIdentifier.includes("@");
  const phone = !isEmail ? norm.senderIdentifier : null;
  const email = isEmail ? norm.senderIdentifier : null;

  let contactQuery = supabase
    .from("contacts")
    .select("id, name, company, deal_stage")
    .eq("workspace_id", workspaceId);

  if (email) {
    contactQuery = contactQuery.eq("email", email);
  } else if (phone) {
    contactQuery = contactQuery.eq("phone", phone);
  } else {
    contactQuery = contactQuery.eq("name", norm.senderName);
  }

  const { data: existingContact } = await contactQuery.maybeSingle();

  if (existingContact) {
    contactId = existingContact.id;
  } else {
    const { data: newContact, error: cErr } = await supabase
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        name: norm.senderName,
        email: email,
        phone: phone,
        company: norm.company || null,
        deal_stage: "lead",
        status: "Lead",
        type: "Lead",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (!cErr && newContact) {
      contactId = newContact.id;
    }
  }

  // 2. Resolve or create thread
  let isNewThread = false;
  let threadId: string | null = null;

  const { data: existingThread } = await supabase
    .from("inbox_threads")
    .select("id, unread_count, metadata")
    .eq("workspace_id", workspaceId)
    .eq("channel", norm.channel)
    .eq("external_thread_id", norm.externalThreadId)
    .maybeSingle();

  if (existingThread) {
    threadId = existingThread.id;
    // Update thread last message and unread count
    await supabase
      .from("inbox_threads")
      .update({
        last_message_at: now,
        unread_count: (existingThread.unread_count || 0) + 1,
        metadata: {
          ...(existingThread.metadata || {}),
          lastMessageSnippet: norm.content,
          senderName: norm.senderName,
        },
        updated_at: now,
      })
      .eq("id", threadId)
      .eq("workspace_id", workspaceId);
  } else {
    isNewThread = true;
    const { data: newThread, error: tErr } = await supabase
      .from("inbox_threads")
      .insert({
        workspace_id: workspaceId,
        contact_id: contactId,
        channel: norm.channel,
        external_thread_id: norm.externalThreadId,
        priority: priority,
        status: "active",
        unread_count: 1,
        last_message_at: now,
        metadata: {
          lastMessageSnippet: norm.content,
          senderName: norm.senderName,
          company: norm.company,
          ...(norm.metadata || {}),
        },
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (tErr || !newThread) {
      throw new Error(`Failed to create thread: ${tErr?.message}`);
    }
    threadId = newThread.id;

    // Attach SLA Policy to new thread
    await attachSlaToThread(supabase, workspaceId, newThread.id, priority, norm.channel);

    // Run Intelligent Routing & Assignment
    await routeAndAssignThread(supabase, workspaceId, newThread.id, {
      channel: norm.channel,
      priority: priority,
      content: norm.content,
      contactName: norm.senderName,
    });
  }

  if (!threadId) {
    throw new Error("Failed to resolve or create thread.");
  }

  // 3. Insert message
  const { data: newMsg, error: mErr } = await supabase
    .from("inbox_messages")
    .insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      direction: "inbound",
      provider: norm.channel,
      external_message_id: norm.metadata?.emailMessageId || norm.metadata?.smsMessageSid || `msg_${Date.now()}`,
      content: norm.content,
      delivery_status: "delivered",
      message_type: "text",
      metadata: {
        ...(norm.metadata || {}),
        sender: norm.senderIdentifier,
        senderName: norm.senderName,
        channel: norm.channel,
      },
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (mErr || !newMsg) {
    throw new Error(`Failed to insert message: ${mErr?.message}`);
  }

  return {
    threadId,
    messageId: newMsg.id,
    contactId: contactId || "",
    isNewThread,
  };
}
