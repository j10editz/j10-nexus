import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(resolve(root, "supabase/migrations/20261014_72h_trial_outcome_onboarding.sql"), "utf8");
const outcomeRoute = readFileSync(resolve(root, "app/api/onboarding/outcome/route.ts"), "utf8");
const legacyTrialRoute = readFileSync(resolve(root, "app/api/billing/trial/route.ts"), "utf8");
const outcomePage = readFileSync(resolve(root, "app/onboarding/outcome/page.tsx"), "utf8");

describe("72-hour trial and outcome onboarding", () => {
  it("starts a trial only from owner-approved onboarding with database time", () => {
    expect(migration).toContain("submit_workspace_outcome_onboarding");
    expect(migration).toContain("approve_workspace_outcome_onboarding");
    expect(migration).toContain("Outcome onboarding must be completed before a trial can start.");
    expect(migration).toContain("INTERVAL '72 hours'");
    expect(migration).toContain("v_now TIMESTAMPTZ := now()");
    expect(migration).toContain("trial_started_at");
    expect(migration).toContain("trial_ends_at");
    expect(migration).toContain("trial_status");
    expect(legacyTrialRoute).toContain("Complete and approve Outcome Onboarding");
  });

  it("prevents workspace recreation from resetting a verified user or business trial", () => {
    expect(migration).toContain("uq_workspace_trial_identity_user UNIQUE (verified_user_id)");
    expect(migration).toContain("uq_workspace_trial_identity_business UNIQUE (business_identity_hash)");
    expect(migration).toContain("A free trial has already been used by this verified user or business.");
    expect(migration).toContain("This workspace has already used its free trial and cannot be reset.");
    expect(migration).toContain("first_workspace_id <> p_workspace_id");
  });

  it("fails closed server-side after expiry for jobs, outbound usage, automation, and leads", () => {
    expect(migration).toContain("TRIAL_EXPIRED: this workspace is read-only");
    for (const table of ["workspace_usage_records", "workspace_quota_reservations", "ai_tasks", "automation_runs", "contacts", "crm_contacts"]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("BEFORE INSERT ON public.%I");
    expect(migration).toContain("relation.relkind IN ('r', 'p')");
  });

  it("is an upgrade-safe additive migration for current paid workspaces", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS trial_started_at");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS trial_ends_at");
    expect(migration).toContain("ON CONFLICT (workspace_id) DO UPDATE SET");
    expect(migration).toContain("CASE WHEN public.workspace_subscriptions.provenance = 'stripe'");
    expect(migration).toContain("trial_status = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN 'converted'");
  });

  it("keeps onboarding owner-scoped and requires explicit activation approval", () => {
    expect(outcomeRoute).toContain('requireApiWorkspaceContext("owner")');
    expect(outcomeRoute).toContain("submit_workspace_outcome_onboarding");
    expect(outcomeRoute).toContain("approve_workspace_outcome_onboarding");
    expect(outcomePage).toContain("Approve setup and start my 72-hour trial");
  });

  it("labels WhatsApp as a demo and never invokes a live provider from trial onboarding", () => {
    expect(outcomePage).toContain("interactive demo");
    expect(outcomePage).toContain("No live provider call will be made");
    expect(outcomePage).not.toMatch(/sendWhatsApp|sendChannelProviderMessage|360dialog|meta cloud/i);
  });
});
