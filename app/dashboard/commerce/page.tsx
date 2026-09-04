"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bot,
  Box,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  Layers,
  LoaderCircle,
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
} from "lucide-react";

import {
  calculateOrderTotal,
  computeCommerceSummary,
  generateOrderNumber,
  generateWhatsAppOrderLink,
} from "@/lib/commerce/service";
import type {
  CommerceOrder,
  CommerceProduct,
  CommerceSummary,
  OrderItem,
  OrderStatus,
  ProductStatus,
} from "@/types/commerce";

type TabType = "overview" | "products" | "orders" | "ai-studio";

export default function CommerceDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [products, setProducts] = useState<CommerceProduct[]>([]);
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [loading, setLoading] = useState(true);
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

      if (prodData.success) setProducts(prodData.products || []);
      if (ordData.success) setOrders(ordData.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load commerce data.");
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
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
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
        (o.customerPhone && o.customerPhone.includes(searchQuery));
      const matchesStatus = selectedOrderStatus === "all" || o.status === selectedOrderStatus;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, selectedOrderStatus]);

  // Handle Add Product
  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProdName.trim() || !newProdSku.trim() || savingProduct) return;
    setSavingProduct(true);
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProdName,
          sku: newProdSku,
          category: newProdCategory,
          price: parseFloat(newProdPrice) || 0,
          inventory: parseInt(newProdInventory) || 0,
          description: newProdDesc,
          status: "active",
        }),
      });
      const data = await res.json();
      if (data.success && data.product) {
        setProducts((prev) => [data.product, ...prev]);
        setShowAddProduct(false);
        setNewProdName("");
        setNewProdSku("");
        setNewProdPrice("");
        setNewProdInventory("");
        setNewProdDesc("");
      }
    } catch (err) {
      alert("Failed to save product. Check input values.");
    } finally {
      setSavingProduct(false);
    }
  }

  // Handle Order Status Transition
  async function handleUpdateOrderStatus(orderId: string, newStatus: OrderStatus) {
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
        setGeneratedCopy(data.copy);
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
    <div className="min-h-screen bg-[#0a0a0d] p-4 sm:p-6 lg:p-8 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.08] pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-transparent border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Store size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Commerce & Orders Hub</h1>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Ready · Live
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                Unified product catalog, order pipeline, and WhatsApp click-to-order conversions.
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

        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium">Total Revenue</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <DollarSign size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">
              ${summary.totalCatalogRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            <span className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
              <TrendingUp size={12} />
              <span>Paid & Fulfilled orders</span>
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium">Total Orders</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Package size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">
              {summary.totalOrdersCount}
            </p>
            <span className="mt-1 flex items-center gap-1 text-[11px] text-amber-400">
              <Clock size={12} />
              <span>{summary.pendingOrdersCount} pending fulfillment</span>
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium">Active Products</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <Layers size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">
              {summary.activeProductsCount}
            </p>
            <span className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
              <Box size={12} />
              <span>Across {categories.length - 1} categories</span>
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium">Average Order Value</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                <BarChart3 size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-white">
              ${summary.averageOrderValue.toLocaleString()}
            </p>
            <span className="mt-1 flex items-center gap-1 text-[11px] text-teal-400">
              <CheckCircle2 size={12} />
              <span>{summary.fulfilledOrdersCount} completed orders</span>
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-white/[0.08] pb-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === "overview"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <BarChart3 size={14} />
            <span>Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === "products"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Box size={14} />
            <span>Product Catalog ({products.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === "orders"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <ShoppingBag size={14} />
            <span>Orders & Fulfillment ({orders.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("ai-studio");
              if (!aiSelectedProduct && products[0]) {
                setAiSelectedProduct(products[0].id);
              }
            }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === "ai-studio"
                ? "bg-violet-500/15 text-violet-300 border border-violet-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Sparkles size={14} className="text-violet-400" />
            <span>AI Commerce Studio</span>
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Recent Orders List */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 lg:col-span-7">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Recent Orders</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("orders")}
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <span>View all</span>
                  <ArrowUpRight size={12} />
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">No orders recorded yet.</div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-100">{order.orderNumber}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                              order.status === "fulfilled"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : order.status === "paid"
                                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-zinc-400">{order.customerName}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-white">
                          ${order.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                        <time className="block text-[10px] text-zinc-500">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick WhatsApp Click-to-Order Widget */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 lg:col-span-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare size={16} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">WhatsApp Click-to-Order</h3>
                </div>
                <p className="text-xs text-zinc-400 mb-4">
                  Generate instant WhatsApp checkout links for customers to purchase catalog products with 1 click.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400">Target Product</label>
                    <select
                      value={waSelectedProdId || products[0]?.id}
                      onChange={(e) => setWaSelectedProdId(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white focus:border-emerald-500/40 focus:outline-none"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#111216]">
                          {p.name} (${p.price})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-zinc-400">WhatsApp Business Number</label>
                    <input
                      type="text"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white focus:border-emerald-500/40 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-2">
                <a
                  href={activeWaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
                >
                  <Send size={12} />
                  <span>Test Link</span>
                </a>
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeWaLink, "WhatsApp Link Copied!")}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.06] transition"
                >
                  <Copy size={12} />
                  <span>Copy</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Products Catalog */}
        {activeTab === "products" && (
          <div className="space-y-4">
            {/* Search & Category filter */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products by name, SKU..."
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 py-2 pl-9 pr-4 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                      selectedCategory === cat
                        ? "bg-white/[0.1] text-white"
                        : "text-zinc-400 hover:bg-white/[0.04]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#111216] p-5 transition hover:border-emerald-500/30"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                        {p.sku}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          p.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}
                      >
                        {p.status.replace("_", " ")}
                      </span>
                    </div>

                    <h4 className="mt-3 text-sm font-bold text-white">{p.name}</h4>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                      {p.description || "No description provided."}
                    </p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                    <div>
                      <span className="text-xs text-zinc-500">Price</span>
                      <p className="text-base font-bold text-emerald-400">${p.price.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-zinc-500">In Stock</span>
                      <p className="text-sm font-semibold text-zinc-200">{p.inventory} units</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Orders & Fulfillment */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex items-center gap-2">
              {["all", "pending", "paid", "fulfilled", "canceled"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSelectedOrderStatus(st)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    selectedOrderStatus === st
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "text-zinc-400 hover:bg-white/[0.04]"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Orders Table */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111216]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/[0.08] bg-black/20 text-zinc-400 font-semibold">
                  <tr>
                    <th className="p-4">Order #</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Items</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-white/[0.02] transition">
                      <td className="p-4 font-mono font-bold text-white">{ord.orderNumber}</td>
                      <td className="p-4">
                        <p className="font-semibold text-zinc-200">{ord.customerName}</p>
                        <p className="text-[10px] text-zinc-500">{ord.customerPhone || ord.customerEmail || "Direct"}</p>
                      </td>
                      <td className="p-4 text-zinc-400">
                        {ord.items.length > 0
                          ? `${ord.items[0].name}${ord.items.length > 1 ? ` +${ord.items.length - 1} more` : ""}`
                          : "1 item"}
                      </td>
                      <td className="p-4 font-bold text-emerald-400">
                        ${ord.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            ord.status === "fulfilled"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : ord.status === "paid"
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                              : ord.status === "canceled"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {ord.status === "pending" ? (
                          <button
                            type="button"
                            onClick={() => void handleUpdateOrderStatus(ord.id, "paid")}
                            className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
                          >
                            Mark Paid
                          </button>
                        ) : ord.status === "paid" ? (
                          <button
                            type="button"
                            onClick={() => void handleUpdateOrderStatus(ord.id, "fulfilled")}
                            className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-500/20"
                          >
                            Fulfill Order
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-600">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: AI Commerce Studio */}
        {activeTab === "ai-studio" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Form */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 lg:col-span-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-violet-400" />
                <h3 className="text-sm font-bold text-white">AI Product Copy Generator</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Generate high-converting headlines, feature benefits, and WhatsApp pitches using J10 AI.
              </p>

              <div>
                <label className="text-[11px] font-medium text-zinc-400">Select Product</label>
                <select
                  value={aiSelectedProduct}
                  onChange={(e) => setAiSelectedProduct(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white focus:border-violet-500/40 focus:outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#111216]">
                      {p.name} (${p.price})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400">Target Audience / Buyer Persona</label>
                <input
                  type="text"
                  value={aiTargetAudience}
                  onChange={(e) => setAiTargetAudience(e.target.value)}
                  placeholder="e.g. Enterprise leaders, Shopify store owners"
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white focus:border-violet-500/40 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleGenerateCopy()}
                disabled={generatingCopy}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-violet-500/20 hover:opacity-90 disabled:opacity-50"
              >
                {generatingCopy ? <LoaderCircle size={14} className="animate-spin" /> : <Bot size={14} />}
                <span>{generatingCopy ? "Synthesizing Copy…" : "Generate AI Copy"}</span>
              </button>
            </div>

            {/* Right Column: Output */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#0c0d10] p-5 lg:col-span-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-zinc-300">Generated Sales Pitch</span>
                  {generatedCopy && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedCopy, "Copy saved to clipboard!")}
                      className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300"
                    >
                      <Copy size={12} />
                      <span>Copy All</span>
                    </button>
                  )}
                </div>

                {copiedNotification && (
                  <p className="mb-2 text-xs text-emerald-400">{copiedNotification}</p>
                )}

                {generatingCopy ? (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                    <LoaderCircle size={20} className="animate-spin text-violet-400 mb-2" />
                    <span className="text-xs">J10 AI is crafting high-converting copy…</span>
                  </div>
                ) : generatedCopy ? (
                  <div className="rounded-xl border border-white/[0.06] bg-black/40 p-4 text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap font-sans">
                    {generatedCopy}
                  </div>
                ) : (
                  <div className="py-16 text-center text-xs text-zinc-500">
                    Select a product and click &quot;Generate AI Copy&quot; to synthesize marketing assets.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Product Modal */}
        {showAddProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111216] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
                <h3 className="text-sm font-bold text-white">Add Catalog Product</h3>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
                <div>
                  <label className="font-medium text-zinc-400">Product Name</label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="e.g. Autonomous Sales Assistant"
                    className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-white focus:border-emerald-500/40 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-zinc-400">SKU</label>
                    <input
                      type="text"
                      required
                      value={newProdSku}
                      onChange={(e) => setNewProdSku(e.target.value)}
                      placeholder="e.g. J10-AI-01"
                      className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-white focus:border-emerald-500/40 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-zinc-400">Category</label>
                    <input
                      type="text"
                      value={newProdCategory}
                      onChange={(e) => setNewProdCategory(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-white focus:border-emerald-500/40 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-zinc-400">Price (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      placeholder="99.00"
                      className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-white focus:border-emerald-500/40 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-zinc-400">Initial Stock Units</label>
                    <input
                      type="number"
                      value={newProdInventory}
                      onChange={(e) => setNewProdInventory(e.target.value)}
                      placeholder="100"
                      className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-white focus:border-emerald-500/40 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-medium text-zinc-400">Description</label>
                  <textarea
                    rows={2}
                    value={newProdDesc}
                    onChange={(e) => setNewProdDesc(e.target.value)}
                    placeholder="Key product highlights and customer value..."
                    className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-white focus:border-emerald-500/40 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddProduct(false)}
                    className="rounded-xl border border-white/[0.08] px-3.5 py-2 text-zinc-400 hover:bg-white/[0.04]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="rounded-xl bg-emerald-400 px-4 py-2 font-bold text-black hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {savingProduct ? "Saving…" : "Save Product"}
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
