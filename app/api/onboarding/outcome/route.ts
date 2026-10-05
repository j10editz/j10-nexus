import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getTrialRuntimeStatus } from "@/lib/billing/entitlements";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

export async function GET() {
  const auth = await requireApiWorkspaceContext();
  if (auth.error) return auth.error;
  const supabase = createServerSupabaseClient();
  const [{ data: onboarding, error: onboardingError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase.from("workspace_outcome_onboarding").select("status,business_profile,proposed_setup,submitted_at,approved_at,activated_at").eq("workspace_id", auth.context.workspace.id).maybeSingle(),
    supabase.from("workspace_subscriptions").select("trial_started_at,trial_ends_at,trial_status,provenance,status,cancel_at_period_end,current_period_end").eq("workspace_id", auth.context.workspace.id).maybeSingle(),
  ]);
  if (onboardingError || subscriptionError) {
    return NextResponse.json({ error: "Could not load outcome onboarding." }, { status: 500 });
  }
  const serverNow = new Date();
  const isPaidActive =
    subscription &&
    (subscription.provenance === "stripe" || subscription.provenance === "internal_grant") &&
    (subscription.status === "active" ||
      ((subscription.status === "canceled_at_period_end" || Boolean(subscription.cancel_at_period_end)) &&
        subscription.current_period_end &&
        new Date(subscription.current_period_end) > serverNow));

  const trial = subscription
    ? {
        trial_started_at: isPaidActive ? null : subscription.trial_started_at,
        trial_ends_at: isPaidActive ? null : subscription.trial_ends_at,
        trial_status:
          isPaidActive
            ? null
            : subscription.provenance === "trial"
            ? getTrialRuntimeStatus(
                {
                  provenance: subscription.provenance,
                  trialStatus: subscription.trial_status,
                  trialEndsAt: subscription.trial_ends_at,
                  trialEnd: null,
                },
                serverNow
              ) || subscription.trial_status
            : null,
        provenance: subscription.provenance,
        subscription_status: subscription.status,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        current_period_end: subscription.current_period_end,
      }
    : null;
  return NextResponse.json({ success: true, onboarding, trial, serverNow: serverNow.toISOString() });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiWorkspaceContext("owner");
  if (auth.error) return auth.error;
  const businessProfile = await request.json().catch(() => null);
  if (!businessProfile || typeof businessProfile !== "object" || Array.isArray(businessProfile)) {
    return NextResponse.json({ error: "A business outcome profile is required." }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("submit_workspace_outcome_onboarding", {
    p_workspace_id: auth.context.workspace.id,
    p_business_profile: businessProfile,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.json(data);
}

export async function PATCH() {
  const auth = await requireApiWorkspaceContext("owner");
  if (auth.error) return auth.error;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("approve_workspace_outcome_onboarding", { p_workspace_id: auth.context.workspace.id });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.json(data);
}
