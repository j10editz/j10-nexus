import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import {
  calculateLineItemsTotal,
  computeCRMRevenueMetrics,
  computeFinanceSummary,
  generateInvoiceNumber,
} from "@/lib/finance/service";
import type { FinanceInvoice, InvoiceLineItem } from "@/types/finance";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    // 1. Fetch Invoices scoped strictly by active workspace
    const { data: rawInvoices, error: invError } = await supabase
      .from("finance_invoices")
      .select("*")
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false });

    if (invError) {
      console.error("Finance Invoices query error:", invError);
      return NextResponse.json(
        { success: false, error: "Failed to load financial records." },
        { status: 500 }
      );
    }

    const invoices: FinanceInvoice[] = (rawInvoices || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id || context.user.id,
      invoiceNumber: row.invoice_number,
      contactId: row.contact_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      amount: Number(row.amount) || 0,
      currency: row.currency || "USD",
      status: row.status || "draft",
      issueDate: row.issue_date,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      lineItems: Array.isArray(row.line_items) ? row.line_items : [],
      notes: row.notes,
      paymentLink: row.payment_link,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // 2. Fetch CRM Contacts for revenue calculation & contact picker scoped by workspace
    const { data: contactsData } = await supabase
      .from("contacts")
      .select("id,first_name,last_name,email,phone,company,type,status,estimated_value")
      .eq("workspace_id", context.workspace.id);

    const contacts = contactsData || [];
    const crmMetrics = computeCRMRevenueMetrics(contacts);
    const summary = computeFinanceSummary(invoices, crmMetrics);

    return NextResponse.json({
      success: true,
      invoices,
      contacts,
      summary,
    });
  } catch (error) {
    console.error("Finance Invoices GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load financial records." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const body = await request.json();
    const {
      customerName,
      customerEmail,
      customerPhone,
      contactId,
      lineItems = [],
      dueDate,
      notes,
    } = body;

    if (!customerName || typeof customerName !== "string") {
      return NextResponse.json(
        { success: false, error: "Customer name is required." },
        { status: 400 }
      );
    }

    // Calculate total amount
    const parsedItems: InvoiceLineItem[] = Array.isArray(lineItems)
      ? lineItems.map((item: any, idx: number) => ({
          id: item.id || `item-${idx + 1}`,
          description: String(item.description || "Service item"),
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
        }))
      : [];

    const amount = parsedItems.length > 0
      ? calculateLineItemsTotal(parsedItems)
      : Number(body.amount) || 0;

    // Get count for sequence within this workspace
    const { count } = await supabase
      .from("finance_invoices")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", context.workspace.id);

    const invoiceNumber = generateInvoiceNumber(count || 0);
    const issueDate = new Date().toISOString().split("T")[0];
    const finalDueDate = dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

    const invoiceRecord = {
      workspace_id: context.workspace.id,
      user_id: context.user.id,
      invoice_number: invoiceNumber,
      contact_id: contactId || null,
      customer_name: customerName.trim(),
      customer_email: customerEmail?.trim() || null,
      customer_phone: customerPhone?.trim() || null,
      amount,
      currency: "USD",
      status: "draft",
      issue_date: issueDate,
      due_date: finalDueDate,
      line_items: parsedItems,
      notes: notes?.trim() || null,
    };

    const { data: created, error } = await supabase
      .from("finance_invoices")
      .insert([invoiceRecord])
      .select()
      .single();

    if (error || !created) {
      console.error("Supabase insert invoice error:", error);
      return NextResponse.json(
        { success: false, error: error?.message || "Database error creating invoice." },
        { status: 500 }
      );
    }

    const invoice: FinanceInvoice = {
      id: created.id,
      userId: created.user_id || context.user.id,
      invoiceNumber: created.invoice_number,
      contactId: created.contact_id,
      customerName: created.customer_name,
      customerEmail: created.customer_email,
      customerPhone: created.customer_phone,
      amount: Number(created.amount) || 0,
      currency: created.currency || "USD",
      status: created.status,
      issueDate: created.issue_date,
      dueDate: created.due_date,
      paidAt: created.paid_at,
      lineItems: Array.isArray(created.line_items) ? created.line_items : [],
      notes: created.notes,
      paymentLink: created.payment_link,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };

    return NextResponse.json({ success: true, invoice });
  } catch (error) {
    console.error("Finance Invoices POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create invoice." },
      { status: 500 }
    );
  }
}
