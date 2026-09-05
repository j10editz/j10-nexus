import { NextResponse } from "next/server";
import { createStripePaymentLink } from "@/lib/stripe";
import { stripEmojis } from "@/lib/website/service";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      productId,
      productName,
      title,
      sku,
      price,
      amount,
      unitAmountCents,
      currency = "USD",
      customerEmail,
      customerPhone,
      customerName,
      description,
      threadId,
      contactId: rawContactId,
    } = body;

    const resolvedTitle = productName || title;
    const resolvedPrice =
      typeof price === "number"
        ? price
        : typeof amount === "number"
        ? amount
        : typeof unitAmountCents === "number"
        ? unitAmountCents / 100
        : null;

    if (!resolvedTitle || typeof resolvedPrice !== "number" || resolvedPrice <= 0) {
      return NextResponse.json(
        { success: false, error: "Valid product name and positive numeric price are required." },
        { status: 400 }
      );
    }

    if (resolvedPrice > 1_000_000) {
      return NextResponse.json(
        { success: false, error: "Price exceeds allowable transaction limits." },
        { status: 400 }
      );
    }

    // 1. Resolve workspace context
    const context = await getActiveWorkspaceContext();
    const workspaceId = context?.workspace?.id || null;
    let validatedContactId = rawContactId || null;
    let validatedThreadId = threadId || null;

    const supabase = createServerSupabaseClient();

    // 2. Validate tenant boundaries if context is active
    if (context && workspaceId) {
      if (threadId) {
        const { data: thread } = await supabase
          .from("inbox_threads")
          .select("id, workspace_id, contact_id")
          .eq("id", threadId)
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        if (!thread) {
          return NextResponse.json(
            { success: false, error: "Forbidden: Conversation thread does not belong to active workspace." },
            { status: 403 }
          );
        }

        if (!validatedContactId && thread.contact_id) {
          validatedContactId = thread.contact_id;
        }
      }

      if (validatedContactId) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("id, workspace_id")
          .eq("id", validatedContactId)
          .eq("workspace_id", workspaceId)
          .maybeSingle();

        if (!contact) {
          return NextResponse.json(
            { success: false, error: "Forbidden: Contact does not belong to active workspace." },
            { status: 403 }
          );
        }
      }
    }

    // 3. Pre-create pending payment checkout record in database if workspace is resolved
    let internalCheckoutId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (workspaceId) {
      const { data: checkoutRecord, error: checkoutError } = await supabase
        .from("payment_checkouts")
        .insert({
          workspace_id: workspaceId,
          contact_id: validatedContactId,
          thread_id: validatedThreadId,
          amount: resolvedPrice,
          currency: currency.toUpperCase(),
          description: resolvedTitle,
          status: "pending",
          checkout_url: "pending_provider_creation",
          provider_mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
          metadata: {
            customerEmail: customerEmail || null,
            customerPhone: customerPhone || null,
            customerName: customerName || null,
            productId: productId || null,
            sku: sku || null,
          },
        })
        .select("id")
        .single();

      if (!checkoutError && checkoutRecord) {
        internalCheckoutId = checkoutRecord.id;
      }
    }

    // 4. Create Stripe checkout session with trusted internal metadata
    const stripeResult = await createStripePaymentLink({
      title: resolvedTitle,
      description,
      amount: resolvedPrice,
      currency,
      customerEmail,
      productId,
      sku,
      metadata: {
        workspace_id: workspaceId || "sandbox",
        contact_id: validatedContactId || "",
        thread_id: validatedThreadId || "",
        internal_checkout_id: internalCheckoutId,
      },
    });

    // 5. Update checkout record with provider URL and session id
    if (workspaceId && internalCheckoutId) {
      await supabase
        .from("payment_checkouts")
        .update({
          stripe_checkout_session_id: stripeResult.sessionId,
          checkout_url: stripeResult.checkoutUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", internalCheckoutId);
    }

    // 6. Build companion WhatsApp Click-to-Pay deep link
    const cleanPhone = (customerPhone || "").replace(/\D/g, "");
    const waText = stripEmojis(
      `Hello! Here is your official checkout link for ${resolvedTitle} ($${resolvedPrice.toFixed(2)} ${currency}):\n${stripeResult.checkoutUrl}\n\nPlease let us know once paid so we can provision your order immediately.`
    );
    const whatsappPaymentLink = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;

    return NextResponse.json({
      success: true,
      checkoutId: internalCheckoutId,
      checkoutUrl: stripeResult.checkoutUrl,
      sessionId: stripeResult.sessionId,
      mode: stripeResult.mode,
      provider_mode: stripeResult.provider_mode || (stripeResult.mode === "live" ? "live" : "sandbox"),
      amount: stripeResult.amount,
      currency: stripeResult.currency,
      workspaceId: workspaceId || null,
      whatsappPaymentLink,
    });
  } catch (error) {
    console.error("Commerce checkout API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate Stripe checkout link." },
      { status: 500 }
    );
  }
}
