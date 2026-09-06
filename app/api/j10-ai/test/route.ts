import { NextResponse } from "next/server";
import { runJ10AI } from "@/lib/ai/runtime";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  verifyWorkspaceEntitlement,
  recordWorkspaceMessageUsage,
  BillingRequiredError,
} from "@/lib/billing/entitlements";

/*
============================================================
J10 NEXUS AI RUNTIME TEST (DIAGNOSTIC ONLY)
============================================================
*/

export async function POST() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_AI_DIAGNOSTIC_MODE !== "true"
  ) {
    return NextResponse.json(
      {
        error: "Not found",
      },
      {
        status: 404,
      }
    );
  }

  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    try {
      await verifyWorkspaceEntitlement(supabase, context.workspace.id, {
        requiredMessages: 1,
      });
      await recordWorkspaceMessageUsage(supabase, context.workspace.id, 1);
    } catch (billingErr: unknown) {
      if (billingErr instanceof BillingRequiredError) {
        return NextResponse.json(
          {
            success: false,
            error: billingErr.message,
            code: billingErr.code,
          },
          {
            status: 402,
          }
        );
      }
      throw billingErr;
    }

    const result = await runJ10AI({
      task: "sales_decision",
      preference: "Automatic",
      maxOutputTokens: 6000,
      instructions: `
You are J10 AI, the intelligence layer of J10 NEXUS.

You are operating as a senior AI Sales Intelligence Agent.

Analyze the CRM opportunities supplied by J10 NEXUS.

RULES:

- Use only the supplied CRM information.
- Do not invent customer facts.
- Do not claim that any CRM action has been executed.
- Separate strategic priority from immediate outreach priority.
- Consider deal value, stage, score and follow-up status.
- Give concise operational recommendations.
- Clearly explain why each recommendation was made.
`,
      input: `
J10 NEXUS CRM INTELLIGENCE TEST

OPPORTUNITY A

Name: J10 Editz
Company: J10
Type: Lead
Status: Contacted
Priority: Hot
Priority Score: 80/100
Estimated Value: $10,000,000
Needs Follow-Up: No
Days Since Last Contact: 0

Current recommendation:
Continue monitoring this lead and prepare qualification.


OPPORTUNITY B

Name: Michael Carter
Company: Test Company
Type: Lead
Status: New
Priority: High
Priority Score: 65/100
Estimated Value: $5,000
Needs Follow-Up: Yes
Days Since Last Contact: No previous contact recorded

Current recommendation:
Contact this lead and begin qualification.


J10 AI TASK

Determine:

1. Which opportunity deserves the highest STRATEGIC priority?

2. Which opportunity deserves the most IMMEDIATE outreach?

3. What should the AI Sales Agent recommend next for J10 Editz?

4. What should the AI Sales Agent recommend next for Michael Carter?

5. Identify any important distinction between deal value priority and follow-up urgency.

Do not execute any CRM actions.

Return a concise professional sales intelligence assessment.
`,
    });

    return NextResponse.json({
      success: true,
      system: "J10 NEXUS",
      runtime: "J10 AI",
      test: "Real OpenAI execution successful",
      result,
    });
  } catch (error) {
    console.error("J10 AI runtime test error:", error);

    return NextResponse.json(
      {
        success: false,
        system: "J10 NEXUS",
        test: "J10 AI runtime failed",
        error:
          error instanceof Error
            ? error.message
            : "Unknown J10 AI runtime error.",
      },
      {
        status: 500,
      }
    );
  }
}