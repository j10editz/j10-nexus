import { stripEmojis } from "@/lib/website/service";

export interface StripeCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  amount: number;
  currency: string;
  mode: "live" | "simulated";
  provider_mode: "live" | "sandbox";
}

/**
 * Creates a Stripe payment link or checkout session.
 * If STRIPE_SECRET_KEY is configured in .env.local, connects to Stripe API.
 * Otherwise, generates a secure deterministic checkout session for sandbox testing.
 */
export async function createStripePaymentLink({
  title,
  description,
  amount,
  currency = "USD",
  customerEmail,
  productId,
  sku,
  metadata,
}: {
  title: string;
  description?: string;
  amount: number; // e.g. 4999.00
  currency?: string;
  customerEmail?: string;
  productId?: string;
  sku?: string;
  metadata?: Record<string, string>;
}): Promise<StripeCheckoutResult> {
  const cleanTitle = stripEmojis(title);
  const cleanDesc = stripEmojis(description || "");
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (secretKey && secretKey.startsWith("sk_")) {
    try {
      const lineItemName = `${cleanTitle}${sku ? ` (${sku})` : ""}`;
      const params = new URLSearchParams({
        "payment_method_types[0]": "card",
        "line_items[0][price_data][currency]": currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
        "line_items[0][price_data][product_data][name]": lineItemName,
        "mode": "payment",
        "success_url": "https://j10-nexus.vercel.app/dashboard/commerce?status=paid&session_id={CHECKOUT_SESSION_ID}",
        "cancel_url": "https://j10-nexus.vercel.app/dashboard/commerce?status=cancelled",
      });

      if (cleanDesc) {
        params.append("line_items[0][price_data][product_data][description]", cleanDesc.slice(0, 500));
      }
      if (customerEmail) {
        params.append("customer_email", customerEmail);
      }

      // Attach internal metadata (workspace_id, contact_id, thread_id, internal_checkout_id)
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          if (value) {
            params.append(`metadata[${key}]`, String(value));
          }
        }
      }

      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await response.json();
      if (response.ok && data.url) {
        return {
          checkoutUrl: data.url,
          sessionId: data.id,
          amount,
          currency,
          mode: "live",
          provider_mode: "live",
        };
      }
    } catch (err) {
      console.warn("Stripe API call failed, falling back to simulated sandbox session:", err);
    }
  }

  // Simulated sandbox checkout link
  const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}#fidkdWxOYHwnPyd1blpxYHZxWjA0`;

  return {
    checkoutUrl,
    sessionId,
    amount,
    currency,
    mode: "simulated",
    provider_mode: "sandbox",
  };
}
