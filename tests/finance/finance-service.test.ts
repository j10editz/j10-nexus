import { describe, expect, it } from "vitest";
import {
  calculateLineItemsTotal,
  computeCRMRevenueMetrics,
  computeFinanceSummary,
  generateInvoiceNumber,
} from "@/lib/finance/service";
import type { FinanceInvoice } from "@/types/finance";

describe("J10 NEXUS Finance & Revenue Intelligence Service", () => {
  it("formats sequential invoice numbers with current year", () => {
    const inv1 = generateInvoiceNumber(0);
    const inv42 = generateInvoiceNumber(41);
    const currentYear = new Date().getFullYear();

    expect(inv1).toBe(`INV-${currentYear}-0001`);
    expect(inv42).toBe(`INV-${currentYear}-0042`);
  });

  it("calculates line items subtotal accurately", () => {
    const items = [
      { quantity: 2, unitPrice: 1500 },
      { quantity: 1, unitPrice: 250 },
      { quantity: 5, unitPrice: 20 },
    ];
    const total = calculateLineItemsTotal(items);
    expect(total).toBe(3000 + 250 + 100);
  });

  it("aggregates CRM contact revenue metrics for Won and Pipeline deals", () => {
    const contacts = [
      { type: "Customer", status: "Won", estimated_value: 5000 },
      { type: "Customer", status: "Won", estimated_value: 15000 },
      { type: "Prospect", status: "Qualified", estimated_value: 8000 },
      { type: "Prospect", status: "Interested", estimated_value: 4000 },
      { type: "Lead", status: "Contacted", estimated_value: 1000 },
      { type: "Lead", status: "Lost", estimated_value: 2000 },
    ];

    const metrics = computeCRMRevenueMetrics(contacts);

    expect(metrics.wonRevenue).toBe(20000);
    expect(metrics.pipelineRevenue).toBe(12000);
    expect(metrics.activeCustomersCount).toBe(2);
    expect(metrics.averageDealSize).toBe(10000);
  });

  it("computes comprehensive financial summary across invoices and CRM", () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 10 * 86400000).toISOString().split("T")[0];
    const pastDate = new Date(now.getTime() - 10 * 86400000).toISOString().split("T")[0];

    const invoices: FinanceInvoice[] = [
      {
        id: "inv-1",
        invoiceNumber: "INV-2026-0001",
        customerName: "Acme Corp",
        amount: 3000,
        currency: "USD",
        status: "paid",
        issueDate: "2026-01-01",
        dueDate: pastDate,
        paidAt: "2026-01-05",
        lineItems: [],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-2026-0002",
        customerName: "Beta LLC",
        amount: 2500,
        currency: "USD",
        status: "sent",
        issueDate: "2026-01-10",
        dueDate: futureDate,
        lineItems: [],
        createdAt: "2026-01-10",
        updatedAt: "2026-01-10",
      },
      {
        id: "inv-3",
        invoiceNumber: "INV-2026-0003",
        customerName: "Gamma Inc",
        amount: 1500,
        currency: "USD",
        status: "overdue",
        issueDate: "2026-01-01",
        dueDate: pastDate,
        lineItems: [],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ];

    const crmMetrics = {
      wonRevenue: 60000,
      pipelineRevenue: 24000,
      activeCustomersCount: 5,
      averageDealSize: 12000,
    };

    const summary = computeFinanceSummary(invoices, crmMetrics);

    expect(summary.totalWonRevenue).toBe(60000);
    expect(summary.pipelineRevenue).toBe(24000);
    expect(summary.paidInvoicesTotal).toBe(3000);
    expect(summary.pendingInvoicesTotal).toBe(2500);
    expect(summary.overdueInvoicesTotal).toBe(1500);
    expect(summary.totalInvoicesCount).toBe(3);
    expect(summary.estimatedMRR).toBeGreaterThan(0);
  });
});
