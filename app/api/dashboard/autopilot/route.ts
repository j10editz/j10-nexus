import { NextResponse } from "next/server";
import { computeExecutiveDigest } from "@/lib/autopilot/service";

export async function GET() {
  try {
    const digest = computeExecutiveDigest();
    return NextResponse.json({
      success: true,
      digest,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to compute executive digest" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { actionId } = body;

    // Simulate execution of autonomous action
    return NextResponse.json({
      success: true,
      actionId,
      status: "executed",
      timestamp: new Date().toISOString(),
      message: `Autopilot action ${actionId} successfully triggered across worker queue.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to trigger autopilot action" },
      { status: 400 },
    );
  }
}
