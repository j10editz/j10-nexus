import { describe, expect, it, vi } from "vitest";
import {
  calculateProposalTotal,
  generateProposalNumber,
  createWorkspaceProposal,
  acceptAndMarkProposalPaid,
} from "@/lib/revenue/proposals";
import {
  createWorkspaceBooking,
  updateBookingStatus,
} from "@/lib/revenue/bookings";
import {
  processInboundWhatsAppRevenueLoop,
  reconcileRevenueLoopPayment,
} from "@/lib/revenue/loop-orchestrator";
import {
  getWorkspaceExecutiveRevenueReport,
} from "@/lib/revenue/executive-reporting";
import { scoreCustomerIntent } from "@/lib/whatsapp/lead-qualification";

describe("Tier 1: Complete Revenue Loop — Unit & Integration Engine", () => {
  describe("AI Lead Qualification & BANT Intent Classifier", () => {
    it("classifies high buying signals into Qualified status with high estimated value", () => {
      const messages = [
        "Hello, what is your enterprise pricing for 50 autonomous agents?",
        "We want to purchase an annual contract.",
      ];
      const result = scoreCustomerIntent(messages);

      expect(result.score).toBe(85);
      expect(result.status).toBe("Qualified");
      expect(result.estimatedValue).toBe(2500);
      expect(result.suggestedNextStep).toContain("proposal");
      expect(result.intentSummary).toContain("pricing");
    });

    it("classifies product evaluation inquiries into Interested status", () => {
      const messages = ["Do you support webhooks and custom API integrations for CRM?"];
      const result = scoreCustomerIntent(messages);

      expect(result.score).toBe(65);
      expect(result.status).toBe("Interested");
      expect(result.estimatedValue).toBe(1000);
      expect(result.suggestedNextStep).toContain("demo link");
    });

    it("classifies general inquiries into New baseline lead", () => {
      const messages = ["Hello there"];
      const result = scoreCustomerIntent(messages);

      expect(result.score).toBe(25);
      expect(result.status).toBe("New");
      expect(result.estimatedValue).toBe(250);
    });
  });

  describe("Proposal & Booking Calculation Utilities", () => {
    it("calculates proposal total correctly across varied line items", () => {
      const items = [
        { description: "AI Workforce License", quantity: 2, unitPrice: 1200 },
        { description: "WhatsApp Integration", quantity: 1, unitPrice: 600 },
      ];
      expect(calculateProposalTotal(items)).toBe(3000);
      expect(calculateProposalTotal([])).toBe(0);
    });

    it("generates deterministic padded proposal numbers", () => {
      const year = new Date().getFullYear();
      expect(generateProposalNumber(1)).toBe(`PROP-${year}-0001`);
      expect(generateProposalNumber(42)).toBe(`PROP-${year}-0042`);
      expect(generateProposalNumber(999)).toBe(`PROP-${year}-0999`);
    });
  });

  describe("End-to-End Revenue Loop Simulation with Mock Client", () => {
    function createMockSupabase() {
      const state = {
        contacts: [] as any[],
        inbox_threads: [] as any[],
        inbox_messages: [] as any[],
        crm_proposals: [] as any[],
        crm_bookings: [] as any[],
        payment_checkouts: [] as any[],
        payment_ledger: [] as any[],
      };

      const mockClient: any = {
        from: vi.fn((table: string) => {
          let currentTable = state[table as keyof typeof state] || [];
          let filters: Array<(row: any) => boolean> = [];
          let orderCol: string | null = null;
          let limitCount: number | null = null;
          let selectedFields: string | null = null;
          let isCountQuery = false;

          const queryBuilder: any = {
            select: vi.fn((fields = "*", options?: any) => {
              selectedFields = fields;
              if (options?.count === "exact" && options?.head) {
                isCountQuery = true;
              }
              return queryBuilder;
            }),
            insert: vi.fn((data: any) => {
              const rows = Array.isArray(data) ? data : [data];
              const inserted = rows.map((r) => ({
                id: r.id || `mock_${table}_${Math.random().toString(36).substring(2, 9)}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...r,
              }));
              currentTable.push(...inserted);

              return {
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: inserted[0], error: null })),
                  maybeSingle: vi.fn(() => Promise.resolve({ data: inserted[0], error: null })),
                  then: (resolve: any) => resolve({ data: inserted, error: null }),
                })),
                single: vi.fn(() => Promise.resolve({ data: inserted[0], error: null })),
                then: (resolve: any) => resolve({ data: inserted, error: null }),
              };
            }),
            update: vi.fn((updates: any) => {
              return {
                eq: vi.fn((field: string, val: any) => {
                  filters.push((row) => row[field] === val);
                  return {
                    eq: vi.fn((f2: string, v2: any) => {
                      filters.push((row) => row[f2] === v2);
                      const matching = currentTable.filter((r) => filters.every((fn) => fn(r)));
                      matching.forEach((r) => Object.assign(r, updates));
                      return {
                        select: vi.fn(() => ({
                          single: vi.fn(() => Promise.resolve({ data: matching[0] || null, error: null })),
                          then: (res: any) => res({ data: matching, error: null }),
                        })),
                        then: (res: any) => res({ data: matching, error: null }),
                      };
                    }),
                    select: vi.fn(() => ({
                      single: vi.fn(() => {
                        const matching = currentTable.filter((r) => filters.every((fn) => fn(r)));
                        matching.forEach((r) => Object.assign(r, updates));
                        return Promise.resolve({ data: matching[0] || null, error: null });
                      }),
                      then: (res: any) => {
                        const matching = currentTable.filter((r) => filters.every((fn) => fn(r)));
                        matching.forEach((r) => Object.assign(r, updates));
                        return res({ data: matching, error: null });
                      },
                    })),
                    then: (res: any) => {
                      const matching = currentTable.filter((r) => filters.every((fn) => fn(r)));
                      matching.forEach((r) => Object.assign(r, updates));
                      return res({ data: matching, error: null });
                    },
                  };
                }),
              };
            }),
            eq: vi.fn((field: string, val: any) => {
              filters.push((row) => row[field] === val);
              return queryBuilder;
            }),
            ilike: vi.fn((field: string, val: string) => {
              const clean = val.replace(/%/g, "").toLowerCase();
              filters.push((row) => String(row[field] || "").toLowerCase().includes(clean));
              return queryBuilder;
            }),
            order: vi.fn((col: string) => {
              orderCol = col;
              return queryBuilder;
            }),
            limit: vi.fn((num: number) => {
              limitCount = num;
              return queryBuilder;
            }),
            single: vi.fn(() => {
              const filtered = currentTable.filter((r) => filters.every((fn) => fn(r)));
              return Promise.resolve({ data: filtered[0] || null, error: null });
            }),
            maybeSingle: vi.fn(() => {
              const filtered = currentTable.filter((r) => filters.every((fn) => fn(r)));
              return Promise.resolve({ data: filtered[0] || null, error: null });
            }),
            then: (resolve: any) => {
              let res = currentTable.filter((r) => filters.every((fn) => fn(r)));
              if (limitCount) res = res.slice(0, limitCount);
              if (isCountQuery) {
                return resolve({ count: res.length, data: null, error: null });
              }
              resolve({ count: res.length, data: res, error: null });
            },
          };

          return queryBuilder;
        }),
      };

      return { mockClient, state };
    }

    it("orchestrates the entire revenue loop: Inbound Lead -> AI Qualified -> Proposal & Booking -> Stripe Won", async () => {
      const { mockClient, state } = createMockSupabase();
      const workspaceId = "ws_test_apex_01";

      // 1. Process Inbound WhatsApp Lead with commercial intent
      const leadResult = await processInboundWhatsAppRevenueLoop(mockClient, {
        workspaceId,
        senderPhone: "+15552345678",
        customerName: "Sarah Connor",
        company: "Cyberdyne Systems",
        message: "We need enterprise pricing to buy licenses for your autonomous workforce.",
      });

      expect(leadResult.success).toBe(true);
      expect(leadResult.qualification.score).toBe(85);
      expect(leadResult.qualification.dealStage).toBe("proposal");
      expect(leadResult.proposal).toBeDefined();
      expect(leadResult.proposal?.status).toBe("sent");
      expect(leadResult.proposal?.checkout_url).toContain("/checkout/");
      expect(leadResult.booking).toBeDefined();
      expect(leadResult.booking?.status).toBe("scheduled");
      expect(leadResult.outboundMessageId).toBeDefined();

      // Verify contact and thread states in database
      expect(state.contacts.length).toBe(1);
      const contact = state.contacts[0];
      expect(contact.name).toBe("Sarah Connor");
      expect(contact.deal_stage).toBe("proposal");
      expect(contact.estimated_value).toBe(2500);

      expect(state.inbox_threads.length).toBe(1);
      const thread = state.inbox_threads[0];
      expect(thread.metadata?.dealStage).toBe("proposal");

      // Verify proposal and checkout
      expect(state.crm_proposals.length).toBe(1);
      const proposal = state.crm_proposals[0];
      expect(proposal.amount).toBe(2500);

      expect(state.payment_checkouts.length).toBe(1);
      const checkout = state.payment_checkouts[0];
      expect(checkout.amount).toBe(2500);
      expect(checkout.status).toBe("pending");

      // 2. Reconcile Stripe payment upon completion
      const paymentResult = await reconcileRevenueLoopPayment(mockClient, {
        workspaceId,
        checkoutId: checkout.id,
        providerEventId: "evt_test_success_99",
        amount: 2500,
        currency: "USD",
      });

      expect(paymentResult.success).toBe(true);
      expect(paymentResult.dealStage).toBe("won");
      expect(paymentResult.ledgerId).toBeDefined();

      // Verify state updates after payment settlement
      expect(checkout.status).toBe("paid");
      expect(proposal.status).toBe("paid");
      expect(proposal.accepted_at).toBeDefined();
      expect(contact.deal_stage).toBe("won");
      expect(contact.status).toBe("Won");
      expect(contact.type).toBe("Customer");
      expect(thread.metadata?.dealStage).toBe("won");

      // Verify immutable payment_ledger entry
      expect(state.payment_ledger.length).toBe(1);
      const ledgerEntry = state.payment_ledger[0];
      expect(ledgerEntry.amount).toBe(2500);
      expect(ledgerEntry.status).toBe("succeeded");
      expect(ledgerEntry.provider).toBe("stripe");

      // 3. Compute Executive Revenue Report
      const report = await getWorkspaceExecutiveRevenueReport(mockClient, workspaceId);

      expect(report.summary.totalVerifiedWonRevenue).toBe(2500);
      expect(report.summary.totalContractValue).toBe(2500);
      expect(report.summary.overallWinRate).toBe(100);
      expect(report.funnel.stages.length).toBe(4);
      expect(report.proposals.total).toBe(1);
      expect(report.proposals.paid).toBe(1);
      expect(report.bookings.total).toBe(1);
      expect(report.bookings.scheduled).toBe(1);
      expect(report.recentLedger.length).toBe(1);
      expect(report.recentLedger[0].amount).toBe(2500);
      expect(report.attribution.length).toBeGreaterThan(0);
      expect(report.attribution[0].channel).toBe("whatsapp");
      expect(report.attribution[0].wonCount).toBe(1);
    });
  });
});
