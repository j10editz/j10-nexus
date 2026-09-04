import type { FinanceInvoice, FinanceSummary, InvoiceLineItem } from "@/types/finance";
import type { SupabaseClient } from "@supabase/supabase-js";

export function calculateLineItemsTotal(items: Array<{ quantity: number; unitPrice: number }>): number {
  return items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
}

export function generateInvoiceNumber(sequenceIndex: number): string {
  const currentYear = new Date().getFullYear();
  const padded = String(sequenceIndex + 1).padStart(4, "0");
  return `INV-${currentYear}-${padded}`;
}

export interface CRMContactFinanceSummary {
  wonRevenue: number;
  pipelineRevenue: number;
  activeCustomersCount: number;
  averageDealSize: number;
}

export function computeCRMRevenueMetrics(
  contacts: Array<{ type: string; status: string; estimated_value?: number }>
): CRMContactFinanceSummary {
  let wonRevenue = 0;
  let pipelineRevenue = 0;
  let wonCount = 0;
  let activeCustomersCount = 0;

  for (const c of contacts) {
    const val = Number(c.estimated_value) || 0;
    if (c.status === "Won") {
      wonRevenue += val;
      wonCount++;
    } else if (c.status === "Interested" || c.status === "Qualified") {
      pipelineRevenue += val;
    }

    if (c.type === "Customer" || c.status === "Won") {
      activeCustomersCount++;
    }
  }

  const averageDealSize = wonCount > 0 ? Math.round(wonRevenue / wonCount) : 0;

  return {
    wonRevenue,
    pipelineRevenue,
    activeCustomersCount,
    averageDealSize,
  };
}

export function computeFinanceSummary(
  invoices: FinanceInvoice[],
  crmMetrics: CRMContactFinanceSummary
): FinanceSummary {
  let paidTotal = 0;
  let pendingTotal = 0;
  let overdueTotal = 0;

  const now = new Date();

  for (const inv of invoices) {
    const amount = Number(inv.amount) || 0;
    if (inv.status === "paid") {
      paidTotal += amount;
    } else if (inv.status === "sent" || inv.status === "draft") {
      const isPastDue = new Date(inv.dueDate) < now;
      if (isPastDue && inv.status !== "draft") {
        overdueTotal += amount;
      } else {
        pendingTotal += amount;
      }
    } else if (inv.status === "overdue") {
      overdueTotal += amount;
    }
  }

  // Estimated MRR: (won revenue amortized over 12 months) + (monthly retainer assumption / paid invoices this month)
  const estimatedMRR = Math.round((crmMetrics.wonRevenue / 12) + (paidTotal * 0.2));

  return {
    totalWonRevenue: crmMetrics.wonRevenue,
    pipelineRevenue: crmMetrics.pipelineRevenue,
    paidInvoicesTotal: paidTotal,
    pendingInvoicesTotal: pendingTotal,
    overdueInvoicesTotal: overdueTotal,
    averageDealSize: crmMetrics.averageDealSize,
    estimatedMRR,
    activeCustomersCount: crmMetrics.activeCustomersCount,
    totalInvoicesCount: invoices.length,
  };
}
