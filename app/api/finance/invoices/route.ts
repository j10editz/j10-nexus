import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import {
  calculateLineItemsTotal,
  computeCRMRevenueMetrics,
  computeFinanceSummary,
  generateInvoiceNumber,
} from "@/lib/finance/service";
import type { FinanceInvoice, InvoiceLineItem } from "@/types/finance";

export async function GET() {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    // 1. Fetch Invoices
    const { data: rawInvoices, error: invError } = await supabase
      .from("finance_invoices")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const invoices: FinanceInvoice[] = (rawInvoices || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
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

    // 2. Fetch CRM Contacts for revenue calculation & contact picker
    const { data: contactsData } = await supabase
      .from("crm_contacts")
      .select("id,first_name,last_name,email,phone,company,type,status,estimated_value")
      .eq("user_id", user.id);

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
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

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

    // Get count for sequence
    const { count } = await supabase
      .from("finance_invoices")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const invoiceNumber = generateInvoiceNumber(count || 0);
    const issueDate = new Date().toISOString().split("T")[0];
    const finalDueDate = dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

    const invoiceRecord = {
      user_id: user.id,
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

    if (error) {
      console.error("Supabase insert invoice error:", error);
      return NextResponse.json(
        { success: false, error: "Database error creating invoice." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      invoice: created,
      message: `Invoice ${invoiceNumber} created successfully.`,
    });
  } catch (error) {
    console.error("Finance Invoices POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create invoice." },
      { status: 500 }
    );
  }
}
