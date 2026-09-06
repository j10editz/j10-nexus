"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  History,
  Activity,
  Sliders,
  DollarSign,
  AlertTriangle,
  Award,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Plus,
  RefreshCw,
  Cpu,
  Layers,
  ArrowUpRight,
  Clock,
  Zap,
} from "lucide-react";
import type {
  AgentVersion,
  AgentTrace,
  AgentPermissions,
  AgentBudget,
  ApprovalGate,
  AgentEvaluation,
  ReliabilityMetrics,
  RoiAttributionSummary,
} from "@/types/governance";

interface GovernanceControlCenterProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

export default function GovernanceControlCenter({
  agentId,
  agentName,
  onClose,
}: GovernanceControlCenterProps) {
  const [activeTab, setActiveTab] = useState<
    | "roi"
    | "versions"
    | "traces"
    | "permissions"
    | "budgets"
    | "approvals"
    | "evals"
    | "reliability"
  >("roi");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State slices
  const [roiSummary, setRoiSummary] = useState<RoiAttributionSummary | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [permissions, setPermissions] = useState<AgentPermissions | null>(null);
  const [budget, setBudget] = useState<AgentBudget | null>(null);
  const [approvals, setApprovals] = useState<ApprovalGate[]>([]);
  const [evaluations, setEvaluations] = useState<AgentEvaluation[]>([]);
  const [reliability, setReliability] = useState<ReliabilityMetrics | null>(null);

  // New Version Form state
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newModel, setNewModel] = useState("gpt-5.6-sol");
  const [newChangelog, setNewChangelog] = useState("");

  useEffect(() => {
    loadAllGovernanceData();
  }, [agentId]);

  async function loadAllGovernanceData() {
    setLoading(true);
    setError(null);
    try {
      const [
        roiRes,
        versionsRes,
        tracesRes,
        permRes,
        budgetRes,
        approvalsRes,
        evalsRes,
        reliabilityRes,
      ] = await Promise.all([
        fetch("/api/governance/roi").then((r) => r.json()),
        fetch(`/api/governance/versions?agentId=${encodeURIComponent(agentId)}`).then((r) => r.json()),
        fetch(`/api/governance/traces?agentId=${encodeURIComponent(agentId)}&limit=20`).then((r) => r.json()),
        fetch(`/api/governance/permissions?agentId=${encodeURIComponent(agentId)}`).then((r) => r.json()),
        fetch(`/api/governance/budgets?agentId=${encodeURIComponent(agentId)}`).then((r) => r.json()),
        fetch(`/api/governance/approvals?agentId=${encodeURIComponent(agentId)}`).then((r) => r.json()),
        fetch(`/api/governance/evals?agentId=${encodeURIComponent(agentId)}`).then((r) => r.json()),
        fetch("/api/governance/reliability").then((r) => r.json()),
      ]);

      if (roiRes.success) setRoiSummary(roiRes.summary);
      if (versionsRes.success) setVersions(versionsRes.versions);
      if (tracesRes.success) setTraces(tracesRes.traces);
      if (permRes.success) setPermissions(permRes.permissions);
      if (budgetRes.success) setBudget(budgetRes.budget);
      if (approvalsRes.success) setApprovals(approvalsRes.approvals);
      if (evalsRes.success) setEvaluations(evalsRes.evaluations);
      if (reliabilityRes.success) setReliability(reliabilityRes.metrics);
    } catch (err: any) {
      console.error("Governance fetch error:", err);
      setError("Failed to load governance telemetry.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePromoteVersion(versionId: string) {
    try {
      const res = await fetch("/api/governance/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote", versionId }),
      });
      const data = await res.json();
      if (data.success) {
        loadAllGovernanceData();
      }
    } catch (err) {
      console.error("Promote error:", err);
    }
  }

  async function handleRollbackVersion(targetVersionNumber: number) {
    try {
      const res = await fetch("/api/governance/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", agentId, targetVersionNumber }),
      });
      const data = await res.json();
      if (data.success) {
        loadAllGovernanceData();
      }
    } catch (err) {
      console.error("Rollback error:", err);
    }
  }

  async function handleCreateVersion() {
    if (!newPrompt) return;
    try {
      const res = await fetch("/api/governance/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          systemPrompt: newPrompt,
          modelId: newModel,
          changelog: newChangelog || "Manual prompt update",
          makeActive: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewVersionModal(false);
        setNewPrompt("");
        setNewChangelog("");
        loadAllGovernanceData();
      }
    } catch (err) {
      console.error("Create version error:", err);
    }
  }

  async function handleResolveApproval(gateId: string, decision: "approved" | "rejected") {
    try {
      const res = await fetch("/api/governance/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", gateId, decision }),
      });
      const data = await res.json();
      if (data.success) {
        loadAllGovernanceData();
      }
    } catch (err) {
      console.error("Approval resolve error:", err);
    }
  }

  async function handleRunEvaluation() {
    if (versions.length === 0) return;
    const activeVer = versions.find((v) => v.status === "active") || versions[0];
    setLoading(true);
    try {
      const res = await fetch("/api/governance/evals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          versionId: activeVer.id,
          benchmarkName: "lead-qualification-v1",
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadAllGovernanceData();
      }
    } catch (err) {
      console.error("Eval run error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetCircuitBreaker() {
    try {
      const res = await fetch("/api/governance/reliability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (data.success) {
        setReliability(data.metrics);
      }
    } catch (err) {
      console.error("Reset error:", err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Governed AI Platform</h2>
                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {agentName}
                </span>
                {reliability?.circuitBreakerState === "closed" ? (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                    HEALTHY
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-950 text-rose-400 border border-rose-800">
                    CIRCUIT TRIPPED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Continuous observability, budget guardrails, human approvals, and ROI attribution.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAllGovernanceData}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-slate-800 bg-slate-950 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab("roi")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "roi"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            ROI Attribution
          </button>

          <button
            onClick={() => setActiveTab("versions")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "versions"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Versions & Prompts ({versions.length})
          </button>

          <button
            onClick={() => setActiveTab("traces")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "traces"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Execution Traces ({traces.length})
          </button>

          <button
            onClick={() => setActiveTab("permissions")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "permissions"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Tool Permissions
          </button>

          <button
            onClick={() => setActiveTab("budgets")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "budgets"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Budgets & Caps
          </button>

          <button
            onClick={() => setActiveTab("approvals")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "approvals"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Approval Gates ({approvals.length})
          </button>

          <button
            onClick={() => setActiveTab("evals")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "evals"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Evaluations ({evaluations.length})
          </button>

          <button
            onClick={() => setActiveTab("reliability")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === "reliability"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Reliability & Circuit
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 text-rose-300 text-xs rounded-lg">
              {error}
            </div>
          )}

          {/* 1. ROI ATTRIBUTION TAB */}
          {activeTab === "roi" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 mb-1">Net ROI Value</div>
                  <div className="text-2xl font-bold text-emerald-400">
                    ${roiSummary?.netRoiUsd.toLocaleString() || "0.00"}
                  </div>
                  <div className="text-[11px] text-emerald-500/80 mt-1">Verified commercial value</div>
                </div>

                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 mb-1">ROI Multiplier</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {roiSummary?.roiMultiplier || 0}x
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Gross Return / Compute Spend</div>
                </div>

                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 mb-1">Attributed Won Revenue</div>
                  <div className="text-2xl font-bold text-slate-100">
                    ${roiSummary?.totalAttributedRevenue.toLocaleString() || "0.00"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">Direct CRM closed deals</div>
                </div>

                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 mb-1">Labor Savings</div>
                  <div className="text-2xl font-bold text-slate-100">
                    ${roiSummary?.totalLaborSavings.toLocaleString() || "0.00"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {roiSummary?.totalHoursSaved || 0} hours @ $45/hr
                  </div>
                </div>
              </div>

              {/* Top Agents Breakdown */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">
                  Workforce Commercial Contribution
                </h3>
                <div className="divide-y divide-slate-800 text-xs">
                  {roiSummary?.topAgents && roiSummary.topAgents.length > 0 ? (
                    roiSummary.topAgents.map((ag) => (
                      <div key={ag.agentId} className="py-3 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-200">{ag.agentName}</div>
                          <div className="text-slate-500">ID: {ag.agentId}</div>
                        </div>
                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <div className="text-slate-400 text-[11px]">Gross Value</div>
                            <div className="font-medium text-slate-200">${ag.grossValueUsd.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[11px]">Compute Cost</div>
                            <div className="font-medium text-slate-400">${ag.computeCostUsd.toFixed(4)}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[11px]">Net ROI</div>
                            <div className="font-bold text-emerald-400">${ag.netRoiUsd.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800 font-bold">
                              {ag.roiMultiplier}x
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 text-center text-slate-500">
                      No attributed revenue recorded yet for this workspace.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. VERSIONS TAB */}
          {activeTab === "versions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Version History & Prompts</h3>
                  <p className="text-xs text-slate-400">
                    Immutable prompt snapshots with instantaneous 1-click rollback.
                  </p>
                </div>
                <button
                  onClick={() => setShowNewVersionModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Snapshot New Version
                </button>
              </div>

              <div className="space-y-3">
                {versions.map((ver) => (
                  <div
                    key={ver.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      ver.status === "active"
                        ? "bg-slate-900/80 border-blue-500/40"
                        : "bg-slate-900/30 border-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-100">
                            Version {ver.versionNumber}
                          </span>
                          {ver.status === "active" ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                              ACTIVE PROD
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                              {ver.status.toUpperCase()}
                            </span>
                          )}
                          <span className="text-xs text-slate-500 font-mono">
                            Model: {ver.modelId} · Temp: {ver.temperature}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{ver.changelog}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {ver.status !== "active" && (
                          <>
                            <button
                              onClick={() => handlePromoteVersion(ver.id)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs transition-colors"
                            >
                              Promote
                            </button>
                            <button
                              onClick={() => handleRollbackVersion(ver.versionNumber)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800 rounded text-xs transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Rollback
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 text-xs font-mono text-slate-300 max-h-28 overflow-y-auto whitespace-pre-wrap">
                      {ver.systemPrompt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. EXECUTION TRACES TAB */}
          {activeTab === "traces" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Real-Time Execution Traces</h3>
                <p className="text-xs text-slate-400">
                  Full execution logs, step-by-step reasoning, token accounting, and compute cost.
                </p>
              </div>

              <div className="space-y-3">
                {traces.length > 0 ? (
                  traces.map((tr) => (
                    <div key={tr.id} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                              tr.status === "completed"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : tr.status === "waiting_approval"
                                ? "bg-amber-950 text-amber-400 border border-amber-800"
                                : tr.status === "failed"
                                ? "bg-rose-950 text-rose-400 border border-rose-800"
                                : "bg-blue-950 text-blue-400 border border-blue-800"
                            }`}
                          >
                            {tr.status.toUpperCase()}
                          </span>
                          <span className="font-mono text-slate-400">{tr.modelUsed}</span>
                          <span className="text-slate-500">· {tr.latencyMs}ms</span>
                        </div>

                        <div className="flex items-center gap-4 text-slate-400">
                          <span>Tokens: {tr.totalTokens}</span>
                          <span className="font-semibold text-slate-200">${tr.costUsd.toFixed(5)}</span>
                          <span className="text-slate-500">{new Date(tr.startedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {/* Steps breakdown */}
                      {tr.steps && tr.steps.length > 0 && (
                        <div className="mt-2 pl-3 border-l-2 border-slate-800 space-y-1.5 text-xs">
                          {tr.steps.map((st) => (
                            <div key={st.id} className="flex items-center justify-between text-slate-400">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-500">#{st.stepNumber}</span>
                                <span className="font-semibold text-slate-300">{st.stepType}:</span>
                                <span>{st.toolName || st.thought || "Processed"}</span>
                              </div>
                              <span className="text-slate-500">{st.latencyMs}ms</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No execution traces recorded yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. PERMISSIONS TAB */}
          {activeTab === "permissions" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Capability Access Policies</h3>
                <p className="text-xs text-slate-400">
                  Pre-execution allowlists and restricted tool permissions.
                </p>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-4">
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">Permitted Capabilities</div>
                  <div className="flex flex-wrap gap-2">
                    {permissions?.allowedTools.map((tool) => (
                      <span
                        key={tool}
                        className="px-2.5 py-1 bg-blue-950/60 border border-blue-800/80 text-blue-300 rounded text-xs font-mono"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">Explicitly Blocked Operations</div>
                  <div className="flex flex-wrap gap-2">
                    {permissions?.deniedTools.map((tool) => (
                      <span
                        key={tool}
                        className="px-2.5 py-1 bg-rose-950/60 border border-rose-800/80 text-rose-300 rounded text-xs font-mono"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400">Code Execution Sandbox: </span>
                    <span className="font-semibold text-slate-200">
                      {permissions?.canExecuteCode ? "Enabled" : "Disabled (Enforced)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">External API Gate: </span>
                    <span className="font-semibold text-slate-200">
                      {permissions?.canCallExternalApis ? "Permitted" : "Blocked"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. BUDGETS TAB */}
          {activeTab === "budgets" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Financial Budgets & Spending Caps</h3>
                <p className="text-xs text-slate-400">
                  Hard operational ceilings and over-budget containment.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 mb-1">Daily Spend Limit</div>
                  <div className="text-xl font-bold text-slate-100">
                    ${budget?.dailyBudgetUsd.toFixed(2) || "25.00"}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    Consumed: ${budget?.currentDailySpendUsd.toFixed(4) || "0.0000"}
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          ((budget?.currentDailySpendUsd || 0) / (budget?.dailyBudgetUsd || 25)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 mb-1">Monthly Spend Limit</div>
                  <div className="text-xl font-bold text-slate-100">
                    ${budget?.monthlyBudgetUsd.toFixed(2) || "500.00"}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    Consumed: ${budget?.currentMonthlySpendUsd.toFixed(4) || "0.0000"}
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          ((budget?.currentMonthlySpendUsd || 0) / (budget?.monthlyBudgetUsd || 500)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 mb-1">Over-Budget Policy</div>
                  <div className="text-sm font-bold text-amber-400 uppercase mt-1">
                    {budget?.overBudgetPolicy || "require_approval"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-3">
                    Max execution ceiling: ${budget?.maxCostPerExecutionUsd.toFixed(2) || "1.50"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. APPROVAL GATES TAB */}
          {activeTab === "approvals" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Human Approval Queue</h3>
                <p className="text-xs text-slate-400">
                  Actions paused for administrative review and authorization.
                </p>
              </div>

              <div className="space-y-3">
                {approvals.length > 0 ? (
                  approvals.map((gate) => (
                    <div key={gate.id} className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-950 text-amber-400 border border-amber-800 uppercase">
                              {gate.estimatedRisk} RISK
                            </span>
                            <span className="font-semibold text-slate-200 text-xs">
                              {gate.actionType}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1">{gate.reason}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleResolveApproval(gate.id, "approved")}
                            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleResolveApproval(gate.id, "rejected")}
                            className="flex items-center gap-1 px-3 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded text-xs font-semibold transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 p-2 bg-slate-950 rounded border border-slate-800 text-[11px] font-mono text-slate-400">
                        {JSON.stringify(gate.actionPayload, null, 2)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No pending approval gates. Operations executing normally.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 7. EVALUATIONS TAB */}
          {activeTab === "evals" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Evaluation Benchmarks</h3>
                  <p className="text-xs text-slate-400">
                    Automated alignment, hallucination resistance, and safety scoring.
                  </p>
                </div>
                <button
                  onClick={handleRunEvaluation}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Award className="w-3.5 h-3.5" />
                  Run Benchmark Test
                </button>
              </div>

              <div className="space-y-3">
                {evaluations.map((ev) => (
                  <div key={ev.id} className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-semibold text-slate-200">{ev.benchmarkName}</div>
                      <span className="text-slate-400">
                        {new Date(ev.evaluatedAt).toLocaleDateString()} · P95: {ev.p95LatencyMs}ms
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div className="p-2 bg-slate-950 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-400">Pass Rate</div>
                        <div className="text-base font-bold text-emerald-400">{ev.passRate}%</div>
                      </div>
                      <div className="p-2 bg-slate-950 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-400">Accuracy</div>
                        <div className="text-base font-bold text-blue-400">{ev.accuracyScore}%</div>
                      </div>
                      <div className="p-2 bg-slate-950 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-400">Groundedness</div>
                        <div className="text-base font-bold text-indigo-400">{ev.groundednessScore}%</div>
                      </div>
                      <div className="p-2 bg-slate-950 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-400">Safety</div>
                        <div className="text-base font-bold text-emerald-400">{ev.safetyScore}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. RELIABILITY TAB */}
          {activeTab === "reliability" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Circuit Breakers & Telemetry</h3>
                  <p className="text-xs text-slate-400">
                    Continuous sliding-window health monitoring and automated recovery.
                  </p>
                </div>
                {reliability?.circuitBreakerState !== "closed" && (
                  <button
                    onClick={handleResetCircuitBreaker}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset Circuit Breaker
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center">
                  <div className="text-xs text-slate-400 mb-1">Error Rate</div>
                  <div className="text-2xl font-bold text-slate-100">
                    {reliability?.errorRatePercent || 0}%
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Threshold: 25%</div>
                </div>

                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center">
                  <div className="text-xs text-slate-400 mb-1">Fallback Activations</div>
                  <div className="text-2xl font-bold text-slate-100">
                    {reliability?.fallbackCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {reliability?.fallbackRatePercent || 0}% of traffic
                  </div>
                </div>

                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center">
                  <div className="text-xs text-slate-400 mb-1">P50 Latency</div>
                  <div className="text-2xl font-bold text-slate-100">
                    {reliability?.p50LatencyMs || 0}ms
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Median response</div>
                </div>

                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-center">
                  <div className="text-xs text-slate-400 mb-1">P90 Latency</div>
                  <div className="text-2xl font-bold text-slate-100">
                    {reliability?.p90LatencyMs || 0}ms
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">90th percentile</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Snapshot New Version Modal */}
      {showNewVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-slate-100">
            <h3 className="text-sm font-semibold">Snapshot New Agent Version</h3>
            <div>
              <label className="text-xs text-slate-400">System Prompt</label>
              <textarea
                rows={5}
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Enter system prompt instructions..."
                className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Model</label>
              <select
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200"
              >
                <option value="gpt-5.6-sol">GPT-5.6 Sol (Frontier)</option>
                <option value="gpt-5.6-terra">GPT-5.6 Terra (Standard)</option>
                <option value="gpt-5.6-luna">GPT-5.6 Luna (Fast)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Changelog Note</label>
              <input
                type="text"
                value={newChangelog}
                onChange={(e) => setNewChangelog(e.target.value)}
                placeholder="e.g. Optimized objection handling"
                className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewVersionModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateVersion}
                disabled={!newPrompt}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium"
              >
                Create & Activate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
