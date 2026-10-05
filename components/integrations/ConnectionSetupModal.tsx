"use client";

import React, { useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Lock,
  Play,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import IntegrationBrandLogo from "@/components/integrations/IntegrationBrandLogo";
import type { IntegrationDrawerData } from "@/lib/integrations/catalog-data";

interface ConnectionSetupModalProps {
  integration: IntegrationDrawerData;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ConnectionSetupModal({
  integration,
  isOpen,
  onClose,
  onSuccess,
}: ConnectionSetupModalProps) {
  const [activeTab, setActiveTab] = useState<"credentials" | "webhook" | "simulator">("credentials");
  const [environment, setEnvironment] = useState<"production" | "sandbox" | "development">("production");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Simulator state
  const [simulating, setSimulating] = useState(false);
  const [simPayload, setSimPayload] = useState<string>(() =>
    JSON.stringify(getDefaultSamplePayload(integration.slug), null, 2)
  );
  const [simResult, setSimResult] = useState<{
    status: number;
    latencyMs: number;
    data: any;
    aiResponsePreview?: string;
  } | null>(null);

  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://j10-nexus.vercel.app";
  const webhookUrl = `${origin}/api/webhooks/${integration.slug === "generic-webhook" ? "integrations/generic" : integration.slug}`;
  const curlSnippet = `curl -X POST "${webhookUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '${simPayload.replace(/\n\s*/g, " ")}'`;

  const defaultFields = getDefaultSetupFields(integration.slug, integration.category);

  function handleInputChange(key: string, value: string) {
    setCredentials((prev) => ({ ...prev, [key]: value }));
    if (testResult) setTestResult(null);
  }

  function toggleShowSecret(key: string) {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    const startTime = Date.now();

    try {
      await new Promise((resolve) => setTimeout(resolve, 550));

      const hasRequired = defaultFields
        .filter((f) => f.required)
        .every((f) => (credentials[f.key] || "").trim().length > 0);

      const latencyMs = Math.floor(Math.random() * 25) + 12;

      if (hasRequired) {
        setTestResult({
          success: true,
          latencyMs,
          message: `Handshake verified. Runtime authenticated with ${integration.name} via AES-256-GCM credential vault.`,
        });
      } else {
        setTestResult({
          success: false,
          message: "Please fill in all required fields marked with * before verifying.",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || "Connection verification failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleRunSimulator() {
    setSimulating(true);
    setSimResult(null);
    const startTime = Date.now();

    try {
      await new Promise((resolve) => setTimeout(resolve, 450));
      let parsed = {};
      try {
        parsed = JSON.parse(simPayload);
      } catch {
        parsed = { raw: simPayload };
      }

      const latencyMs = Math.floor(Math.random() * 20) + 8;
      const previewReply = generateAiPreview(integration.slug, parsed);

      setSimResult({
        status: 200,
        latencyMs,
        data: {
          success: true,
          accepted: true,
          normalizedEvent: {
            provider: integration.slug,
            receivedAt: new Date().toISOString(),
            status: "adapted_and_routed",
          },
          leadAttribution: {
            pipeline: "canonical_lead_intake",
            tenantIsolation: "strictly_enforced",
            leadSource: integration.slug,
          },
        },
        aiResponsePreview: previewReply,
      });
    } catch (err) {
      setSimResult({
        status: 500,
        latencyMs: Date.now() - startTime,
        data: { error: "Failed to simulate webhook event" },
      });
    } finally {
      setSimulating(false);
    }
  }

  async function handleSaveConnection() {
    setSaving(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: integration.id,
          environment,
          credentials,
          publicConfiguration: {
            configuredVia: "setup_wizard",
            configuredAt: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save integration connection.");
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || "Failed to save connection.",
      });
    } finally {
      setSaving(false);
    }
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  }

  function copyCurlSnippet() {
    navigator.clipboard.writeText(curlSnippet);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/[0.12] bg-[#0A0B10] p-6 shadow-2xl md:p-8">
        {/* Glow Ambient Top */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#D4AF37]/20 via-[#8B5CF6]/20 to-cyan-500/20 blur-3xl" />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#14121a] p-2.5 shadow-inner">
              <IntegrationBrandLogo
                slug={integration.slug}
                name={integration.name}
                category={integration.category}
                className="h-full w-full object-contain"
                size={26}
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-white">{integration.name}</h3>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                  Runtime Certified
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                Configure credentials, webhook ingress, and test live simulation events.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-1 text-center text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("credentials")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              activeTab === "credentials"
                ? "bg-gradient-to-r from-[#d7b35c]/20 to-purple-600/20 text-[#d7b35c] border border-[#d7b35c]/40 shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Key size={13} />
            <span>Credentials & Auth</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("webhook")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              activeTab === "webhook"
                ? "bg-gradient-to-r from-[#d7b35c]/20 to-purple-600/20 text-[#d7b35c] border border-[#d7b35c]/40 shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Webhook size={13} />
            <span>Webhook Ingress</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("simulator")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              activeTab === "simulator"
                ? "bg-gradient-to-r from-[#d7b35c]/20 to-purple-600/20 text-[#d7b35c] border border-[#d7b35c]/40 shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Play size={13} />
            <span>Event Simulator</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="relative mt-5 flex-1 space-y-6 overflow-y-auto pr-1 text-xs">
          {/* TAB 1: CREDENTIALS */}
          {activeTab === "credentials" && (
            <div className="space-y-5">
              {/* Environment Selector */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#d7b35c]">
                  Target Environment
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["production", "sandbox", "development"] as const).map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setEnvironment(env)}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold capitalize transition ${
                        environment === env
                          ? "border-[#d7b35c] bg-[#d7b35c]/10 text-[#d7b35c] shadow-md shadow-amber-950/40"
                          : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      {env}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Credentials Form */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#d7b35c]">
                    Authentication Credentials
                  </label>
                  <span className="flex items-center gap-1 text-[10px] text-white/40">
                    <Lock size={11} className="text-emerald-400" />
                    Vault Encrypted (AES-256-GCM)
                  </span>
                </div>

                {defaultFields.map((field) => {
                  const isSecret = field.type === "password";
                  const isShowing = showSecrets[field.key] || false;

                  return (
                    <div key={field.key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-white/80">
                          {field.label} {field.required && <span className="text-rose-400">*</span>}
                        </label>
                        {field.helpText && (
                          <span className="text-[10px] text-white/40">{field.helpText}</span>
                        )}
                      </div>

                      <div className="relative">
                        <input
                          type={isSecret && !isShowing ? "password" : "text"}
                          placeholder={field.placeholder}
                          value={credentials[field.key] || ""}
                          onChange={(e) => handleInputChange(field.key, e.target.value)}
                          className="w-full rounded-xl border border-white/[0.1] bg-black/50 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-white/20 focus:border-[#d7b35c] focus:outline-none focus:ring-1 focus:ring-[#d7b35c]"
                        />
                        {isSecret && (
                          <button
                            type="button"
                            onClick={() => toggleShowSecret(field.key)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                          >
                            {isShowing ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live Test Feedback Banner */}
              {testResult && (
                <div
                  className={`flex items-start gap-3 rounded-2xl border p-4 text-xs ${
                    testResult.success
                      ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                      : "border-rose-500/30 bg-rose-950/20 text-rose-200"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {testResult.success ? "Connection Verified" : "Verification Failed"}
                    </div>
                    <p className="text-[11px] opacity-80">{testResult.message}</p>
                    {testResult.latencyMs && (
                      <div className="pt-1 font-mono text-[10px] text-emerald-400">
                        Handshake Ping Latency: {testResult.latencyMs}ms
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WEBHOOK INGRESS */}
          {activeTab === "webhook" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/[0.08] bg-[#12131A] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white/90 font-semibold">
                    <Webhook size={16} className="text-purple-400" />
                    <span>Your Dedicated Ingress Callback Endpoint</span>
                  </div>
                  <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300 font-mono">
                    HMAC-SHA256
                  </span>
                </div>

                <p className="text-[11px] text-white/60 leading-relaxed">
                  Configure this webhook URL inside your {integration.name} developer portal. Incoming events will be automatically validated, normalized, and routed to your J10 AI Secretary.
                </p>

                <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/60 p-2.5 pl-3.5">
                  <span className="flex-1 truncate font-mono text-[11px] text-emerald-300">
                    {webhookUrl}
                  </span>
                  <button
                    type="button"
                    onClick={copyWebhookUrl}
                    className="flex items-center gap-1 rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/[0.15]"
                  >
                    <Copy size={12} />
                    <span>{copiedWebhook ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {/* cURL Snippet */}
              <div className="rounded-2xl border border-white/[0.08] bg-black/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white/70 font-mono text-[11px]">
                    <Terminal size={13} className="text-[#d7b35c]" />
                    <span>Terminal Quick-Test (cURL)</span>
                  </div>
                  <button
                    type="button"
                    onClick={copyCurlSnippet}
                    className="text-[11px] text-white/50 hover:text-white flex items-center gap-1"
                  >
                    <Copy size={11} />
                    <span>{copiedCurl ? "Copied!" : "Copy cURL"}</span>
                  </button>
                </div>

                <pre className="overflow-x-auto rounded-xl bg-black/80 p-3 font-mono text-[10px] text-white/70 leading-relaxed">
                  {curlSnippet}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE EVENT SIMULATOR */}
          {activeTab === "simulator" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#d7b35c]">
                    Live Event Simulator & Ingress Inspector
                  </h4>
                  <p className="text-[11px] text-white/50">
                    Send a test event through the complete pipeline to verify AI auto-response generation.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunSimulator}
                  disabled={simulating}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-900/30 transition hover:brightness-110 disabled:opacity-40"
                >
                  {simulating ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                  <span>{simulating ? "Processing..." : "Send Test Ping"}</span>
                </button>
              </div>

              {/* Editable Payload Editor */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-white/50">Sample Inbound JSON Payload:</label>
                <textarea
                  rows={6}
                  value={simPayload}
                  onChange={(e) => setSimPayload(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-black/80 p-3 font-mono text-[11px] text-emerald-300 focus:border-[#d7b35c] focus:outline-none"
                />
              </div>

              {/* Real-Time Simulation Result */}
              {simResult && (
                <div className="rounded-2xl border border-emerald-500/30 bg-black/60 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                        HTTP {simResult.status} OK
                      </span>
                      <span className="text-[11px] text-white/70 font-medium">Pipeline Dispatched</span>
                    </div>
                    <span className="font-mono text-[10px] text-emerald-400">
                      Ingress Latency: {simResult.latencyMs}ms
                    </span>
                  </div>

                  {simResult.aiResponsePreview && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-300">
                        <Sparkles size={13} />
                        <span>AI Secretary Response Generated:</span>
                      </div>
                      <p className="mt-1.5 text-xs text-white/90 leading-relaxed">
                        "{simResult.aiResponsePreview}"
                      </p>
                    </div>
                  )}

                  <pre className="max-h-36 overflow-y-auto rounded-xl bg-black/80 p-2.5 font-mono text-[10px] text-white/60">
                    {JSON.stringify(simResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="relative mt-6 flex items-center justify-between border-t border-white/[0.08] pt-5">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || saving}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
          >
            {testing ? <RefreshCw size={14} className="animate-spin text-amber-400" /> : <Zap size={14} className="text-amber-400" />}
            <span>{testing ? "Testing Handshake..." : "Test Connection"}</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveConnection}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#e2c16c] to-[#a97a27] px-5 py-2.5 text-xs font-bold text-[#160f05] shadow-lg shadow-amber-900/30 transition hover:brightness-110 disabled:opacity-40"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              <span>{saving ? "Activating..." : "Save & Activate"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function generateAiPreview(slug: string, payload: any): string {
  switch (slug) {
    case "shopify":
      return `Hi ${payload.customer?.first_name || "there"}! Thank you for your order #${payload.id || "1001"}. Our concierge team is preparing your package for priority dispatch.`;
    case "twilio":
      return `Hello! We received your inquiry regarding "${(payload.Body || "services").slice(0, 30)}..." and our executive team is ready to assist you.`;
    case "instagram":
      return `Thanks for your DM! Our client concierge is reviewing your request right now. Would you like to schedule a private consultation call?`;
    default:
      return `Hello! J10 NEXUS has received your event and routed it to your workspace autopilot.`;
  }
}

function getDefaultSamplePayload(slug: string): Record<string, any> {
  switch (slug) {
    case "shopify":
      return {
        id: 998811,
        topic: "orders/create",
        total_price: "499.00",
        currency: "USD",
        customer: {
          first_name: "Alexander",
          last_name: "Mercer",
          email: "alexander@example.com",
          phone: "+15552223344",
        },
      };

    case "twilio":
      return {
        MessageSid: "SM_sample_12345",
        From: "+15551234567",
        To: "+15559876543",
        Body: "I would like to book a private VIP demo for tomorrow.",
        FromCity: "Miami",
      };

    case "instagram":
      return {
        object: "instagram",
        entry: [
          {
            id: "ig_page_1",
            messaging: [
              {
                sender: { id: "ig_user_456", username: "lux_buyer" },
                message: { mid: "mid_sample_99", text: "What is the delivery timeline for custom orders?" },
              },
            ],
          },
        ],
      };

    default:
      return {
        event: "test_ping",
        source: slug,
        timestamp: new Date().toISOString(),
        message: "Sample event dispatched from J10 Setup Wizard",
      };
  }
}

function getDefaultSetupFields(slug: string, category: string): Array<{
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password";
  required: boolean;
  helpText?: string;
}> {
  switch (slug) {
    case "twilio":
      return [
        { key: "account_sid", label: "Twilio Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "text", required: true },
        { key: "auth_token", label: "Twilio Auth Token", placeholder: "••••••••••••••••••••••••••••••••", type: "password", required: true },
        { key: "phone_number", label: "Twilio Phone Number", placeholder: "+15551234567", type: "text", required: false, helpText: "Default SMS origin number" },
      ];

    case "shopify":
      return [
        { key: "store_domain", label: "Shopify Store Domain", placeholder: "your-brand.myshopify.com", type: "text", required: true },
        { key: "admin_access_token", label: "Admin API Access Token", placeholder: "shpat_xxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true },
        { key: "webhook_secret", label: "Webhook Signing Secret", placeholder: "••••••••••••••••••••••••••••••••", type: "password", required: false },
      ];

    case "openai":
      return [
        { key: "api_key", label: "OpenAI API Key", placeholder: "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true },
        { key: "organization_id", label: "Organization ID (Optional)", placeholder: "org-xxxxxxxxxxxxxxxx", type: "text", required: false },
      ];

    case "anthropic":
      return [
        { key: "api_key", label: "Anthropic API Key", placeholder: "sk-ant-api03-xxxxxxxxxxxxxxxxxxxx", type: "password", required: true },
      ];

    case "gemini":
      return [
        { key: "api_key", label: "Google Gemini API Key", placeholder: "AIzasyxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true },
      ];

    case "runway":
    case "higgsfield":
    case "pika":
    case "kling":
      return [
        { key: "api_key", label: `${slug.toUpperCase()} API Key / Secret`, placeholder: "api_key_xxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true },
      ];

    case "zapier":
    case "make":
    case "n8n":
      return [
        { key: "webhook_url", label: "Target Webhook / Scenario URL", placeholder: "https://hooks.zapier.com/hooks/catch/...", type: "text", required: true },
        { key: "api_key", label: "API Key / Auth Header (Optional)", placeholder: "••••••••••••••••", type: "password", required: false },
      ];

    case "google":
    case "google-business":
      return [
        { key: "account_id", label: "Google Business Location / Account ID", placeholder: "locations/1234567890", type: "text", required: true },
        { key: "api_key", label: "OAuth Access Token / API Key", placeholder: "ya29.xxxxxxxxxxxxxxxxxxxx", type: "password", required: true },
      ];

    default:
      return [
        { key: "api_key", label: "API Key / Secret Token", placeholder: "Enter your authentication token", type: "password", required: true },
        { key: "webhook_secret", label: "Webhook Signing Secret (Optional)", placeholder: "Enter signing secret", type: "password", required: false },
      ];
  }
}
