import { NextResponse } from "next/server";

export async function POST() {
  // Retained only as a compatibility endpoint. Trial activation is deliberately
  // unavailable here: it must happen through the owner-approved outcome flow.
  return NextResponse.json(
    { success: false, error: "Complete and approve Outcome Onboarding to activate the 72-hour trial." },
    { status: 409 }
  );
}
