import type {
  CommerceOrder,
  CommerceProduct,
  CommerceSummary,
  OrderItem,
  OrderStatus,
  ProductStatus,
} from "@/types/commerce";

export function calculateOrderTotal(
  items: Array<{ quantity: number; unitPrice: number }>
): number {
  return items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
}

export function generateOrderNumber(sequenceIndex: number): string {
  const currentYear = new Date().getFullYear();
  const padded = String(sequenceIndex + 1).padStart(4, "0");
  return `ORD-${currentYear}-${padded}`;
}

export function computeCommerceSummary(
  products: CommerceProduct[],
  orders: CommerceOrder[]
): CommerceSummary {
  let paidRevenue = 0;
  let paidCount = 0;
  let pendingOrdersCount = 0;
  let fulfilledOrdersCount = 0;

  for (const order of orders) {
    if (order.status === "paid" || order.status === "fulfilled") {
      paidRevenue += Number(order.totalAmount) || 0;
      paidCount += 1;
    }

    if (order.status === "pending") {
      pendingOrdersCount += 1;
    } else if (order.status === "fulfilled") {
      fulfilledOrdersCount += 1;
    }
  }

  const activeProductsCount = products.filter((p) => p.status === "active").length;
  const averageOrderValue = paidCount > 0 ? Math.round(paidRevenue / paidCount) : 0;

  return {
    totalCatalogRevenue: paidRevenue,
    totalOrdersCount: orders.length,
    activeProductsCount,
    averageOrderValue,
    pendingOrdersCount,
    fulfilledOrdersCount,
  };
}

export function generateWhatsAppOrderLink(
  businessPhone: string,
  product: { name: string; sku: string; price: number; currency?: string },
  quantity = 1
): string {
  const cleanPhone = businessPhone.replace(/[\s()+.-]/g, "");
  const currency = product.currency || "USD";
  const total = (product.price * quantity).toFixed(2);
  const message = `Hello, I would like to order:
- Product: ${product.name}
- SKU: ${product.sku}
- Quantity: ${quantity}
- Total: $${total} ${currency}

Please confirm availability and payment details.`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export const SEED_COMMERCE_PRODUCTS: Omit<CommerceProduct, "userId">[] = [
  {
    id: "prod_01",
    name: "J10 AI Enterprise Operating System",
    sku: "J10-OS-ENT",
    description: "Full-scale enterprise AI workforce suite with autonomous sales agents, CRM, and WhatsApp workflows.",
    price: 4999.00,
    currency: "USD",
    inventory: 100,
    category: "Software & AI",
    status: "active",
    imageUrl: null,
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_02",
    name: "WhatsApp Business AI Automation Pack",
    sku: "J10-WA-AUTO",
    description: "24/7 Meta Cloud API bot with grounded knowledge base, customer inbox, and CRM lead capture.",
    price: 1499.00,
    currency: "USD",
    inventory: 250,
    category: "Automation",
    status: "active",
    imageUrl: null,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_03",
    name: "J10 Custom Voice & Video Cloning Kit",
    sku: "J10-MEDIA-KIT",
    description: "High-definition creative AI models for executive branding, social avatars, and instant localization.",
    price: 899.00,
    currency: "USD",
    inventory: 50,
    category: "Creative AI",
    status: "active",
    imageUrl: null,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_04",
    name: "J10 Flow Visual Workflow Blueprints",
    sku: "J10-FLOW-BP",
    description: "Library of 50+ battle-tested automation templates with pre-configured API webhooks and integrations.",
    price: 349.00,
    currency: "USD",
    inventory: 0,
    category: "Templates",
    status: "out_of_stock",
    imageUrl: null,
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const SEED_COMMERCE_ORDERS: Omit<CommerceOrder, "userId">[] = [
  {
    id: "ord_01",
    orderNumber: "ORD-2026-0001",
    customerName: "Acme Logistics Group",
    customerEmail: "operations@acmelogistics.com",
    customerPhone: "+1 (555) 349-2810",
    totalAmount: 4999.00,
    currency: "USD",
    status: "fulfilled",
    items: [
      {
        productId: "prod_01",
        name: "J10 AI Enterprise Operating System",
        sku: "J10-OS-ENT",
        quantity: 1,
        unitPrice: 4999.00,
        total: 4999.00,
      },
    ],
    paymentMethod: "stripe",
    notes: "Provisioned license key sent to CEO via encrypted vault.",
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "ord_02",
    orderNumber: "ORD-2026-0002",
    customerName: "Nova Health Tech",
    customerEmail: "contact@novahealth.io",
    customerPhone: "+1 (555) 892-4112",
    totalAmount: 1499.00,
    currency: "USD",
    status: "paid",
    items: [
      {
        productId: "prod_02",
        name: "WhatsApp Business AI Automation Pack",
        sku: "J10-WA-AUTO",
        quantity: 1,
        unitPrice: 1499.00,
        total: 1499.00,
      },
    ],
    paymentMethod: "stripe",
    notes: "Awaiting Meta WABA ID verification before deployment.",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "ord_03",
    orderNumber: "ORD-2026-0003",
    customerName: "Starlight Retailers",
    customerEmail: "sales@starlight.store",
    customerPhone: "+1 (555) 601-3829",
    totalAmount: 899.00,
    currency: "USD",
    status: "pending",
    items: [
      {
        productId: "prod_03",
        name: "J10 Custom Voice & Video Cloning Kit",
        sku: "J10-MEDIA-KIT",
        quantity: 1,
        unitPrice: 899.00,
        total: 899.00,
      },
    ],
    paymentMethod: "stripe",
    notes: "Pending checkout confirmation via WhatsApp Click-to-Chat.",
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
];
