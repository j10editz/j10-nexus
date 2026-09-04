export type ProductStatus = "active" | "out_of_stock" | "archived";
export type OrderStatus = "pending" | "paid" | "fulfilled" | "canceled";

export interface CommerceProduct {
  id: string;
  userId?: string;
  name: string;
  sku: string;
  description?: string | null;
  price: number;
  currency: string;
  inventory: number;
  category: string;
  status: ProductStatus;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId?: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface CommerceOrder {
  id: string;
  userId?: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  contactId?: string | null;
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  items: OrderItem[];
  paymentMethod: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceSummary {
  totalCatalogRevenue: number;
  totalOrdersCount: number;
  activeProductsCount: number;
  averageOrderValue: number;
  pendingOrdersCount: number;
  fulfilledOrdersCount: number;
}
