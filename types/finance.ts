export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "canceled";

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface FinanceInvoice {
  id: string;
  userId?: string;
  invoiceNumber: string;
  contactId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidAt?: string | null;
  lineItems: InvoiceLineItem[];
  notes?: string | null;
  paymentLink?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceSummary {
  totalWonRevenue: number;
  pipelineRevenue: number;
  paidInvoicesTotal: number;
  pendingInvoicesTotal: number;
  overdueInvoicesTotal: number;
  averageDealSize: number;
  estimatedMRR: number;
  activeCustomersCount: number;
  totalInvoicesCount: number;
}
