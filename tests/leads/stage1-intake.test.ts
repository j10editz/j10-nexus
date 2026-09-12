import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveLeadIdempotencyKey, normalizeLeadIdentity } from "@/lib/leads/intake";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260925_stage1_lead_intake_foundation.sql"), "utf8");

describe("Stage 1 lead intake contracts", () => {
  it("normalizes identity without treating shared values as globally unique", () => {
    expect(normalizeLeadIdentity({ email: "  LEAD@Example.com ", phone: "(415) 555-0123" })).toEqual({ email: "lead@example.com", phone: "+4155550123" });
    expect(normalizeLeadIdentity({ email: "not-an-email", phone: "12" })).toEqual({ email: null, phone: null });
  });

  it("uses a deterministic retry key scoped by the intake payload", () => {
    const input = { workspaceId: "workspace-a", source: "website_form" as const, channel: "website" as const, name: "Avery", email: "avery@example.com", message: "Hello" };
    expect(deriveLeadIdempotencyKey(input)).toBe(deriveLeadIdempotencyKey(input));
  });

  it("creates individual intakes and a durable lead.received outbox in one transaction", () => {
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/COMMIT;\s*$/m);
    expect(migration).toContain("CREATE TABLE public.lead_intakes");
    expect(migration).toContain("CREATE TABLE public.lead_event_outbox");
    expect(migration).toContain("UNIQUE (workspace_id, idempotency_key)");
    expect(migration).toContain("uq_lead_intakes_workspace_source_event");
    expect(migration).toContain("'lead.received:' || v_intake_id::text");
  });

  it("does not introduce global contact identity uniqueness or silently merge ambiguity", () => {
    expect(migration).not.toContain("UNIQUE (workspace_id, normalized_email)");
    expect(migration).not.toContain("UNIQUE (workspace_id, normalized_phone)");
    expect(migration).toContain("v_status := 'ambiguous'");
    expect(migration).toContain("resolution_status IN ('created', 'matched', 'ambiguous')");
  });

  it("keeps consent explicit and separates operational from marketing purposes", () => {
    expect(migration).toContain("purpose IN ('operational', 'marketing')");
    expect(migration).toContain("disclosure_version text NOT NULL");
    expect(migration).toContain("captured_at timestamptz NOT NULL");
  });
});
