import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const { id } = await context.params;
    const body = await request.json();

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status) {
      updates.status = body.status;
      if (body.status === "paid") {
        updates.paid_at = new Date().toISOString();
      }
    }

    if (body.notes !== undefined) {
      updates.notes = body.notes;
    }

    if (body.paymentLink !== undefined) {
      updates.payment_link = body.paymentLink;
    }

    const { data: updated, error } = await supabase
      .from("finance_invoices")
      .update(updates)
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id)
      .select()
      .single();

    if (error || !updated) {
      console.error("Finance Invoice update error:", error);
      return NextResponse.json(
        { success: false, error: error?.message || "Failed to update invoice." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      invoice: updated,
      message: `Invoice status updated to ${updated.status}.`,
    });
  } catch (error) {
    console.error("Finance Invoice PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Error updating invoice." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const { id } = await context.params;

    const { error } = await supabase
      .from("finance_invoices")
      .delete()
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id);

    if (error) {
      console.error("Finance Invoice delete error:", error);
      return NextResponse.json(
        { success: false, error: error.message || "Failed to delete invoice." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Invoice deleted successfully.",
    });
  } catch (error) {
    console.error("Finance Invoice DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Error deleting invoice." },
      { status: 500 }
    );
  }
}
