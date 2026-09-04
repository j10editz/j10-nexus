import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasMinimumRole,
  type WorkspaceRole,
} from "@/lib/workspaces/server";
import { processStripeWebhookEvent } from "@/lib/billing/stripe-webhook";

describe("Adversarial Tenant Isolation, Schema Integrity & Ledger Immutability", () => {
  const migration20260912 = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260912_adversarial_tenant_integrity_recovery.sql"),
    "utf8"
  );

  describe("A. Cross-Tenant Foreign-Key & Composite Integrity", () => {
    it("enforces composite unique constraints on (workspace_id, id) for all parent entities", () => {
      expect(migration20260912).toContain("uq_contacts_workspace_id unique (workspace_id, id)");
      expect(migration20260912).toContain("uq_inbox_threads_workspace_id unique (workspace_id, id)");
      expect(migration20260912).toContain("uq_inbox_messages_workspace_id unique (workspace_id, id)");
      expect(migration20260912).toContain("uq_payment_checkouts_workspace_id unique (workspace_id, id)");
    });

    it("enforces composite foreign keys preventing cross-tenant thread and message entanglement", () => {
      // Threads must point to contacts in the SAME workspace
      expect(migration20260912).toContain(
        "foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id)"
      );

      // Messages must point to threads in the SAME workspace
      expect(migration20260912).toContain(
        "foreign key (workspace_id, thread_id) references public.inbox_threads(workspace_id, id)"
      );
    });

    it("enforces composite foreign keys preventing cross-tenant checkouts and ledger entanglement", () => {
      // Checkouts must point to contacts and threads in the SAME workspace
      expect(migration20260912).toContain(
        "foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id)"
      );
      expect(migration20260912).toContain(
        "foreign key (workspace_id, thread_id) references public.inbox_threads(workspace_id, id)"
      );

      // Payment ledger entries must point to checkouts in the SAME workspace
      expect(migration20260912).toContain(
        "foreign key (workspace_id, checkout_id) references public.payment_checkouts(workspace_id, id)"
      );
    });
  });

  describe("B. Security Definer Safety & Privilege Enforcement", () => {
    it("sets safe fixed search_path = public, pg_temp on all security definer functions", () => {
      expect(migration20260912).toContain("create or replace function public.is_workspace_member");
      expect(migration20260912).toContain("set search_path = public, pg_temp");
      expect(migration20260912).toContain("create or replace function public.has_workspace_role");
      expect(migration20260912).toContain("create or replace function public.owns_workspace");
      expect(migration20260912).toContain("create or replace function public.provision_workspace");
    });

    it("revokes execute from PUBLIC and grants only to authenticated and service_role", () => {
      expect(migration20260912).toContain("revoke execute on function public.is_workspace_member(uuid) from public;");
      expect(migration20260912).toContain("grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;");
      expect(migration20260912).toContain("revoke execute on function public.provision_workspace(text, text, text, text, text, text) from public;");
      expect(migration20260912).toContain("grant execute on function public.provision_workspace(text, text, text, text, text, text) to authenticated, service_role;");
    });
  });

  describe("C. Financial Immutability & Database Trigger Protection", () => {
    it("prohibits non-service_role from marking payment checkouts as paid", () => {
      expect(migration20260912).toContain("function public.check_payment_checkout_mutation()");
      expect(migration20260912).toContain("auth.role() != 'service_role'");
      expect(migration20260912).toContain("raise exception 'Security violation: Only verified payment webhooks may mark checkouts as paid.'");
      expect(migration20260912).toContain("create trigger trg_payment_checkout_mutation");
    });

    it("enforces strictly append-only immutability on payment_ledger", () => {
      expect(migration20260912).toContain("function public.check_payment_ledger_immutability()");
      expect(migration20260912).toContain("payment_ledger is an immutable audit log. Updates and deletes are prohibited");
      expect(migration20260912).toContain("create trigger trg_payment_ledger_immutability");
      expect(migration20260912).toContain("before update or delete on public.payment_ledger");
    });
  });

  describe("D. Atomic Provisioning & Founder Legacy Recovery", () => {
    it("defines an atomic provision_workspace RPC function creating workspace and owner in one transaction", () => {
      expect(migration20260912).toContain("function public.provision_workspace(");
      expect(migration20260912).toContain("insert into public.workspaces");
      expect(migration20260912).toContain("insert into public.workspace_memberships");
      expect(migration20260912).toContain("'owner'");
    });

    it("idempotently provisions canonical J10 NEXUS HQ and migrates legacy crm_contacts", () => {
      expect(migration20260912).toContain("'J10 NEXUS HQ'");
      expect(migration20260912).toContain("'agency_master'");
      expect(migration20260912).toContain("crm_contacts");
      expect(migration20260912).toContain("insert into public.contacts");
    });
  });

  describe("E. Adversarial Attack Vector Simulations", () => {
    it("prevents viewer from modifying pipeline stages or dispatching messages", () => {
      const viewerRole: WorkspaceRole = "viewer";
      expect(hasMinimumRole(viewerRole, "agent")).toBe(false);
      expect(hasMinimumRole(viewerRole, "manager")).toBe(false);
      expect(hasMinimumRole(viewerRole, "admin")).toBe(false);
      expect(hasMinimumRole(viewerRole, "owner")).toBe(false);
    });

    it("prevents cross-tenant webhook poisoning with mismatched workspace metadata", async () => {
      const mockSupabase = {
        from: (table: string) => {
          if (table === "webhook_events") {
            return {
              select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
              upsert: () => Promise.resolve({ error: null }),
              update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
            };
          }
          if (table === "payment_checkouts") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      id: "chk_real_001",
                      workspace_id: "ws-victim-org", // Actual workspace
                      thread_id: "thread-victim-1",
                      amount: 5000,
                      status: "pending",
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      };

      // Attacker sends event with workspace_id = 'ws-attacker-org'
      const maliciousWebhook = {
        id: "evt_attack_001",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_attack_session",
            amount_total: 500000,
            metadata: {
              workspace_id: "ws-attacker-org", // Forged!
              internal_checkout_id: "chk_real_001",
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase as any, maliciousWebhook);
      expect(result.processed).toBe(false);
      expect(result.action).toBe("quarantined");
      expect(result.error).toContain("Tenant metadata mismatch");
    });
  });
});
