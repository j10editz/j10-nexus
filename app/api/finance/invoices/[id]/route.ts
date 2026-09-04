import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

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
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to update invoice." },
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
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const { error } = await supabase
      .from("finance_invoices")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to delete invoice." },
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
