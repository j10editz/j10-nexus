"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Box,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  Layers,
  Loader2,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";

import {
  calculateOrderTotal,
  computeCommerceSummary,
  generateOrderNumber,
  generateWhatsAppOrderLink,
  getInventoryStatus,
  SEED_COMMERCE_ORDERS,
  SEED_COMMERCE_PRODUCTS,
} from "@/lib/commerce/service";
import type {
  CommerceOrder,
  CommerceProduct,
  CommerceSummary,
  OrderItem,
  OrderStatus,
  ProductStatus,
} from "@/types/commerce";
import { stripEmojis } from "@/lib/website/service";

type TabType = "overview" | "products" | "orders" | "billing_revenue" | "ai-studio";

export default function CommerceDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [products, setProducts] = useState<CommerceProduct[]>(SEED_COMMERCE_PRODUCTS as CommerceProduct[]);
  const [orders, setOrders] = useState<CommerceOrder[]>(SEED_COMMERCE_ORDERS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedOrderStatus, setSelectedOrderStatus] = useState("all");

  // Add Product Modal
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdSku, setNewProdSku] = useState("");
  const [newProdCategory, setNewProdCategory] = useState("Software & AI");
  const [newProdPrice, setNewProdPrice] = useState("");
  const [newProdInventory, setNewProdInventory] = useState("");
  const [newProdDesc, setNewProdDesc] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);

  // Stripe Checkout Link Generator Modal
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutProduct, setCheckoutProduct] = useState<CommerceProduct | null>(null);
  const [checkoutCustomerPhone, setCheckoutCustomerPhone] = useState("+15550192834");
  const [checkoutCustomerEmail, setCheckoutCustomerEmail] = useState("");
  const [generatingCheckout, setGeneratingCheckout] = useState(false);
  const [generatedStripeUrl, setGeneratedStripeUrl] = useState("");
  const [generatedWaPaymentUrl, setGeneratedWaPaymentUrl] = useState("");
  const [copiedLinkType, setCopiedLinkType] = useState<"stripe" | "wa" | null>(null);

  // AI Copy Studio
  const [aiSelectedProduct, setAiSelectedProduct] = useState<string>("");
  const [aiTargetAudience, setAiTargetAudience] = useState("Enterprise founders & sales leaders");
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [generatedCopy, setGeneratedCopy] = useState("");
  const [copiedNotification, setCopiedNotification] = useState("");

  // WhatsApp Click-to-Order Builder
  const [waPhone, setWaPhone] = useState("+15553492810");
  const [waSelectedProdId, setWaSelectedProdId] = useState("");
  const [waQuantity, setWaQuantity] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [prodRes, ordRes] = await Promise.all([
        fetch("/api/commerce/products", { cache: "no-store" }),
        fetch("/api/commerce/orders", { cache: "no-store" }),
      ]);

      const prodData = await prodRes.json();
      const ordData = await ordRes.json();

      if (prodData.success && prodData.products?.length > 0) {
        setProducts(prodData.products);
      } else {
        setProducts(SEED_COMMERCE_PRODUCTS as CommerceProduct[]);
      }

      if (ordData.success && ordData.orders?.length > 0) {
        setOrders(ordData.orders);
      } else {
        setOrders(SEED_COMMERCE_ORDERS);
      }
    } catch {
      setProducts(SEED_COMMERCE_PRODUCTS as CommerceProduct[]);
      setOrders(SEED_COMMERCE_ORDERS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary: CommerceSummary = useMemo(() => {
    return computeCommerceSummary(products, orders);
  }, [products, orders]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ["all", ...Array.from(set)];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.customerEmail && o.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = selectedOrderStatus === "all" || o.status === selectedOrderStatus;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, selectedOrderStatus]);

  // Handle Add Product
  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProdName || !newProdPrice) return;
    setSavingProduct(true);
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: stripEmojis(newProdName),
          sku: newProdSku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
          category: newProdCategory,
          price: parseFloat(newProdPrice),
          inventory: parseInt(newProdInventory) || 0,
          description: stripEmojis(newProdDesc),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddProduct(false);
        setNewProdName("");
        setNewProdSku("");
        setNewProdPrice("");
        setNewProdInventory("");
        setNewProdDesc("");
        await fetchData();
      }
    } catch (err) {
      console.error("Create product failed:", err);
    } finally {
      setSavingProduct(false);
    }
  }

  // Handle Order Status Update
  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    try {
      const res = await fetch("/api/commerce/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: newStatus }),
      });
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
        );
      }
    } catch (err) {
      console.error("Order status update failed:", err);
    }
  }

  // Handle Stripe Checkout Link Generation
  async function handleOpenCheckoutModal(prod: CommerceProduct) {
    setCheckoutProduct(prod);
    setCheckoutCustomerEmail("");
    setGeneratedStripeUrl("");
    setGeneratedWaPaymentUrl("");
    setCheckoutModalOpen(true);
    setGeneratingCheckout(true);

    try {
      const res = await fetch("/api/commerce/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          price: prod.price,
          currency: prod.currency || "USD",
          customerPhone: checkoutCustomerPhone,
          description: prod.description,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedStripeUrl(data.checkoutUrl);
        setGeneratedWaPaymentUrl(data.whatsappPaymentLink);
      }
    } catch (err) {
      console.error("Failed to generate checkout link:", err);
    } finally {
      setGeneratingCheckout(false);
    }
  }

  // Handle AI Copy Generation
  async function handleGenerateCopy() {
    const prod = products.find((p) => p.id === aiSelectedProduct);
    if (!prod || generatingCopy) return;
    setGeneratingCopy(true);
    setGeneratedCopy("");
    try {
      const res = await fetch("/api/commerce/ai-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: prod.name,
          category: prod.category,
          price: prod.price,
          audience: aiTargetAudience,
        }),
      });
      const data = await res.json();
      if (data.success && data.copy) {
        setGeneratedCopy(stripEmojis(data.copy));
      }
    } catch (err) {
      console.error("AI copy generation failed:", err);
    } finally {
      setGeneratingCopy(false);
    }
  }

  // Generate WhatsApp Order Link
  const activeWaLink = useMemo(() => {
    const prod = products.find((p) => p.id === (waSelectedProdId || products[0]?.id));
    if (!prod) return "";
    return generateWhatsAppOrderLink(waPhone, prod, waQuantity);
  }, [products, waSelectedProdId, waPhone, waQuantity]);

  function copyToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopiedNotification(label);
    setTimeout(() => setCopiedNotification(""), 3000);
  }

  return (
    <div className="min-h-screen bg-[#09090B] p-4 sm:p-6 lg:p-8 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.08] pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Store size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Commerce & Stripe Hub</h1>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Ready · Live
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                Unified product catalog, instant Stripe payment links, and WhatsApp click-to-pay conversion.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                void fetchData();
              }}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-40"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin text-emerald-400" : ""} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddProduct(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-black shadow-lg shadow-emerald-500/20 transition hover:opacity-90"
            >
              <Plus size={14} />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {copiedNotification && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span>{copiedNotification}</span>
            </div>
            <button onClick={() => setCopiedNotification("")} className="text-zinc-500 hover:text-zinc-300">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium uppercase tracking-wider">Catalog Revenue</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <DollarSign size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">
              ${summary.totalCatalogRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            <span className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
              <TrendingUp size={12} />
              <span>Gross fulfilled value</span>
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium uppercase tracking-wider">Active Products</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Package size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">{summary.activeProductsCount}</p>
            <span className="mt-1 text-[11px] text-zinc-500">Live in direct checkout</span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium uppercase tracking-wider">Total Orders</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <ShoppingBag size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">{summary.totalOrdersCount}</p>
            <span className="mt-1 text-[11px] text-zinc-500">
              {summary.pendingOrdersCount} pending · {summary.fulfilledOrdersCount} fulfilled
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium uppercase tracking-wider">Avg Order Value</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <BarChart3 size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">
              ${summary.averageOrderValue.toLocaleString()}
            </p>
            <span className="mt-1 text-[11px] text-zinc-500">Across verified checkouts</span>
          </div>
        </div>

        {/* 5-Tab Navigation Desk */}
        <div className="flex rounded-xl border border-white/10 bg-[#111216] p-1 text-xs">
          {[
            { id: "overview", label: "Catalog Overview", icon: Store },
            { id: "products", label: "Products & Pricing", icon: Package },
            { id: "orders", label: "Orders Pipeline", icon: ShoppingBag },
            { id: "billing_revenue", label: "Stripe & Subscriptions", icon: CreditCard },
            { id: "ai-studio", label: "AI Copy Studio", icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-medium transition ${
                  isActive
                    ? "bg-white/10 font-semibold text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Icon size={14} className={isActive ? "text-emerald-400" : "text-zinc-500"} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Recent Orders List */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <h3 className="text-sm font-bold text-white tracking-tight">Recent Orders</h3>
                  <button onClick={() => setActiveTab("orders")} className="text-xs text-emerald-400 hover:underline">
                    View All &rarr;
                  </button>
                </div>
                <div className="space-y-3">
                  {orders.slice(0, 4).map((o) => (
                    <div key={o.id} className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-black/30 p-3 text-xs">
                      <div>
                        <p className="font-bold text-white">{o.customerName}</p>
                        <p className="text-[11px] text-zinc-500">{o.orderNumber} · {o.items.length} item(s)</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-400">${Number(o.totalAmount).toFixed(2)}</p>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{o.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Low Stock & Catalog Health */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <h3 className="text-sm font-bold text-white tracking-tight">Inventory & Restock Alerts</h3>
                  <span className="text-[11px] text-zinc-400">{products.length} total items</span>
                </div>
                <div className="space-y-3">
                  {products.map((p) => {
                    const stock = getInventoryStatus(p.inventory);
                    return (
                      <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-black/30 p-3 text-xs">
                        <div>
                          <p className="font-bold text-white">{p.name}</p>
                          <p className="text-[11px] text-zinc-500">{p.sku} · ${p.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              stock.status === "in_stock"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : stock.status === "low_stock"
                                ? "bg-amber-500/15 text-amber-300"
                                : "bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            {stock.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenCheckoutModal(p)}
                            className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:text-white"
                          >
                            Pay Link
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRODUCTS & PRICING */}
        {activeTab === "products" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((p) => {
                const stock = getInventoryStatus(p.inventory);
                return (
                  <div key={p.id} className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{p.category}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            stock.status === "in_stock"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : stock.status === "low_stock"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {stock.label}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-bold text-white">{p.name}</h3>
                      <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{p.description}</p>
                      <p className="mt-3 text-xl font-extrabold text-emerald-400">
                        ${p.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-zinc-500 ml-1">{p.currency || "USD"}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => handleOpenCheckoutModal(p)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2 text-xs font-bold text-black hover:opacity-90 transition"
                      >
                        <CreditCard size={13} />
                        <span>Stripe Link</span>
                      </button>
                      <a
                        href={generateWhatsAppOrderLink(waPhone, p, 1)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition"
                        title="Open WhatsApp Click-to-Order"
                      >
                        <MessageSquare size={13} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: ORDERS PIPELINE */}
        {activeTab === "orders" && (
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <h3 className="text-sm font-bold text-white">Customer Orders</h3>
              <span className="text-xs text-zinc-400">{orders.length} total tracked</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="border-b border-white/[0.08] text-[11px] uppercase font-semibold text-zinc-500">
                  <tr>
                    <th className="py-2.5 px-3">Order Number</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Total</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3 font-mono text-zinc-400">{o.orderNumber}</td>
                      <td className="py-3 px-3 font-semibold text-white">
                        {o.customerName}
                        {o.customerPhone && <span className="block text-[11px] font-normal text-zinc-500">{o.customerPhone}</span>}
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-400">${Number(o.totalAmount).toFixed(2)}</td>
                      <td className="py-3 px-3">
                        <select
                          value={o.status}
                          onChange={(e) => handleStatusChange(o.id, e.target.value as OrderStatus)}
                          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white focus:outline-none"
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="fulfilled">Fulfilled</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        {o.customerPhone && (
                          <a
                            href={`https://wa.me/${o.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${o.customerName}, confirming update regarding your order ${o.orderNumber}.`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
                          >
                            <MessageSquare size={11} />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: STRIPE & SUBSCRIPTIONS */}
        {activeTab === "billing_revenue" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { name: "Starter Tier", price: "$49 / mo", limit: "1,000 WhatsApp Msgs", agents: "2 AI Employees", desc: "For single founders launching automated customer capture." },
                { name: "Growth Tier", price: "$149 / mo", limit: "10,000 WhatsApp Msgs", agents: "10 AI Employees", popular: true, desc: "Autonomous multi-agent sales & marketing operations." },
                { name: "Enterprise Tier", price: "$499 / mo", limit: "100,000 WhatsApp Msgs", agents: "Unlimited AI Employees", desc: "Dedicated throughput with custom SLA and high scale." },
              ].map((tier, i) => (
                <div key={i} className={`rounded-2xl border p-5 space-y-3 ${tier.popular ? "border-violet-500/50 bg-violet-500/[0.04]" : "border-white/[0.08] bg-[#111216]"}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{tier.name}</h3>
                    {tier.popular && (
                      <span className="rounded-full bg-violet-500/20 border border-violet-500/40 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-extrabold text-white">{tier.price}</p>
                  <p className="text-xs text-zinc-400">{tier.desc}</p>
                  <div className="pt-2 border-t border-white/[0.06] text-xs space-y-1 text-zinc-300">
                    <p>• {tier.limit}</p>
                    <p>• {tier.agents}</p>
                  </div>
                  <Link
                    href="/dashboard/settings/billing"
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
                  >
                    <span>Manage in Settings</span>
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Stripe Webhook Synchronization</h4>
                  <p className="text-xs text-zinc-400">Automatic payment processing, invoice generation, and account entitlement grants.</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-300">
                Connected
              </span>
            </div>
          </div>
        )}

        {/* TAB 5: AI COPY STUDIO */}
        {activeTab === "ai-studio" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-6 space-y-4">
              <h3 className="text-base font-bold text-white">Product Copywriter</h3>
              <p className="text-xs text-zinc-400">Generate conversion-focused sales descriptions for any catalog item.</p>

              <div>
                <label className="block text-xs font-medium text-zinc-400">Select Product</label>
                <select
                  value={aiSelectedProduct}
                  onChange={(e) => setAiSelectedProduct(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-2.5 text-xs text-white focus:outline-none"
                >
                  <option value="">Choose product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${p.price})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400">Target Audience</label>
                <input
                  type="text"
                  value={aiTargetAudience}
                  onChange={(e) => setAiTargetAudience(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] p-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateCopy}
                disabled={generatingCopy || !aiSelectedProduct}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-xs font-bold text-black disabled:opacity-50"
              >
                {generatingCopy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>Generate Product Pitch</span>
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-6 space-y-3">
              <h3 className="text-base font-bold text-white">Generated Pitch</h3>
              {generatedCopy ? (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed rounded-xl border border-white/5 bg-black/40 p-4">
                    {generatedCopy}
                  </p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedCopy, "Product copy copied to clipboard.")}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
                  >
                    <Copy size={12} />
                    <span>Copy Text</span>
                  </button>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Select a product and click Generate to produce sales copy.</p>
              )}
            </div>
          </div>
        )}

        {/* STRIPE CHECKOUT MODAL */}
        {checkoutModalOpen && checkoutProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0E0F14] p-6 shadow-2xl space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <CreditCard size={16} className="text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Instant Checkout Generator</h3>
                </div>
                <button onClick={() => setCheckoutModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1">
                <p className="text-xs font-bold text-white">{checkoutProduct.name}</p>
                <p className="text-[11px] text-zinc-400">{checkoutProduct.sku} · ${checkoutProduct.price.toFixed(2)} {checkoutProduct.currency || "USD"}</p>
              </div>

              {generatingCheckout ? (
                <div className="py-8 text-center space-y-2">
                  <Loader2 size={24} className="animate-spin text-emerald-400 mx-auto" />
                  <p className="text-zinc-400 text-xs">Connecting to Stripe payment gateway...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 uppercase">Stripe Checkout URL</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedStripeUrl}
                        className="flex-1 rounded-xl border border-white/10 bg-[#12141A] px-3 py-2 text-xs text-white select-all focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedStripeUrl);
                          setCopiedLinkType("stripe");
                          setTimeout(() => setCopiedLinkType(null), 2500);
                        }}
                        className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black hover:bg-zinc-200"
                      >
                        {copiedLinkType === "stripe" ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedLinkType === "stripe" ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 uppercase">WhatsApp Click-to-Pay Message</label>
                    <div className="mt-1">
                      <a
                        href={generatedWaPaymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 font-bold text-white transition"
                      >
                        <MessageSquare size={14} />
                        <span>Send Payment Link via WhatsApp &rarr;</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADD PRODUCT MODAL */}
        {showAddProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0E0F14] p-6 shadow-2xl space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="text-base font-bold text-white">Add Catalog Product</h3>
                <button onClick={() => setShowAddProduct(false)} className="text-zinc-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="space-y-3">
                <div>
                  <label className="block font-medium text-zinc-400">Product Name</label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-400">Price (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-zinc-400">Inventory Units</label>
                    <input
                      type="number"
                      value={newProdInventory}
                      onChange={(e) => setNewProdInventory(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-400">Category</label>
                  <input
                    type="text"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-400">Description</label>
                  <textarea
                    rows={3}
                    value={newProdDesc}
                    onChange={(e) => setNewProdDesc(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setShowAddProduct(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="rounded-xl bg-white px-5 py-2 font-semibold text-black hover:bg-zinc-200"
                  >
                    {savingProduct ? "Saving..." : "Create Product"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
