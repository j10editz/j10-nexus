import { describe, expect, it } from "vitest";
import {
  calculateOrderTotal,
  computeCommerceSummary,
  generateOrderNumber,
  generateWhatsAppOrderLink,
  buildWhatsAppClickToPayLink,
  getInventoryStatus,
  SEED_COMMERCE_ORDERS,
  SEED_COMMERCE_PRODUCTS,
} from "@/lib/commerce/service";
import type { CommerceOrder, CommerceProduct } from "@/types/commerce";

describe("Commerce Service & Calculation Engine", () => {
  it("calculates order line items total accurately", () => {
    const items = [
      { quantity: 2, unitPrice: 49.99 },
      { quantity: 1, unitPrice: 100.00 },
      { quantity: 3, unitPrice: 15.00 },
    ];
    const total = calculateOrderTotal(items);
    expect(total).toBeCloseTo(244.98, 2);
  });

  it("generates sequential standardized order numbers", () => {
    const currentYear = new Date().getFullYear();
    const orderNumber1 = generateOrderNumber(0);
    const orderNumber42 = generateOrderNumber(41);

    expect(orderNumber1).toBe(`ORD-${currentYear}-0001`);
    expect(orderNumber42).toBe(`ORD-${currentYear}-0042`);
  });

  it("aggregates commerce summary metrics from products and orders", () => {
    const mockProducts: CommerceProduct[] = [
      {
        id: "p1",
        name: "Item 1",
        sku: "SKU1",
        price: 100,
        currency: "USD",
        inventory: 10,
        category: "General",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "p2",
        name: "Item 2",
        sku: "SKU2",
        price: 50,
        currency: "USD",
        inventory: 0,
        category: "General",
        status: "out_of_stock",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockOrders: CommerceOrder[] = [
      {
        id: "o1",
        orderNumber: "ORD-2026-0001",
        customerName: "Alice",
        totalAmount: 200,
        currency: "USD",
        status: "paid",
        items: [],
        paymentMethod: "stripe",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "o2",
        orderNumber: "ORD-2026-0002",
        customerName: "Bob",
        totalAmount: 300,
        currency: "USD",
        status: "fulfilled",
        items: [],
        paymentMethod: "stripe",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "o3",
        orderNumber: "ORD-2026-0003",
        customerName: "Charlie",
        totalAmount: 150,
        currency: "USD",
        status: "pending",
        items: [],
        paymentMethod: "stripe",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const summary = computeCommerceSummary(mockProducts, mockOrders);

    // Paid ($200) + Fulfilled ($300) = $500
    expect(summary.totalCatalogRevenue).toBe(500);
    expect(summary.totalOrdersCount).toBe(3);
    expect(summary.activeProductsCount).toBe(1);
    expect(summary.averageOrderValue).toBe(250); // $500 / 2
    expect(summary.pendingOrdersCount).toBe(1);
    expect(summary.fulfilledOrdersCount).toBe(1);
  });

  it("builds valid WhatsApp Click-to-Order deep links", () => {
    const link = generateWhatsAppOrderLink(
      "+1 (555) 349-2810",
      { name: "Enterprise AI", sku: "J10-ENT", price: 2999, currency: "USD" },
      2
    );

    expect(link).toContain("https://wa.me/15553492810?text=");
    expect(decodeURIComponent(link)).toContain("Enterprise AI");
    expect(decodeURIComponent(link)).toContain("J10-ENT");
    expect(decodeURIComponent(link)).toContain("$5998.00 USD");
  });

  it("creates valid WhatsApp click-to-pay link with stripe checkout URL", () => {
    const payLink = buildWhatsAppClickToPayLink({
      businessPhone: "+1 (555) 987-6543",
      productName: "Growth Tier Subscription",
      orderNumber: "ORD-2026-0099",
      price: 499.0,
      currency: "USD",
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_123",
    });

    expect(payLink).toContain("https://wa.me/15559876543?text=");
    const decoded = decodeURIComponent(payLink);
    expect(decoded).toContain("ORD-2026-0099");
    expect(decoded).toContain("Growth Tier Subscription");
    expect(decoded).toContain("$499.00 USD");
    expect(decoded).toContain("https://checkout.stripe.com/pay/cs_test_123");

    // Inventory status tests
    expect(getInventoryStatus(15).status).toBe("in_stock");
    expect(getInventoryStatus(4).status).toBe("low_stock");
    expect(getInventoryStatus(0).status).toBe("out_of_stock");
  });
});
