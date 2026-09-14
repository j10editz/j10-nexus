"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  HelpCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Send,
  Shield,
  Sparkles,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";

interface ServiceItem {
  name: string;
  price: string;
  duration?: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface BotConfigForm {
  business_name: string;
  description: string;
  services: ServiceItem[];
  pricing_details: string;
  business_hours: string;
  faqs: FaqItem[];
  booking_link: string;
  tone: string;
  supported_languages: string[];
  escalation_instructions: string;
  welcome_message: string;
  ai_enabled: boolean;
  privacy_policy_url: string;
}

interface ChatMessage {
  id: string;
  sender: "customer" | "bot";
  text: string;
  timestamp: string;
  isDeterministic?: boolean;
}

const AVAILABLE_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Arabic",
];

const TONE_OPTIONS = [
  { value: "professional", label: "Professional & Polished" },
  { value: "friendly", label: "Warm & Friendly" },
  { value: "luxury", label: "High-End & Executive" },
  { value: "casual", label: "Casual & Approachable" },
  { value: "direct", label: "Direct & Action-Oriented" },
];

export default function BotSetupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [brandName, setBrandName] = useState("");
  const [isJ10Official, setIsJ10Official] = useState(false);

  // Form State
  const [form, setForm] = useState<BotConfigForm>({
    business_name: "",
    description: "",
    services: [],
    pricing_details: "",
    business_hours: "Mon-Fri 9:00 AM - 6:00 PM EST",
    faqs: [],
    booking_link: "",
    tone: "professional",
    supported_languages: ["English"],
    escalation_instructions: "Forward to live specialist team",
    welcome_message: "",
    ai_enabled: true,
    privacy_policy_url: "",
  });

  // Simulator State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/bot/config");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          const cfg = data.config;
          setBrandName(data.brandName || "");
          setIsJ10Official(!!data.isJ10Official);
          setForm({
            business_name: cfg.business_name || data.brandName || "",
            description: cfg.description || "",
            services: Array.isArray(cfg.services) ? cfg.services : [],
            pricing_details: cfg.pricing_details || "",
            business_hours: cfg.business_hours || "Mon-Fri 9:00 AM - 6:00 PM EST",
            faqs: Array.isArray(cfg.faqs) ? cfg.faqs : [],
            booking_link: cfg.booking_link || "",
            tone: cfg.tone || "professional",
            supported_languages: cfg.supported_languages || ["English"],
            escalation_instructions: cfg.escalation_instructions || "Forward to live specialist team",
            welcome_message: cfg.welcome_message || "",
            ai_enabled: cfg.ai_enabled !== false,
            privacy_policy_url: cfg.privacy_policy_url || "",
          });

          // Seed test chat with initial greeting
          const initialWelcome =
            cfg.welcome_message ||
            `Hello! Welcome to ${cfg.business_name || data.brandName || "our business"}. How can I assist you today? Type /help to see options.`;
          setMessages([
            {
              id: "msg_init",
              sender: "bot",
              text: initialWelcome,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              isDeterministic: true,
            },
          ]);
        }
      }
    } catch (err) {
      console.error("Failed to load bot config:", err);
      setErrorMessage("Could not connect to server to load bot settings.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage("");
    try {
      const res = await fetch("/api/bot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save configuration.");
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  function handleAddService() {
    setForm((prev) => ({
      ...prev,
      services: [
        ...prev.services,
        { name: "New Service", price: "$100", duration: "1 hour", description: "Service details" },
      ],
    }));
  }

  function handleUpdateService(index: number, field: keyof ServiceItem, value: string) {
    setForm((prev) => {
      const updated = [...prev.services];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, services: updated };
    });
  }

  function handleRemoveService(index: number) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index),
    }));
  }

  function handleAddFaq() {
    setForm((prev) => ({
      ...prev,
      faqs: [
        ...prev.faqs,
        { question: "What is your refund policy?", answer: "We offer full satisfaction guarantees within 30 days." },
      ],
    }));
  }

  function handleUpdateFaq(index: number, field: keyof FaqItem, value: string) {
    setForm((prev) => {
      const updated = [...prev.faqs];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, faqs: updated };
    });
  }

  function handleRemoveFaq(index: number) {
    setForm((prev) => ({
      ...prev,
      faqs: prev.faqs.filter((_, i) => i !== index),
    }));
  }

  function toggleLanguage(lang: string) {
    setForm((prev) => {
      const current = prev.supported_languages;
      if (current.includes(lang)) {
        if (current.length === 1) return prev; // Keep at least one
        return { ...prev, supported_languages: current.filter((l) => l !== lang) };
      } else {
        return { ...prev, supported_languages: [...current, lang] };
      }
    });
  }

  async function handleSendMessage(promptText?: string) {
    const textToSend = (promptText || inputPrompt).trim();
    if (!textToSend || simulating) return;

    const userMsg: ChatMessage = {
      id: "user_" + Date.now(),
      sender: "customer",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt("");
    setSimulating(true);

    try {
      // Build history for context
      const history = messages.slice(-8).map((m) => ({
        role: m.sender === "customer" ? "user" : "model",
        parts: [{ text: m.text }],
      }));

      const res = await fetch("/api/bot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageText: textToSend,
          history,
          draftConfig: form, // Test against active draft!
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: "bot_" + Date.now(),
            sender: "bot",
            text: data.replyText,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            isDeterministic: data.isDeterministic,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: "bot_err_" + Date.now(),
            sender: "bot",
            text: `[Error: ${data.error || "Simulation failed"}]`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: "bot_err_" + Date.now(),
          sender: "bot",
          text: "[Network error testing bot]",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setSimulating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[600px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-white/50">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
          <span>Loading client bot configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Top Banner & Action Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Sparkles size={18} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              AI Receptionist Setup
            </h1>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
              {form.business_name || brandName || "Client Bot"}
            </span>
          </div>
          <p className="mt-1 text-sm text-white/60">
            Ground your bot in your client business data. The AI will strictly represent your services, pricing, hours, and identity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Master AI Toggle */}
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2">
            <span className="text-xs font-medium text-white/70">AI Auto-Reply:</span>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, ai_enabled: !p.ai_enabled }))}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                form.ai_enabled ? "bg-emerald-500" : "bg-white/20"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  form.ai_enabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <span className={`text-xs font-semibold ${form.ai_enabled ? "text-emerald-400" : "text-white/40"}`}>
              {form.ai_enabled ? "ON" : "OFF"}
            </span>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>{saving ? "Saving..." : "Save Bot Setup"}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
          <CheckCircle2 size={18} />
          <span>Bot configuration saved successfully! Production bots will immediately use these grounded instructions.</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-400">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Form Left (7 cols), Simulator Right (5 cols) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Configuration Forms */}
        <div className="space-y-6 lg:col-span-7">
          {/* Card 1: Business Identity & Overview */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-md">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Bot size={18} className="text-blue-400" />
              Business Identity
            </h2>
            <p className="mt-1 text-xs text-white/50">
              The AI receptionist strictly acts as a representative of this business.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/70">Business / Brand Name</label>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  placeholder="e.g. Apex Growth Studio"
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70">Company Overview & Value Proposition</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Briefly describe what your business does, your mission, and your ideal clients..."
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-white/70">Tone of Voice</label>
                  <select
                    value={form.tone}
                    onChange={(e) => setForm({ ...form, tone: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    {TONE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70">Business Hours</label>
                  <input
                    type="text"
                    value={form.business_hours}
                    onChange={(e) => setForm({ ...form, business_hours: e.target.value })}
                    placeholder="e.g. Mon-Fri 9AM - 6PM EST"
                    className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">Supported Languages</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_LANGUAGES.map((lang) => {
                    const active = form.supported_languages.includes(lang);
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => toggleLanguage(lang)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                            : "border-white/[0.08] bg-white/[0.02] text-white/40 hover:text-white/70"
                        }`}
                      >
                        {lang}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Services & Pricing Table */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Zap size={18} className="text-amber-400" />
                  Services & Pricing
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  Used by the AI for deterministic /services commands and natural conversation questions.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddService}
                className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20"
              >
                <Plus size={14} />
                Add Service
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {form.services.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-xs text-white/40">
                  No services listed yet. Click &ldquo;Add Service&rdquo; to define your business offerings and pricing.
                </div>
              ) : (
                form.services.map((svc, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-white/[0.06] bg-black/30 p-3.5 transition hover:border-white/[0.12]"
                  >
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <label className="text-[10px] font-medium text-white/50">Service Name</label>
                        <input
                          type="text"
                          value={svc.name}
                          onChange={(e) => handleUpdateService(idx, "name", e.target.value)}
                          placeholder="e.g. Website Audit"
                          className="mt-0.5 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-[10px] font-medium text-white/50">Price</label>
                        <input
                          type="text"
                          value={svc.price}
                          onChange={(e) => handleUpdateService(idx, "price", e.target.value)}
                          placeholder="e.g. $499"
                          className="mt-0.5 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-[10px] font-medium text-white/50">Duration</label>
                        <input
                          type="text"
                          value={svc.duration || ""}
                          onChange={(e) => handleUpdateService(idx, "duration", e.target.value)}
                          placeholder="e.g. 2-3 days"
                          className="mt-0.5 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-end justify-end sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => handleRemoveService(idx)}
                          className="rounded-lg p-1.5 text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-[10px] font-medium text-white/50">Description</label>
                      <input
                        type="text"
                        value={svc.description}
                        onChange={(e) => handleUpdateService(idx, "description", e.target.value)}
                        placeholder="Comprehensive analysis of speed, SEO and conversion..."
                        className="mt-0.5 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))
              )}

              <div>
                <label className="block text-xs font-medium text-white/70">Additional Pricing Details & Policies</label>
                <textarea
                  rows={2}
                  value={form.pricing_details}
                  onChange={(e) => setForm({ ...form, pricing_details: e.target.value })}
                  placeholder="e.g. 50% deposit required upfront. Retainers billed on the 1st of every month."
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Booking & Workflow Integration */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-md">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Calendar size={18} className="text-emerald-400" />
              Booking & Escalation
            </h2>
            <p className="mt-1 text-xs text-white/50">
              Configure real appointment scheduling and human handoff directives.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/70">Booking Link / Calendar URL (/book)</label>
                <input
                  type="url"
                  value={form.booking_link}
                  onChange={(e) => setForm({ ...form, booking_link: e.target.value })}
                  placeholder="https://calendly.com/your-business/discovery"
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70">Human Escalation Instructions (/human, /agent)</label>
                <input
                  type="text"
                  value={form.escalation_instructions}
                  onChange={(e) => setForm({ ...form, escalation_instructions: e.target.value })}
                  placeholder="Forward to live specialist team; phone: +1-555-0199"
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70">Privacy Policy URL (/privacy)</label>
                <input
                  type="url"
                  value={form.privacy_policy_url}
                  onChange={(e) => setForm({ ...form, privacy_policy_url: e.target.value })}
                  placeholder="https://yourbusiness.com/privacy"
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70">Custom Welcome Message Override (/start)</label>
                <textarea
                  rows={2}
                  value={form.welcome_message}
                  onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
                  placeholder="Leave empty to use automatic personalized welcome message."
                  className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card 4: FAQs & Policies */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <HelpCircle size={18} className="text-purple-400" />
                  Frequently Asked Questions (FAQs)
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  Custom question-and-answer pairs used to ground AI responses and prevent hallucinations.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddFaq}
                className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/20"
              >
                <Plus size={14} />
                Add FAQ
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {form.faqs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-xs text-white/40">
                  No FAQs added. Add questions your customers commonly ask to give the AI accurate answers.
                </div>
              ) : (
                form.faqs.map((faq, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-white/[0.06] bg-black/30 p-3.5 transition hover:border-white/[0.12]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={faq.question}
                          onChange={(e) => handleUpdateFaq(idx, "question", e.target.value)}
                          placeholder="Question..."
                          className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-xs font-semibold text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
                        />
                        <textarea
                          rows={2}
                          value={faq.answer}
                          onChange={(e) => handleUpdateFaq(idx, "answer", e.target.value)}
                          placeholder="Answer..."
                          className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFaq(idx)}
                        className="rounded-lg p-1.5 text-rose-400/70 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: "Test My Bot" Live Simulator (5 cols) */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 flex flex-col rounded-2xl border border-white/[0.08] bg-[#0c1017] shadow-2xl backdrop-blur-xl">
            {/* Simulator Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    <Bot size={18} />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-black" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white">Test My Bot</span>
                    <span className="rounded bg-blue-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-blue-300">
                      LIVE DRAFT
                    </span>
                  </div>
                  <p className="text-[11px] text-white/40">Simulating Telegram Inbound Update</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMessages([
                    {
                      id: "reset_" + Date.now(),
                      sender: "bot",
                      text: `Hello! Welcome to ${form.business_name || "our business"}. How can I assist you today? Type /help to see options.`,
                      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      isDeterministic: true,
                    },
                  ]);
                }}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-1.5 text-white/50 hover:bg-white/[0.05] hover:text-white"
                title="Reset test conversation"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {/* Quick Prompt Chips */}
            <div className="border-b border-white/[0.04] bg-black/20 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">
                Quick Test Prompts
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "/start",
                  "/services",
                  "/book",
                  "/privacy",
                  "/human",
                  "What are your prices?",
                  "¿Qué servicios ofrecen?",
                  "Can you help me?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    disabled={simulating}
                    className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-white/70 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300 transition disabled:opacity-40"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Bubble Feed */}
            <div className="flex h-[420px] flex-col gap-3 overflow-y-auto p-4">
              {messages.map((m) => {
                const isUser = m.sender === "customer";
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] text-white/40">
                        {isUser ? "Customer" : form.business_name || "Bot"}
                      </span>
                      {m.isDeterministic && (
                        <span className="rounded bg-purple-500/20 px-1 py-0.2 text-[8px] font-semibold text-purple-300">
                          ROUTER
                        </span>
                      )}
                      {!isUser && !m.isDeterministic && (
                        <span className="rounded bg-blue-500/20 px-1 py-0.2 text-[8px] font-semibold text-blue-300">
                          AI
                        </span>
                      )}
                      <span className="text-[9px] text-white/30">{m.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        isUser
                          ? "bg-blue-600 text-white rounded-br-xs"
                          : "bg-white/[0.06] text-white/90 border border-white/[0.06] rounded-bl-xs"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </div>
                );
              })}

              {simulating && (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  <span>Thinking with Gemini...</span>
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            <div className="border-t border-white/[0.08] p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder="Type a message or command (e.g. /services)..."
                  disabled={simulating}
                  className="flex-1 rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2 text-xs text-white placeholder-white/30 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputPrompt.trim() || simulating}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow transition hover:bg-blue-500 disabled:opacity-40"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
