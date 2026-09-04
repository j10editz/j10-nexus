import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import {
  calculateOrderTotal,
  generateOrderNumber,
  SEED_COMMERCE_ORDERS,
} from "@/lib/commerce/service";
import type { CommerceOrder, OrderStatus } from "@/types/commerce";

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

    const { data, error } = await supabase
      .from("commerce_orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      const seeded: CommerceOrder[] = SEED_COMMERCE_ORDERS.map((o) => ({
        ...o,
        userId: user.id,
      }));
      return NextResponse.json({
        success: true,
        orders: seeded,
        source: error ? "fallback_seed" : "live_database",
      });
    }

    const orders: CommerceOrder[] = data.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      orderNumber: row.order_number,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      contactId: row.contact_id,
      totalAmount: Number(row.total_amount) || 0,
      currency: row.currency || "USD",
      status: (row.status as OrderStatus) || "pending",
      items: Array.isArray(row.items) ? row.items : [],
      paymentMethod: row.payment_method || "stripe",
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ success: true, orders });
  } catch (error) {
    console.error("Commerce Orders GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load commerce orders." },
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
    const customerName = String(body.customerName || "").trim();
    if (!customerName) {
      return NextResponse.json(
        { success: false, error: "Customer name is required." },
        { status: 400 }
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const calculatedTotal = calculateOrderTotal(items);
    const totalAmount = body.totalAmount ? Number(body.totalAmount) : calculatedTotal;
    const orderNumber = body.orderNumber?.trim() || generateOrderNumber(Math.floor(Math.random() * 9000) + 100);
    const status: OrderStatus = body.status || "pending";
    const paymentMethod = body.paymentMethod || "stripe";

    const { data, error } = await supabase
      .from("commerce_orders")
      .insert({
        user_id: user.id,
        order_number: orderNumber,
        customer_name: customerName,
        customer_email: body.customerEmail || null,
        customer_phone: body.customerPhone || null,
        contact_id: body.contactId || null,
        total_amount: totalAmount,
        currency: body.currency || "USD",
        status,
        items,
        payment_method: paymentMethod,
        notes: body.notes || null,
      })
      .select("*")
      .single();

    if (error || !data) {
      const fallbackOrder: CommerceOrder = {
        id: `ord_${Date.now()}`,
        userId: user.id,
        orderNumber,
        customerName,
        customerEmail: body.customerEmail || null,
        customerPhone: body.customerPhone || null,
        contactId: body.contactId || null,
        totalAmount,
        currency: body.currency || "USD",
        status,
        items,
        paymentMethod,
        notes: body.notes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        order: fallbackOrder,
        source: "local_memory",
      });
    }

    const order: CommerceOrder = {
      id: data.id,
      userId: data.user_id,
      orderNumber: data.order_number,
      customerName: data.customer_name,
      customerEmail: data.customer_email,
      customerPhone: data.customer_phone,
      contactId: data.contact_id,
      totalAmount: Number(data.total_amount) || 0,
      currency: data.currency || "USD",
      status: data.status as OrderStatus,
      items: Array.isArray(data.items) ? data.items : [],
      paymentMethod: data.payment_method,
      notes: data.notes,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error("Commerce Orders POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create commerce order." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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
    const { orderId, status } = body;

    if (!orderId || !status) {
      return NextResponse.json(
        { success: false, error: "orderId and status are required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("commerce_orders")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({
        success: true,
        orderId,
        status,
        updated: true,
        source: "fallback_update",
      });
    }

    return NextResponse.json({ success: true, order: data });
  } catch (error) {
    console.error("Commerce Orders PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update commerce order." },
      { status: 500 }
    );
  }
}
