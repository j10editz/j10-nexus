"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleSlash2,
  Command,
  FileText,
  Flame,
  Globe,
  HelpCircle,
  Link2,
  Loader2,
  Megaphone,
  Radio,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { WhatsAppGroupOnboardingWizard } from "./WhatsAppGroupOnboardingWizard";

import {
  DEFAULT_WHATSAPP_GROUP_CONFIG,
  type GroupModerationEvent,
  type GroupModerationRuleKey,
  type WhatsAppGroupConfig,
} from "@/lib/whatsapp/group-bot";

type Props = {
  integrationId: string | null;
  connected: boolean;
  botPhoneNumber?: string;
};

const GUARDIAN_RULE_METADATA: Array<{
  key: GroupModerationRuleKey;
  name: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "antiSpam",
    name: "Anti-Spam",
    description: "Detect and remove repeated or unwanted messages automatically.",
    icon: ShieldAlert,
  },
  {
    key: "antiLink",
    name: "Anti-Link",
    description: "Detect links posted inside protected WhatsApp groups.",
    icon: Link2,
  },
  {
    key: "forbiddenLinks",
    name: "Forbidden Links",
    description: "Delete links matching blocked domains or URL rules.",
    icon: Globe,
  },
  {
    key: "badWordFilter",
    name: "Bad Word Filter",
    description: "Moderate messages containing prohibited words or phrases.",
    icon: CircleSlash2,
  },
  {
    key: "antiFlood",
    name: "Anti-Flood",
    description: "Detect users sending too many messages within a short period.",
    icon: Flame,
  },
  {
    key: "scamDetection",
    name: "Scam Detection",
    description: "Analyze suspicious messages and potential scam behavior.",
    icon: AlertTriangle,
  },
  {
    key: "aiContentModeration",
    name: "AI Content Moderation",
    description: "Use J10 AI to evaluate messages that require contextual moderation.",
    icon: Sparkles,
  },
  {
    key: "autoDelete",
    name: "Auto Delete",
    description: "Remove messages that violate active group rules.",
    icon: Trash2,
  },
  {
    key: "warningSystem",
    name: "Warning System",
    description: "Track moderation warnings for individual group members.",
    icon: AlertTriangle,
  },
  {
    key: "autoRemoveMember",
    name: "Auto Remove Member",
    description: "Remove repeat offenders after reaching the configured warning limit.",
    icon: UserMinus,
  },
];

const PRESET_COMMANDS = [
  "!rules",
  "!status",
  "!help",
  "!announce Attention all members: product release tomorrow at 10 AM!",
  "!warn @14155552671 posting unauthorized telegram invite",
  "!poll Launch Date | Oct 15 | Nov 01 | Nov 15",
  "!kick @14155559812",
  "!ai what are the business hours and refund policies?",
  "Join our crypto group for 1000% profits: https://t.me/freecrypto",
];

export function WhatsAppGroupGuardian({
  integrationId,
  connected,
  botPhoneNumber = "+1 (555) 677-1423",
}: Props) {
  const [config, setConfig] = useState<WhatsAppGroupConfig>(DEFAULT_WHATSAPP_GROUP_CONFIG);
  const [logs, setLogs] = useState<GroupModerationEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Command Sandbox
  const [testInput, setTestInput] = useState("!rules");
  const [simulating, setSimulating] = useState(false);
  const [simulationResponse, setSimulationResponse] = useState<string | null>(null);
  const [simulationAction, setSimulationAction] = useState<string | null>(null);

  // Edit Config Modal/State
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [editRulesText, setEditRulesText] = useState(config.customRulesText);
  const [editForbiddenDomains, setEditForbiddenDomains] = useState(config.forbiddenDomains.join(", "));
  const [editWarningThreshold, setEditWarningThreshold] = useState(config.warningThreshold);
  const [editGroupName, setEditGroupName] = useState(config.groupName);

  const load = useCallback(async () => {
    if (!integrationId) return;
    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/groups`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (response.ok && data.success && data.config) {
        setConfig(data.config);
        setEditRulesText(data.config.customRulesText);
        setEditForbiddenDomains(data.config.forbiddenDomains.join(", "));
        setEditWarningThreshold(data.config.warningThreshold);
        setEditGroupName(data.config.groupName);
        if (Array.isArray(data.moderationLogs)) {
          setLogs(data.moderationLogs);
        }
      }
    } catch (err) {
      console.error("Could not load group config:", err);
    }
  }, [integrationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleRule(ruleKey: GroupModerationRuleKey) {
    if (!integrationId || busy) return;
    const nextState = !config.rules[ruleKey];
    const nextRules = { ...config.rules, [ruleKey]: nextState };
    const nextConfig: WhatsAppGroupConfig = { ...config, rules: nextRules };

    setConfig(nextConfig);
    setBusy(true);
    setNotice(null);

    try {
      const res = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/groups`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextConfig),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update rule.");
      }
      setNotice(`Updated ${ruleKey} to ${nextState ? "Enabled" : "Disabled"}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error saving rule.");
      // rollback
      setConfig(config);
    } finally {
      setBusy(false);
    }
  }

  async function saveConfigModal() {
    if (!integrationId || busy) return;
    setBusy(true);
    setNotice(null);

    const domains = editForbiddenDomains
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    const nextConfig: WhatsAppGroupConfig = {
      ...config,
      groupName: editGroupName.trim() || config.groupName,
      customRulesText: editRulesText.trim() || config.customRulesText,
      forbiddenDomains: domains,
      warningThreshold: editWarningThreshold,
    };

    try {
      const res = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/groups`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextConfig),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save configuration.");
      }
      setConfig(data.config);
      setShowConfigEditor(false);
      setNotice("Group Guardian configuration saved successfully.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error saving configuration.");
    } finally {
      setBusy(false);
    }
  }

  async function executeTestCommand(customText?: string) {
    const textToRun = (customText ?? testInput).trim();
    if (!integrationId || !textToRun || simulating) return;

    setSimulating(true);
    setSimulationResponse(null);
    setSimulationAction(null);
    setNotice(null);

    try {
      const res = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/groups/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: textToRun,
            sender: "+14155550199",
            senderName: "Admin (J10 Dashboard)",
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Simulation failed.");
      }

      if (data.type === "command") {
        setSimulationResponse(data.commandResult?.replyText ?? "Command executed.");
        setSimulationAction(data.commandResult?.action ?? "command");
        if (data.commandResult?.moderationEvent) {
          setLogs((prev) => [data.commandResult.moderationEvent, ...prev]);
        }
      } else {
        const dec = data.moderationDecision;
        if (dec?.violated) {
          setSimulationResponse(dec.replyNotice || `Violated ${dec.ruleName}: ${dec.reason}`);
          setSimulationAction(dec.action || "moderation");
        } else {
          setSimulationResponse("Message passed all active moderation filters (clean).");
          setSimulationAction("approved");
        }
        if (dec?.moderationEvent) {
          setLogs((prev) => [dec.moderationEvent, ...prev]);
        }
      }
    } catch (err) {
      setSimulationResponse(err instanceof Error ? `Error: ${err.message}` : "Simulation error");
      setSimulationAction("error");
    } finally {
      setSimulating(false);
    }
  }

  const activeRulesCount = Object.values(config.rules).filter(Boolean).length;

  return (
    <section className="mt-10 rounded-2xl border border-violet-500/20 bg-[#0c0d10] p-6 lg:p-8">
      {/* HEADER & OPERATIONAL STATUS */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 items-center justify-center">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              WhatsApp Group Guardian & Bot
            </p>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Automated Group Protection & Admin Commands
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-zinc-400">
            Deploy J10 into client WhatsApp groups. Automatically filter spam, forbidden links, profanity,
            and scams while empowering administrators with <code className="text-violet-300">!rules</code>,{" "}
            <code className="text-violet-300">!announce</code>, <code className="text-violet-300">!warn</code>, and{" "}
            <code className="text-violet-300">!poll</code>.
          </p>
          <div className="mt-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-300">Meta Groups API Eligibility:</span> Official Meta Cloud API Groups integration requires a dedicated WABA number with Cloud Groups access enabled. Standard consumer WhatsApp Business numbers and Multi-solution Conversations numbers are excluded by Meta.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
            <Radio size={13} className="animate-pulse text-emerald-400" />
            Active Protection Engine: Operational
          </div>
          <button
            type="button"
            onClick={() => setShowOnboardingWizard(true)}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 shadow-lg shadow-violet-500/20"
          >
            <UserPlus size={13} />
            Deploy Bot to Group (Wizard)
          </button>
          <button
            type="button"
            onClick={() => setShowConfigEditor(!showConfigEditor)}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
          >
            <Save size={13} />
            Edit Rules & Limits
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-xs text-violet-300">
          {notice}
        </div>
      )}

      {/* CONFIGURATION EDITOR ACCORDION */}
      {showConfigEditor && (
        <div className="mt-6 rounded-xl border border-white/10 bg-[#121318] p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-semibold text-white">Group Rules & Thresholds</h3>
            <span className="text-xs text-zinc-400">Active Rules: {activeRulesCount}/10</span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-zinc-300">Managed Group Name</label>
              <input
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-violet-500"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300">
                Warning Strike Limit before Auto-Kick ({editWarningThreshold} strikes)
              </label>
              <input
                type="range"
                min={1}
                max={5}
                className="mt-3 w-full accent-violet-500"
                value={editWarningThreshold}
                onChange={(e) => setEditWarningThreshold(Number(e.target.value))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-medium text-zinc-300">
                Official Group Guidelines (Returned by <code className="text-violet-400">!rules</code>)
              </label>
              <textarea
                rows={4}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white outline-none focus:border-violet-500"
                value={editRulesText}
                onChange={(e) => setEditRulesText(e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-medium text-zinc-300">
                Forbidden Link Domains (Comma-separated)
              </label>
              <input
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-violet-500"
                value={editForbiddenDomains}
                onChange={(e) => setEditForbiddenDomains(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowConfigEditor(false)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveConfigModal()}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* 10 LIVE INTERACTIVE TOGGLES */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Active Protection Modules ({activeRulesCount} of 10 Armed)
          </p>
          <span className="text-xs text-violet-400">Click any switch to toggle in real time</span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {GUARDIAN_RULE_METADATA.map((rule) => {
            const isEnabled = config.rules[rule.key];
            const Icon = rule.icon;

            return (
              <div
                key={rule.key}
                className={`flex items-center justify-between gap-4 rounded-xl border p-4 transition ${
                  isEnabled
                    ? "border-violet-500/25 bg-[#121318]"
                    : "border-white/[0.05] bg-[#0c0d10] opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      isEnabled ? "bg-violet-500/15 text-violet-400" : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{rule.name}</p>
                      {isEnabled && (
                        <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{rule.description}</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleRule(rule.key)}
                  aria-label={`Toggle ${rule.name}`}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none ${
                    isEnabled ? "bg-violet-600" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* INTERACTIVE GROUP BOT COMMAND SANDBOX */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-[#111216] p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Group Bot Command Sandbox</h3>
          </div>
          <span className="text-[11px] text-zinc-400">
            Simulate admin commands and moderation triggers with instant preview
          </span>
        </div>

        {/* PRESET CHIPS */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-zinc-500">Quick tests:</span>
          {PRESET_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => {
                setTestInput(cmd);
                void executeTestCommand(cmd);
              }}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-300 transition hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-white"
            >
              {cmd.length > 32 ? `${cmd.slice(0, 32)}…` : cmd}
            </button>
          ))}
        </div>

        {/* INPUT FORM */}
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-xs text-white outline-none focus:border-violet-500"
            placeholder="Type a command (e.g. !rules, !announce Hello, !warn @user) or a test message..."
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void executeTestCommand();
            }}
          />
          <button
            type="button"
            disabled={simulating || !testInput.trim()}
            onClick={() => void executeTestCommand()}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {simulating ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Run Test
          </button>
        </div>

        {/* SIMULATION PREVIEW (WHATSAPP BUBBLE PREVIEW) */}
        {simulationResponse && (
          <div className="mt-4 rounded-xl border border-violet-500/20 bg-black/40 p-4">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Bot size={13} className="text-violet-400" />
                Bot Reaction Preview ({simulationAction ?? "reply"})
              </span>
              <span>Just now · WhatsApp Group Context</span>
            </div>

            <div className="mt-2.5 rounded-lg border border-white/5 bg-[#17202a] p-3 text-xs leading-relaxed text-zinc-200">
              <div className="whitespace-pre-wrap font-sans">{simulationResponse}</div>
            </div>
          </div>
        )}
      </div>

      {/* LIVE MODERATION AUDIT LOG */}
      <div className="mt-8">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Real-Time Moderation Audit Trail</h3>
          </div>
          <span className="text-xs text-zinc-400">Recent group enforcement events</span>
        </div>

        <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#111216]">
          {logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              No moderation events recorded yet. Try running a command in the sandbox above.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {logs.slice(0, 8).map((evt) => (
                <div key={evt.id} className="flex flex-col gap-1 p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        evt.action === "kick" || evt.action === "ban"
                          ? "bg-rose-500/20 text-rose-300"
                          : evt.action === "delete"
                            ? "bg-amber-500/20 text-amber-300"
                            : evt.action === "warn"
                              ? "bg-orange-500/20 text-orange-300"
                              : evt.action === "announcement"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-violet-500/20 text-violet-300"
                      }`}
                    >
                      {evt.action}
                    </span>
                    <div>
                      <span className="font-medium text-white">{evt.senderName || evt.sender}</span>
                      <span className="ml-2 text-zinc-400">{evt.reason}</span>
                    </div>
                  </div>

                  <span className="text-[11px] text-zinc-500">
                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* ONBOARDING WIZARD MODAL */}
      <WhatsAppGroupOnboardingWizard
        isOpen={showOnboardingWizard}
        onClose={() => setShowOnboardingWizard(false)}
        integrationId={integrationId}
        botPhoneNumber={botPhoneNumber}
        onSuccess={() => {
          void load();
        }}
      />
    </section>
  );
}
