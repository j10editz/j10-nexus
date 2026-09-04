"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Edit3,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import type {
  GroundingSimulationResult,
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeSummary,
} from "@/types/knowledge";
import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge/service";

const CATEGORY_KEYS: Array<{ key: KnowledgeCategory | "all"; label: string }> = [
  { key: "all", label: "All Documents" },
  { key: "product_service", label: "Products & Services" },
  { key: "pricing_terms", label: "Pricing & Commercial" },
  { key: "faq_support", label: "Support FAQs" },
  { key: "policies_compliance", label: "Policies & Rules" },
  { key: "internal_sop", label: "Standard Operating Procedures" },
];

const SAMPLE_TEMPLATES: Array<{
  title: string;
  category: KnowledgeCategory;
  tags: string[];
  content: string;
}> = [
  {
    title: "Company Overview & Core Offerings",
    category: "product_service",
    tags: ["overview", "services", "ai-os"],
    content:
      "J10 NEXUS is the comprehensive AI Operating System for modern businesses. We provide multi-channel conversational automation (WhatsApp Cloud API), unified customer relationship management (CRM), event-driven automation pipelines (J10 Flow), and autonomous AI sales employees. Our platform runs on high-performance infrastructure with sub-second AI inference powered by Google AI Studio Gemini 2.5 Flash and Pro.",
  },
  {
    title: "Commercial Pricing & Subscription Tiers",
    category: "pricing_terms",
    tags: ["pricing", "plans", "billing"],
    content:
      "J10 NEXUS offers three subscription plans:\n1. Starter ($29/mo): Includes 1 WhatsApp connection, 1,000 automated messages/mo, basic CRM, and standard AI replies.\n2. Growth ($99/mo): Up to 3 WhatsApp numbers, 10,000 automated messages/mo, full Flow builder, custom webhooks, and priority Gemini routing.\n3. Enterprise ($299/mo): Unlimited messaging, dedicated support, custom AI fine-tuning, SLA, and enterprise compliance guarantees.",
  },
  {
    title: "Refund Policy & Cancellation Terms",
    category: "policies_compliance",
    tags: ["refunds", "cancellations", "terms"],
    content:
      "All J10 NEXUS subscriptions come with a 14-day money-back guarantee for first-time customers. Subscriptions can be paused or cancelled anytime directly from the billing settings. Once cancelled, your workspace retains active access until the end of the current billing period with zero cancellation fees.",
  },
  {
    title: "Customer Support Hours & Escalation Protocols",
    category: "faq_support",
    tags: ["support", "hours", "escalation"],
    content:
      "Customer support is active Monday through Friday from 8:00 AM to 8:00 PM EST. Inquiries submitted outside these hours are handled by the 24/7 J10 WhatsApp AI Assistant. If an issue involves billing errors, security concerns, or account lockouts, the AI agent is instructed to immediately flag the conversation for tier-2 human operator review.",
  },
];

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [summary, setSummary] = useState<KnowledgeSummary>({
    totalDocuments: 0,
    activeGroundingDocuments: 0,
    totalTokens: 0,
    categoryBreakdown: {
      product_service: 0,
      pricing_terms: 0,
      faq_support: 0,
      policies_compliance: 0,
      internal_sop: 0,
    },
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"library" | "simulator">("library");
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [modalCategory, setModalCategory] = useState<KnowledgeCategory>("product_service");
  const [modalContent, setModalContent] = useState("");
  const [modalTags, setModalTags] = useState("");
  const [modalGrounding, setModalGrounding] = useState(true);
  const [saving, setSaving] = useState(false);

  // Simulator state
  const [simQuestion, setSimQuestion] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<GroundingSimulationResult | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/knowledge", {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not load knowledge documents.");
      }
      setDocuments(data.documents ?? []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load knowledge.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((doc) => {
      const matchesCategory =
        selectedCategory === "all" || doc.category === selectedCategory;
      const matchesSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        doc.content.toLowerCase().includes(q) ||
        doc.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [documents, search, selectedCategory]);

  function openCreateModal(template?: (typeof SAMPLE_TEMPLATES)[number]) {
    setEditingDoc(null);
    setModalTitle(template?.title ?? "");
    setModalCategory(template?.category ?? "product_service");
    setModalContent(template?.content ?? "");
    setModalTags(template?.tags?.join(", ") ?? "");
    setModalGrounding(true);
    setModalOpen(true);
  }

  function openEditModal(doc: KnowledgeDocument) {
    setEditingDoc(doc);
    setModalTitle(doc.title);
    setModalCategory(doc.category);
    setModalContent(doc.content);
    setModalTags(doc.tags.join(", "));
    setModalGrounding(doc.is_grounding_active);
    setModalOpen(true);
  }

  async function handleSaveDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!modalTitle.trim() || !modalContent.trim()) {
      setErrorMessage("Title and content are required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const tagsArray = modalTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingDoc) {
        // Update
        const response = await fetch(`/api/knowledge/${editingDoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: modalTitle.trim(),
            category: modalCategory,
            content: modalContent.trim(),
            tags: tagsArray,
            is_grounding_active: modalGrounding,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not update document.");
        }
        setSuccessMessage("Knowledge document updated.");
      } else {
        // Create
        const response = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: modalTitle.trim(),
            category: modalCategory,
            content: modalContent.trim(),
            tags: tagsArray,
            is_grounding_active: modalGrounding,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Could not create document.");
        }
        setSuccessMessage("Knowledge document added to Company Brain.");
      }

      setModalOpen(false);
      await loadDocuments();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this knowledge document?")) {
      return;
    }

    try {
      const response = await fetch(`/api/knowledge/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not delete document.");
      }
      setSuccessMessage("Knowledge document removed.");
      await loadDocuments();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function handleToggleGrounding(doc: KnowledgeDocument) {
    try {
      const response = await fetch(`/api/knowledge/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_grounding_active: !doc.is_grounding_active,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not update grounding status.");
      }
      await loadDocuments();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function handleRunSimulation(customQuery?: string) {
    const question = (customQuery ?? simQuestion).trim();
    if (!question) return;

    setSimulating(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/knowledge/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Grounding simulation failed.");
      }
      setSimResult(data.result as GroundingSimulationResult);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Simulation error.");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-8">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                COMPANY BRAIN & GROUNDING
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Knowledge Hub
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              The centralized source of truth for your business. Ground WhatsApp customer replies,
              sales agents, and automation workflows strictly in your verified facts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadDocuments()}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#111216] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-40"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Sync
            </button>

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <Plus size={16} />
              Add Document
            </button>
          </div>
        </div>

        {/* ERROR & SUCCESS MESSAGES */}
        {errorMessage && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertTriangle size={16} />
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            {successMessage}
          </div>
        )}

        {/* METRICS OVERVIEW */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
              <BookOpen size={18} className="text-violet-400" />
            </div>
            <p className="mt-5 text-sm text-zinc-400">Total Knowledge Assets</p>
            <p className="mt-1 text-2xl font-semibold">{summary.totalDocuments}</p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Brain size={18} className="text-emerald-400" />
            </div>
            <p className="mt-5 text-sm text-zinc-400">Active Grounded Tokens</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-400">
              {summary.totalTokens.toLocaleString()} tokens
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Zap size={18} className="text-blue-400" />
            </div>
            <p className="mt-5 text-sm text-zinc-400">Connected Consumers</p>
            <p className="mt-1 text-2xl font-semibold">WhatsApp · CRM · Flow</p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <ShieldCheck size={18} className="text-amber-400" />
            </div>
            <p className="mt-5 text-sm text-zinc-400">Grounding Policy</p>
            <p className="mt-1 text-2xl font-semibold text-amber-300">Strict Fact Check</p>
          </div>
        </div>

        {/* WORKSTATION TABS */}
        <div className="mt-8 flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("library")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "library"
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <BookOpen size={16} />
              Document Library ({documents.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("simulator")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "simulator"
                  ? "bg-violet-500/20 text-violet-300 shadow-sm border border-violet-500/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Sparkles size={16} className="text-violet-400" />
              AI Grounding Simulator
            </button>
          </div>
        </div>

        {/* TAB 1: DOCUMENT LIBRARY */}
        {activeTab === "library" && (
          <div className="mt-6 space-y-6">
            {/* SEARCH & CATEGORY FILTERS */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-md">
                <Search
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search knowledge documents by keyword or tag..."
                  className="w-full rounded-xl border border-white/[0.08] bg-[#111216] py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_KEYS.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                      selectedCategory === cat.key
                        ? "bg-white text-black font-semibold"
                        : "border border-white/[0.06] bg-[#111216] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* DOCUMENTS GRID */}
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-56 animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]"
                  />
                ))}
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#111216]/50 p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                  <BookOpen size={24} />
                </div>
                <h3 className="mt-4 text-lg font-semibold">No knowledge documents yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                  Ground your WhatsApp assistant and sales agents with verified company facts.
                  Start from scratch or import one of our enterprise starter templates.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SAMPLE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.title}
                      type="button"
                      onClick={() => openCreateModal(tpl)}
                      className="rounded-xl border border-white/[0.08] bg-[#111216] px-3.5 py-2 text-xs text-zinc-300 transition hover:border-violet-500/30 hover:text-white"
                    >
                      + {tpl.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-[#111216] p-5 transition hover:border-white/[0.12]"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                          {KNOWLEDGE_CATEGORIES[doc.category] || doc.category}
                        </span>

                        <button
                          type="button"
                          onClick={() => void handleToggleGrounding(doc)}
                          className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                            doc.is_grounding_active
                              ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                              : "border border-zinc-700 bg-zinc-800 text-zinc-400"
                          }`}
                          title="Click to toggle active grounding"
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              doc.is_grounding_active ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                            }`}
                          />
                          {doc.is_grounding_active ? "Grounded" : "Paused"}
                        </button>
                      </div>

                      <h3 className="mt-3 text-base font-semibold text-white">{doc.title}</h3>

                      <p className="mt-2 line-clamp-4 text-xs leading-5 text-zinc-400">
                        {doc.content}
                      </p>
                    </div>

                    <div className="mt-5 border-t border-white/[0.06] pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <Brain size={12} className="text-zinc-400" />
                          <span>~{doc.token_count || Math.ceil(doc.content.length / 4)} tokens</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(doc)}
                            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
                            title="Edit Document"
                          >
                            <Edit3 size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDelete(doc.id)}
                            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400"
                            title="Delete Document"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {doc.tags && doc.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {doc.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-zinc-500"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AI GROUNDING SIMULATOR */}
        {activeTab === "simulator" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-6">
              <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-violet-400" />
                  <h2 className="text-base font-semibold">Live Grounding Simulator</h2>
                </div>
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                  Send a simulated customer inquiry to test how Google Gemini grounds its reply
                  using your published Company Brain documents.
                </p>

                <div className="mt-4">
                  <textarea
                    value={simQuestion}
                    onChange={(e) => setSimQuestion(e.target.value)}
                    placeholder="Type an inquiry e.g. 'What is your refund policy?' or 'What are the pricing tiers?'"
                    rows={4}
                    className="w-full rounded-xl border border-white/[0.08] bg-[#090a0d] p-3.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-[11px] text-zinc-500">Quick tests:</span>
                  {[
                    "What services do you provide?",
                    "What is your refund policy?",
                    "How much does Starter cost?",
                    "What are your support hours?",
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setSimQuestion(q);
                        void handleRunSimulation(q);
                      }}
                      className="rounded-md border border-white/[0.06] bg-black/30 px-2 py-1 text-[11px] text-zinc-400 transition hover:border-violet-500/30 hover:text-white"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleRunSimulation()}
                    disabled={simulating || !simQuestion.trim()}
                    className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
                  >
                    {simulating ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        Grounding with Gemini...
                      </>
                    ) : (
                      <>
                        <Zap size={15} />
                        Run Simulation
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              {simResult ? (
                <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-blue-500/[0.03] p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                        Grounded Answer Generated
                      </span>
                    </div>

                    <span className="rounded-md border border-white/[0.08] bg-black/40 px-2 py-0.5 text-[10px] text-zinc-400">
                      {simResult.model} · {simResult.latencyMs}ms
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Synthesized Reply
                    </span>
                    <div className="mt-2 rounded-xl border border-white/[0.06] bg-[#090a0d] p-4 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
                      {simResult.answer}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Citations & Grounding Sources
                    </span>
                    {simResult.matchedSources.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500 italic">
                        No specific documents directly matched. General grounding was applied.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {simResult.matchedSources.map((source) => (
                          <div
                            key={source.id}
                            className="rounded-xl border border-white/[0.06] bg-black/30 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-violet-300">{source.title}</span>
                              <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                {KNOWLEDGE_CATEGORIES[source.category]}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-zinc-400 leading-normal">
                              {source.snippet}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-[#111216]/30 p-12 text-center text-zinc-500">
                  <Brain size={32} className="text-zinc-600" />
                  <p className="mt-3 text-sm">Simulation telemetry will appear here.</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Ask a question to see exact document matching and citations.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CREATE / EDIT MODAL */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-[#111216] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-violet-400" />
                  <h3 className="text-lg font-semibold">
                    {editingDoc ? "Edit Knowledge Document" : "Add Knowledge Document"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveDocument} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    Document Title *
                  </label>
                  <input
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    placeholder="e.g. Return Policy & SLA Guarantees"
                    required
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Category *
                    </label>
                    <select
                      value={modalCategory}
                      onChange={(e) => setModalCategory(e.target.value as KnowledgeCategory)}
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3.5 py-2.5 text-sm text-white outline-none focus:border-violet-500/40"
                    >
                      {CATEGORY_KEYS.filter((c) => c.key !== "all").map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400">
                      Tags (comma-separated)
                    </label>
                    <input
                      value={modalTags}
                      onChange={(e) => setModalTags(e.target.value)}
                      placeholder="e.g. pricing, enterprise, refund"
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-zinc-400">
                      Document Content *
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      ~{Math.ceil(modalContent.length / 4)} tokens · {modalContent.length} chars
                    </span>
                  </div>
                  <textarea
                    value={modalContent}
                    onChange={(e) => setModalContent(e.target.value)}
                    placeholder="Paste your verified product specifications, policies, FAQs, or operating guidelines here..."
                    rows={8}
                    required
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] p-3.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="groundingActive"
                    checked={modalGrounding}
                    onChange={(e) => setModalGrounding(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-violet-600 focus:ring-violet-500"
                  />
                  <label htmlFor="groundingActive" className="text-xs text-zinc-300">
                    Enable active grounding (AI will immediately use this in WhatsApp & CRM replies)
                  </label>
                </div>

                <div className="flex justify-end gap-3 border-t border-white/[0.06] pt-4">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
                  >
                    {saving && <RefreshCw size={14} className="animate-spin" />}
                    {editingDoc ? "Save Changes" : "Publish Document"}
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