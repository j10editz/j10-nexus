"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Globe,
  Palette,
  Layers,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Trash2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { WorkspaceBranding } from "@/lib/agency/branding";
import type { DomainRecord } from "@/lib/agency/domains";
import type { WorkspaceTemplate } from "@/lib/agency/templates";
import type { ClientWorkspaceSummary } from "@/lib/agency/client-onboarding";

export default function AgencySettingsPage() {
  const [activeTab, setActiveTab] = useState<"clients" | "branding" | "domains" | "templates">("clients");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Agency Data State
  const [clients, setClients] = useState<ClientWorkspaceSummary[]>([]);
  const [branding, setBranding] = useState<WorkspaceBranding | null>(null);
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);

  // Modals & Form State
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientTemplate, setNewClientTemplate] = useState("solar-energy-residential");
  const [newClientBilling, setNewClientBilling] = useState<"agency_funded" | "direct">("agency_funded");
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // New Domain State
  const [newDomain, setNewDomain] = useState("");
  const [domainDnsInstructions, setDomainDnsInstructions] = useState<any[] | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [brandRes, domRes, tmplRes, clientRes] = await Promise.all([
        fetch("/api/agency/branding").then((r) => r.json()),
        fetch("/api/agency/domains").then((r) => r.json()),
        fetch("/api/agency/templates").then((r) => r.json()),
        fetch("/api/agency/clients").then((r) => r.json()),
      ]);

      if (brandRes.success) setBranding(brandRes.branding);
      if (domRes.success) setDomains(domRes.domains);
      if (tmplRes.success) setTemplates(tmplRes.templates);
      if (clientRes.success) setClients(clientRes.clients);
    } catch (err) {
      console.error("Failed to load agency settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    if (!branding) return;

    try {
      setSaving(true);
      const res = await fetch("/api/agency/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: branding.brandName,
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          whiteLabelEnabled: branding.whiteLabelEnabled,
          portalTitle: branding.portalTitle,
          portalWelcomeMessage: branding.portalWelcomeMessage,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotice("White-label branding saved successfully.");
        setTimeout(() => setNotice(null), 4000);
      } else {
        alert(data.error || "Failed to save branding.");
      }
    } catch (err) {
      alert("Error saving branding.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain) return;

    try {
      setSaving(true);
      const res = await fetch("/api/agency/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain }),
      });

      const data = await res.json();
      if (data.success) {
        setDomainDnsInstructions(data.dnsInstructions);
        setNewDomain("");
        await fetchData();
      } else {
        alert(data.error || "Failed to register custom domain.");
      }
    } catch (err) {
      alert("Error registering domain.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyDomain(domainId: string) {
    try {
      setSaving(true);
      const res = await fetch("/api/agency/domains/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        await fetchData();
      } else {
        alert(data.error || "Verification failed.");
      }
    } catch (err) {
      alert("Error verifying domain.");
    } finally {
      setSaving(false);
    }
  }

  async function handleOnboardClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientName || !newClientEmail) return;

    try {
      setSaving(true);
      const res = await fetch("/api/agency/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: newClientName,
          clientContactEmail: newClientEmail,
          templateSlug: newClientTemplate,
          billingMode: newClientBilling,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCreatedInviteUrl(data.invitationUrl);
        setNewClientName("");
        setNewClientEmail("");
        await fetchData();
      } else {
        alert(data.error || "Failed to onboard client.");
      }
    } catch (err) {
      alert("Error onboarding client.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyTemplate(templateSlug: string) {
    if (!confirm(`Apply blueprint '${templateSlug}' to current workspace?`)) return;
    try {
      setSaving(true);
      const res = await fetch("/api/agency/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlug }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully seeded ${data.agentsCreated} AI Employees and ${data.knowledgeTopicsCreated} Knowledge Hub guides!`);
      } else {
        alert(data.error || "Failed to apply template.");
      }
    } catch (err) {
      alert("Error applying blueprint.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
          <span className="text-sm">Loading agency commercialization suite...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Agency & Client Commercialization
            </h1>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
              Tier 2 Certified
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            White-label your autonomous AI workforce platform, onboard client sub-workspaces, deploy custom domains, and seed vertical blueprints.
          </p>
        </div>

        {notice && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1.5 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            <span>{notice}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("clients")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "clients"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Client Sub-Workspaces ({clients.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("branding")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "branding"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Palette className="h-4 w-4" />
          <span>White-Label Brand Studio</span>
        </button>

        <button
          onClick={() => setActiveTab("domains")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "domains"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Globe className="h-4 w-4" />
          <span>Custom Domains ({domains.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeTab === "templates"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Industry Blueprints ({templates.length})</span>
        </button>
      </div>

      {/* Tab 1: Client Sub-Workspaces */}
      {activeTab === "clients" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Client Portfolio Management</h2>
              <p className="text-xs text-slate-400">
                Manage client workspaces, provision autonomous accounts, and control billing modes.
              </p>
            </div>
            <button
              onClick={() => setShowAddClient(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" />
              Onboard Client Workspace
            </button>
          </div>

          {/* Client List */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-md">
            {clients.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No client workspaces onboarded yet. Click &quot;Onboard Client Workspace&quot; to provision your first client account.
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Client Name</th>
                    <th className="px-4 py-3 font-semibold">Brand / Slug</th>
                    <th className="px-4 py-3 font-semibold">Plan & Tier</th>
                    <th className="px-4 py-3 font-semibold">Billing Mode</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Custom Domain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {clients.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{c.slug}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-medium uppercase text-slate-300">
                          {c.plan} • {c.clientTier}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-400">
                          {c.billingMode.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {c.customDomain ? (
                          <span className="font-mono text-emerald-400">{c.customDomain}</span>
                        ) : (
                          <span className="text-slate-600">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Onboard Client Modal */}
          {showAddClient && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
                <h3 className="text-base font-bold text-white">Onboard Client Workspace</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Provision an isolated tenant, seed industry AI Employees, and generate a client invite.
                </p>

                {createdInviteUrl ? (
                  <div className="mt-4 space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      Client Workspace Provisioned & Ready
                    </div>
                    <p className="text-xs text-slate-300">Share this single-use activation URL with your client:</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={createdInviteUrl}
                        className="w-full rounded border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(createdInviteUrl);
                          setCopiedInvite(true);
                          setTimeout(() => setCopiedInvite(false), 2000);
                        }}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                      >
                        {copiedInvite ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedInvite ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setCreatedInviteUrl(null);
                        setShowAddClient(false);
                      }}
                      className="mt-2 w-full rounded-lg bg-slate-800 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleOnboardClient} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300">Client Organization Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Apex Solar Dynamics"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300">Client Primary Contact Email</label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. client@company.com"
                        value={newClientEmail}
                        onChange={(e) => setNewClientEmail(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300">Industry AI Blueprint Template</label>
                      <select
                        value={newClientTemplate}
                        onChange={(e) => setNewClientTemplate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                      >
                        {templates.map((t) => (
                          <option key={t.slug} value={t.slug}>
                            {t.name} ({t.vertical})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300">Commercial Billing Mode</label>
                      <select
                        value={newClientBilling}
                        onChange={(e) => setNewClientBilling(e.target.value as any)}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="agency_funded">Agency Funded (Consolidated wholesale billing)</option>
                        <option value="direct">Direct Client Invoicing (Client pays Stripe directly)</option>
                      </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddClient(false)}
                        className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {saving ? "Provisioning..." : "Launch Client Workspace"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: White-Label Brand Studio */}
      {activeTab === "branding" && branding && (
        <form onSubmit={handleSaveBranding} className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md">
            <h2 className="text-base font-semibold text-white">Brand Assets & Themes</h2>
            <p className="text-xs text-slate-400">
              Customize the platform logo, colors, and portal messaging for client-facing presentation.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Brand Display Name</label>
                  <input
                    type="text"
                    value={branding.brandName}
                    onChange={(e) => setBranding({ ...branding, brandName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Logo Image URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={branding.logoUrl || ""}
                    onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">Primary Brand Color</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={branding.primaryColor}
                        onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                        className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={branding.primaryColor}
                        onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300">Accent Color</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={branding.accentColor}
                        onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                        className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={branding.accentColor}
                        onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-200"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="whiteLabelToggle"
                    checked={branding.whiteLabelEnabled}
                    onChange={(e) => setBranding({ ...branding, whiteLabelEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <label htmlFor="whiteLabelToggle" className="text-xs font-medium text-slate-300">
                    Completely Remove &quot;Powered by J10 NEXUS&quot; Watermarks
                  </label>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-5 shadow-2xl">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">Live Client Preview</span>
                  <div className="mt-4 flex items-center gap-3">
                    {branding.logoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={branding.logoUrl} alt="Brand Logo" className="h-8 w-auto object-contain" />
                    ) : (
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white shadow-lg"
                        style={{ backgroundColor: branding.primaryColor }}
                      >
                        {branding.brandName.slice(0, 1)}
                      </div>
                    )}
                    <span className="text-sm font-bold text-white">{branding.brandName}</span>
                  </div>

                  <div className="mt-6 rounded-lg border border-slate-800/80 bg-slate-900/60 p-4">
                    <div className="text-xs font-semibold text-white">Client Portal Header</div>
                    <p className="mt-1 text-xs text-slate-400">
                      {branding.portalWelcomeMessage || "Welcome to your autonomous workforce portal."}
                    </p>
                    <button
                      type="button"
                      className="mt-3 rounded px-3 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: branding.primaryColor }}
                    >
                      Client Action
                    </button>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-800/60 pt-3 text-[11px] text-slate-500">
                  {branding.whiteLabelEnabled ? (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> 100% White-Labeled (Zero Platform Watermark)
                    </span>
                  ) : (
                    <span>Powered by J10 NEXUS badge active</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving Changes..." : "Save Brand Settings"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tab 3: Custom Domains */}
      {activeTab === "domains" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md">
            <h2 className="text-base font-semibold text-white">Custom Domain Management</h2>
            <p className="text-xs text-slate-400">
              Host your client portal and autonomous workflows under your own white-labeled subdomain or vanity URL.
            </p>

            <form onSubmit={handleRegisterDomain} className="mt-4 flex gap-3">
              <input
                type="text"
                required
                placeholder="e.g. portal.youragency.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="max-w-md flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Connect Domain
              </button>
            </form>

            {/* DNS Instructions Banner */}
            {domainDnsInstructions && (
              <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-950/40 p-4">
                <h3 className="text-xs font-bold text-blue-300">Required DNS Records</h3>
                <p className="mt-1 text-xs text-slate-300">
                  Add the following DNS records in your DNS provider (e.g. Cloudflare, GoDaddy, AWS Route 53):
                </p>
                <div className="mt-3 space-y-2">
                  {domainDnsInstructions.map((ins, i) => (
                    <div key={i} className="flex items-center justify-between rounded bg-slate-950 p-2.5 font-mono text-[11px]">
                      <div>
                        <strong className="text-blue-400">{ins.type}</strong>: {ins.name} → <span className="text-slate-300">{ins.value}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{ins.purpose}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Registered Domains Table */}
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
              {domains.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No custom domains connected yet. Enter your domain above to begin.
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Domain</th>
                      <th className="px-4 py-2.5 font-semibold">CNAME Target</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">SSL Status</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {domains.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-semibold text-white">{d.domain}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{d.dns_cname_target}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              d.status === "active"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                            {d.ssl_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {d.status !== "active" && (
                            <button
                              onClick={() => handleVerifyDomain(d.id)}
                              className="mr-2 rounded bg-emerald-600/20 px-2.5 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-600/30"
                            >
                              Verify DNS
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Industry Blueprints */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-white">Vertical Industry Blueprints</h2>
            <p className="text-xs text-slate-400">
              Turnkey AI agent teams pre-configured with industry standard operating procedures, pipeline stages, and system prompts.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((tmpl) => (
              <div
                key={tmpl.slug}
                className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-md transition hover:border-slate-700"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase">
                      {tmpl.vertical.replace("_", " ")}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {tmpl.default_ai_employees?.length || 0} Agents
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-white">{tmpl.name}</h3>
                  <p className="mt-1.5 text-xs text-slate-400">{tmpl.description}</p>

                  <div className="mt-4 space-y-1.5 border-t border-slate-800/60 pt-3">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Included AI Specialists:</span>
                    {(tmpl.default_ai_employees || []).map((emp, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                        <Sparkles className="h-3 w-3 text-emerald-400" />
                        <span><strong>{emp.name}</strong> • {emp.role}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleApplyTemplate(tmpl.slug)}
                  disabled={saving}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Seed Blueprint to Workspace
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
