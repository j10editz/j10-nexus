import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";

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
      .from("workforce_members")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to remove team member." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Team member removed from workforce directory.",
    });
  } catch (error) {
    console.error("Workforce DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Error deleting workforce member." },
      { status: 500 }
    );
  }
}
