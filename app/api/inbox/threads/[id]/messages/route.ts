import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { id: threadId } = await params;
    const body = await req.json();
    const {
      body: messageText,
      direction = "outbound",
      agentName = "Sarah Chen (Sales Specialist)",
      stripePayment,
      externalMessageId,
    } = body;

    if (!messageText || typeof messageText !== "string" || !messageText.trim()) {
      return NextResponse.json(
        { success: false, error: "Message content cannot be empty." },
        { status: 400 }
      );
    }

    const wsId = context.workspace.id;
    const supabase = createServerSupabaseClient();

    // 1. Verify thread belongs to active workspace
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, workspace_id, metadata, unread_count")
      .eq("id", threadId)
      .eq("workspace_id", wsId)
      .maybeSingle();

    if (threadError || !thread) {
      return NextResponse.json(
        { success: false, error: "Thread not found in active workspace." },
        { status: 404 }
      );
    }

    // 2. Idempotency check for external messages
    if (externalMessageId) {
      const { data: existing } = await supabase
        .from("inbox_messages")
        .select("id, thread_id, direction, content, created_at, delivery_status")
        .eq("workspace_id", wsId)
        .eq("external_message_id", externalMessageId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          message: {
            id: existing.id,
            threadId: existing.thread_id,
            direction: existing.direction,
            body: existing.content,
            timestamp: existing.created_at,
            status: existing.delivery_status,
          },
        });
      }
    }

    // 3. Persist message
    const metadata: Record<string, any> = {
      senderName: agentName,
    };
    if (stripePayment) {
      metadata.stripeCheckoutUrl = stripePayment.checkoutUrl;
      metadata.amount = stripePayment.amount;
      metadata.currency = "USD";
      metadata.productName = stripePayment.productName;
    }

    const { data: newMsg, error: msgError } = await supabase
      .from("inbox_messages")
      .insert({
        workspace_id: wsId,
        thread_id: threadId,
        direction,
        provider: "internal",
        external_message_id: externalMessageId || null,
        content: messageText.trim(),
        delivery_status: "sent",
        message_type: stripePayment ? "payment_request" : "text",
        metadata,
      })
      .select("*")
      .single();

    if (msgError || !newMsg) {
      console.error("Failed to insert message:", msgError);
      return NextResponse.json(
        { success: false, error: "Failed to persist message." },
        { status: 500 }
      );
    }

    // 4. Update thread timestamp, snippet, and unread count
    const updatedSnippet = messageText.trim().slice(0, 200);
    const updatedMetadata = {
      ...(thread.metadata || {}),
      lastMessageSnippet: updatedSnippet,
    };

    await supabase
      .from("inbox_threads")
      .update({
        last_message_at: new Date().toISOString(),
        metadata: updatedMetadata,
        unread_count: direction === "inbound" ? (thread.unread_count || 0) + 1 : 0,
      })
      .eq("id", threadId)
      .eq("workspace_id", wsId);

    return NextResponse.json({
      success: true,
      message: {
        id: newMsg.id,
        threadId: newMsg.thread_id,
        direction: newMsg.direction,
        sender: direction === "inbound" ? "customer" : "agent",
        senderName: agentName,
        body: newMsg.content,
        timestamp: newMsg.created_at,
        status: newMsg.delivery_status,
        metadata: newMsg.metadata,
      },
    });
  } catch (error) {
    console.error("POST /api/inbox/threads/[id]/messages error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
