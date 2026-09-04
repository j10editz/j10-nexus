import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";

export async function GET(
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
    const wsId = context.workspace.id;
    const supabase = createServerSupabaseClient();

    // 1. Fetch thread strictly scoped to active workspace
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        workspace_id,
        contact_id,
        channel,
        external_thread_id,
        status,
        priority,
        unread_count,
        last_message_at,
        assigned_user_id,
        metadata,
        created_at,
        updated_at,
        contact:contacts(*)
      `)
      .eq("id", threadId)
      .eq("workspace_id", wsId)
      .maybeSingle();

    if (threadError || !thread) {
      return NextResponse.json(
        { success: false, error: "Thread not found in active workspace." },
        { status: 404 }
      );
    }

    // 2. Fetch messages for thread
    const { data: rawMessages, error: msgError } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching inbox messages:", msgError);
    }

    // 3. Fetch checkouts and ledger associated with thread
    const { data: checkouts } = await supabase
      .from("payment_checkouts")
      .select("*")
      .eq("thread_id", threadId)
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });

    // 4. Mark unread_count = 0
    if (thread.unread_count > 0) {
      await supabase
        .from("inbox_threads")
        .update({ unread_count: 0 })
        .eq("id", threadId)
        .eq("workspace_id", wsId);
    }

    const contact = (thread as any).contact || {};
    const messages = (rawMessages || []).map((m: any) => ({
      id: m.id,
      threadId: m.thread_id,
      direction: m.direction,
      sender: m.direction === "inbound" ? contact.phone || contact.email || "customer" : "agent",
      senderName: m.metadata?.senderName || (m.direction === "inbound" ? contact.name || "Customer" : "Executive Agent"),
      body: m.content,
      timestamp: m.created_at,
      status: m.delivery_status || "delivered",
      metadata: m.metadata || undefined,
    }));

    const formattedThread = {
      id: thread.id,
      workspaceId: thread.workspace_id,
      contactName: contact.name || "Unknown Contact",
      contactIdentifier: contact.phone || contact.email || thread.external_thread_id || "",
      company: contact.company || "",
      channel: thread.channel,
      priority: thread.priority,
      dealStage: contact.deal_stage || thread.metadata?.dealStage || "lead",
      estimatedValue: Number(contact.estimated_value || thread.metadata?.estimatedValue || 0),
      unreadCount: 0,
      assignedSpecialist: thread.metadata?.assignedSpecialist || "AI Sales Specialist",
      lastMessageSnippet: thread.metadata?.lastMessageSnippet || "",
      lastMessageTimestamp: thread.last_message_at,
      messages,
      checkouts: checkouts || [],
    };

    return NextResponse.json({
      success: true,
      thread: formattedThread,
    });
  } catch (error) {
    console.error("GET /api/inbox/threads/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
