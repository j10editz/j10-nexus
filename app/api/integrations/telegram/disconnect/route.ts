import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  createTelegramDeletionIntent,
  executeTelegramScopedDeletion,
} from "@/lib/telegram/consent";

export const dynamic = "force-dynamic";

/**
 * GET: Previews affected records and generates a cryptographically random,
 * single-use deletion intent token bound to the requesting user, workspace,
 * and business_connection_id. Expires in 10 minutes.
 */
export async function GET(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: only workspace owners and admins can preview integration deletion" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const businessConnectionId = searchParams.get("businessConnectionId");

    if (!businessConnectionId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: businessConnectionId" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const intent = await createTelegramDeletionIntent(supabase, {
      workspaceId: context.workspace.id,
      businessConnectionId,
      userId: context.user.id,
    });

    return NextResponse.json({
      success: true,
      preview: intent.preview,
      token: intent.token,
      expiresInSeconds: intent.expiresInSeconds,
    });
  } catch (err: any) {
    console.error("[Telegram Disconnect Intent API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate deletion intent" },
      { status: 500 }
    );
  }
}

/**
 * POST: Hardened scoped disconnection and deletion.
 * Requires a valid cryptographic deletion token generated via GET.
 * Rejects static confirmation strings like 'CONFIRM_DELETE'.
 * Marks local status as 'local_disabled' immediately and purges jobs/messages scoped to the connection.
 */
export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: only workspace owners and admins can execute integration deletion" },
        { status: 403 }
      );
    }

    const wsId = context.workspace.id;
    const body = await req.json().catch(() => ({}));
    const deleteMessages = Boolean(body.deleteMessages);
    const token = body.token;
    const businessConnectionId = body.businessConnectionId;

    if (!businessConnectionId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: businessConnectionId" },
        { status: 400 }
      );
    }

    if (!token || typeof token !== "string" || !token.startsWith("tdel_")) {
      return NextResponse.json(
        {
          success: false,
          error: "A valid single-use cryptographic deletion token (tdel_...) is required. Static confirmation strings are not accepted.",
        },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const result = await executeTelegramScopedDeletion(supabase, {
      workspaceId: wsId,
      businessConnectionId,
      token,
      deleteMessages,
    });

    return NextResponse.json({
      message: "Telegram Business connection disabled locally and scoped data purged successfully.",
      instruction: "To complete disconnection on Telegram, open Telegram Settings → Telegram Business → Chatbots, and remove the bot.",
      ...result,
    });
  } catch (err: any) {
    console.error("[Telegram Disconnect API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute Telegram disconnection." },
      { status: 500 }
    );
  }
}
