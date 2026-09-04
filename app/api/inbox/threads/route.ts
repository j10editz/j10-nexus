import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const channelFilter = searchParams.get("channel");
    const stageFilter = searchParams.get("stage");
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const priorityOnly = searchParams.get("priorityOnly") === "true";

    const supabase = createServerSupabaseClient();
    const wsId = context.workspace.id;

    // Build query scoped strictly to active workspace
    let query = supabase
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
        contact:contacts(
          id,
          name,
          email,
          phone,
          company,
          deal_stage,
          estimated_value
        )
      `)
      .eq("workspace_id", wsId)
      .order("last_message_at", { ascending: false });

    if (channelFilter && channelFilter !== "all") {
      query = query.eq("channel", channelFilter);
    }

    const { data: rawThreads, error } = await query;

    if (error) {
      console.error("Error fetching inbox threads:", error);
      return NextResponse.json(
        { success: false, error: "Failed to retrieve inbox threads." },
        { status: 500 }
      );
    }

    // Map into canonical format
    let threads = (rawThreads || []).map((t: any) => {
      const contact = t.contact || {};
      const dealStage = contact.deal_stage || t.metadata?.dealStage || "lead";
      const estimatedValue = Number(contact.estimated_value || t.metadata?.estimatedValue || 0);

      return {
        id: t.id,
        workspaceId: t.workspace_id,
        contactName: contact.name || "Unknown Contact",
        contactIdentifier: contact.phone || contact.email || t.external_thread_id || "",
        company: contact.company || "",
        channel: t.channel,
        priority: t.priority,
        dealStage,
        estimatedValue,
        unreadCount: t.unread_count || 0,
        assignedSpecialist: t.metadata?.assignedSpecialist || "AI Sales Specialist",
        lastMessageSnippet: t.metadata?.lastMessageSnippet || "Conversation started.",
        lastMessageTimestamp: t.last_message_at || t.created_at,
        messages: [],
      };
    });

    // Apply stage filter
    if (stageFilter && stageFilter !== "all") {
      threads = threads.filter((t) => t.dealStage === stageFilter);
    }

    // Apply priority filter
    if (priorityOnly) {
      threads = threads.filter((t) => t.priority === "urgent" || t.priority === "high");
    }

    // Apply search filter
    if (search) {
      threads = threads.filter((t) => {
        return (
          t.contactName.toLowerCase().includes(search) ||
          t.company.toLowerCase().includes(search) ||
          t.contactIdentifier.toLowerCase().includes(search) ||
          t.lastMessageSnippet.toLowerCase().includes(search)
        );
      });
    }

    return NextResponse.json({
      success: true,
      workspaceId: wsId,
      workspaceName: context.workspace.name,
      threads,
    });
  } catch (error) {
    console.error("GET /api/inbox/threads error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      contactName,
      contactIdentifier,
      company = "",
      channel = "whatsapp",
      priority = "medium",
      dealStage = "lead",
      estimatedValue = 0,
      initialMessage = "",
      assignedSpecialist = "Sarah Chen (Sales Specialist)",
    } = body;

    if (!contactName || !contactIdentifier) {
      return NextResponse.json(
        { success: false, error: "Contact name and identifier are required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const wsId = context.workspace.id;

    // 1. Create or resolve contact within active workspace
    const isEmail = contactIdentifier.includes("@");
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        workspace_id: wsId,
        name: contactName.trim(),
        email: isEmail ? contactIdentifier.trim() : null,
        phone: isEmail ? null : contactIdentifier.trim(),
        company: company.trim() || null,
        deal_stage: dealStage,
        estimated_value: estimatedValue,
        source: channel,
      })
      .select("*")
      .single();

    if (contactError || !contact) {
      console.error("Failed to insert contact:", contactError);
      return NextResponse.json(
        { success: false, error: "Failed to persist contact." },
        { status: 500 }
      );
    }

    // 2. Create thread
    const snippet = initialMessage.slice(0, 200) || "Conversation initiated.";
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .insert({
        workspace_id: wsId,
        contact_id: contact.id,
        channel,
        priority,
        status: "active",
        unread_count: initialMessage ? 1 : 0,
        metadata: {
          assignedSpecialist,
          lastMessageSnippet: snippet,
          dealStage,
          estimatedValue,
        },
      })
      .select("*")
      .single();

    if (threadError || !thread) {
      console.error("Failed to insert inbox thread:", threadError);
      return NextResponse.json(
        { success: false, error: "Failed to persist conversation thread." },
        { status: 500 }
      );
    }

    // 3. Persist initial message if provided
    if (initialMessage) {
      await supabase.from("inbox_messages").insert({
        workspace_id: wsId,
        thread_id: thread.id,
        direction: "inbound",
        provider: channel,
        content: initialMessage,
        delivery_status: "delivered",
        message_type: "text",
        metadata: {
          senderName: contactName,
        },
      });
    }

    return NextResponse.json({
      success: true,
      thread: {
        id: thread.id,
        workspaceId: wsId,
        contactName: contact.name,
        contactIdentifier,
        company: contact.company || "",
        channel,
        priority,
        dealStage,
        estimatedValue,
        unreadCount: thread.unread_count,
        assignedSpecialist,
        lastMessageSnippet: snippet,
        lastMessageTimestamp: thread.last_message_at,
        messages: [],
      },
    });
  } catch (error) {
    console.error("POST /api/inbox/threads error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
