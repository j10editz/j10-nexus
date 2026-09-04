import { NextResponse } from "next/server";
import { createStripePaymentLink } from "@/lib/stripe";
import { stripEmojis } from "@/lib/website/service";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      productId,
      productName,
      sku,
      price,
      currency = "USD",
      customerEmail,
      customerPhone,
      description,
    } = body;

    if (!productName || typeof price !== "number") {
      return NextResponse.json(
        { success: false, error: "Product name and numeric price are required." },
        { status: 400 }
      );
    }

    const stripeResult = await createStripePaymentLink({
      title: productName,
      description,
      amount: price,
      currency,
      customerEmail,
      productId,
      sku,
    });

    // Build companion WhatsApp Click-to-Pay deep link
    const cleanPhone = (customerPhone || "").replace(/\D/g, "");
    const waText = stripEmojis(
      `Hello! Here is your official checkout link for ${productName} ($${price.toFixed(2)} ${currency}):\n${stripeResult.checkoutUrl}\n\nPlease let us know once paid so we can provision your order immediately.`
    );
    const whatsappPaymentLink = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;

    return NextResponse.json({
      success: true,
      checkoutUrl: stripeResult.checkoutUrl,
      sessionId: stripeResult.sessionId,
      mode: stripeResult.mode,
      amount: stripeResult.amount,
      currency: stripeResult.currency,
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
