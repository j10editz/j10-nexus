"use client";

import { useState } from "react";
import {
  Brain,
  Check,
  CheckCircle2,
  Copy,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

interface AICopyModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (generated: {
    heroHeadline: string;
    heroSubheadline: string;
    primaryCtaText: string;
    features: { title: string; description: string; icon: string }[];
    testimonials: { name: string; company: string; quote: string; rating: number }[];
    faqs: { question: string; answer: string }[];
  }) => void;
}

const PRESET_OPTIONS = [
  { id: "agency", label: "B2B Agency & Services", icon: Zap },
  { id: "saas", label: "SaaS & Software", icon: Brain },
  { id: "realestate", label: "Luxury Real Estate", icon: ShieldCheck },
  { id: "ecommerce", label: "E-Commerce & Brands", icon: Layers },
];

export default function AICopyModal({ open, onClose, onApply }: AICopyModalProps) {
  const [industry, setIndustry] = useState("agency");
  const [businessName, setBusinessName] = useState("J10 NEXUS");
  const [targetAudience, setTargetAudience] = useState("Founders and business executives");
  const [goal, setGoal] = useState("Drive qualified inbound WhatsApp consultations");
  const [loading, setLoading] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/website/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          industry,
          targetAudience,
          goal,
        }),
      });

      const data = await res.json();
      if (data.success && data.funnel) {
        setGeneratedResult(data.funnel);
      } else {
        setError(data.error || "Failed to generate copy. Please retry.");
      }
    } catch (err) {
      console.error("AI copy generation error:", err);
      setError("Network error contacting AI copywriter.");
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!generatedResult) return;
    onApply(generatedResult);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0E0F14] p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-violet-300 uppercase">
                <Sparkles size={11} className="text-violet-400" />
                AI Direct-Response Copywriter
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">GPT-4o Engine</span>
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-white">
              Generate High-Converting Copy
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Generate structured, professional landing page copy tailored to your exact industry. Zero emojis, pure conversion focus.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="mt-5 space-y-4">
          {/* Industry Preset Selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Industry Category
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESET_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = industry === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setIndustry(opt.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition ${
                      isSelected
                        ? "border-violet-500/50 bg-violet-500/15 text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    }`}
                  >
                    <Icon size={16} className={isSelected ? "text-violet-400" : "text-zinc-500"} />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                Business / Product Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Nexus Capital Group"
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400">
                Target Audience
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. Real estate investors, B2B CTOs"
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">
              Primary Conversion Goal
            </label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Direct WhatsApp consultation booking"
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#12141A] px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-xs font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Synthesizing Conversion Copy...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Generate Copy with AI
              </>
            )}
          </button>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Generated Result Preview */}
          {generatedResult && (
            <div className="mt-4 space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                  Generated Copy Preview
                </span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                  <CheckCircle2 size={13} />
                  Ready to Apply
                </span>
              </div>

              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Headline
                </p>
                <p className="mt-0.5 text-sm font-bold text-white">
                  {generatedResult.heroHeadline}
                </p>
              </div>

              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Subheadline
                </p>
                <p className="mt-0.5 text-xs text-zinc-300 leading-relaxed">
                  {generatedResult.heroSubheadline}
                </p>
              </div>

              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                  CTA Button
                </p>
                <p className="mt-0.5 text-xs text-emerald-400 font-semibold">
                  {generatedResult.primaryCtaText}
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500 active:scale-[0.99]"
                >
                  <Check size={14} />
                  Apply Copy to Funnel Customizer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
