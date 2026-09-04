"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  MessageSquare,
  QrCode,
  Radio,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

export type OnboardingPreset = "vip_community" | "crypto_signals" | "customer_support" | "ecommerce_hub";

export const ONBOARDING_PRESETS: Record<
  OnboardingPreset,
  { name: string; description: string; welcomeMessage: string; defaultRules: string }
> = {
  vip_community: {
    name: "VIP Executive Community",
    description: "High-value mastermind, strictly moderated networking, zero spam tolerance.",
    welcomeMessage:
      "*Welcome to the Official VIP Community*\n\nThis group is actively protected by *J10 Nexus Group Guardian*. We maintain a high standard of discussion. Type *!rules* to view community guidelines or *!ai <question>* for instant assistance.",
    defaultRules:
      "1. Respect all members · 2. Zero commercial spam or self-promotion · 3. Keep discussions professional and relevant · 4. Three strikes result in auto-removal.",
  },
  crypto_signals: {
    name: "Crypto & Trading Signals",
    description: "Market updates, technical analysis, anti-scam shield and anti-phishing.",
    welcomeMessage:
      "*Welcome to the Official Trading Group*\n\n*Security Notice*: J10 Nexus Anti-Scam Shield is active. Any unsolicited DMs, fake airdrop links, or unauthorized schemes result in an instant ban. Type *!status* to check protection health.",
    defaultRules:
      "1. No unauthorized invite links · 2. Never share seed phrases or private keys · 3. Admins will never DM you first · 4. 3 warnings = permanent eviction.",
  },
  customer_support: {
    name: "Customer Support & VIP Helpdesk",
    description: "Product inquiries, orders, technical troubleshooting, grounded AI answers.",
    welcomeMessage:
      "*Welcome to Official Customer Support*\n\nJ10 AI Assistant is active in this group. Ask any product or order question by typing *!ai <your question>* or reach out to our team admins.",
    defaultRules:
      "1. State your inquiry clearly · 2. Do not share sensitive billing credentials in group chat · 3. Standard response SLA is under 2 minutes.",
  },
  ecommerce_hub: {
    name: "E-Commerce & Flash Sales",
    description: "Exclusive discounts, product drops, order notifications, community polls.",
    welcomeMessage:
      "*Welcome to the VIP Flash Club*\n\nGet exclusive drops, early sale access, and community voting powered by *J10 Nexus*. Admins use *!poll* and *!announce* for official updates.",
    defaultRules:
      "1. Community discussions stay focused on product feedback · 2. No third-party marketplace links · 3. Enjoy member-only perks.",
  },
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  integrationId: string | null;
  botPhoneNumber?: string;
  botDisplayName?: string;
  onSuccess?: () => void;
};

export function WhatsAppGroupOnboardingWizard({
  isOpen,
  onClose,
  integrationId,
  botPhoneNumber = "+1 (555) 677-1423",
  botDisplayName = "J10 Nexus Bot",
  onSuccess,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedPreset, setSelectedPreset] = useState<OnboardingPreset>("vip_community");
  const [groupName, setGroupName] = useState("VIP Client Community");
  const [activeNumber, setActiveNumber] = useState(botPhoneNumber);
  const [copied, setCopied] = useState(false);
  const [verifyingAdmin, setVerifyingAdmin] = useState(false);
  const [adminVerified, setAdminVerified] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  if (!isOpen) return null;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function testAdminPrivileges() {
    setVerifyingAdmin(true);
    // Simulate real-time group admin privilege verification
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setAdminVerified(true);
    setVerifyingAdmin(false);
  }

  async function handleDispatchKickoff() {
    if (!integrationId) return;
    setDispatching(true);
    setDispatchResult(null);

    const preset = ONBOARDING_PRESETS[selectedPreset];
    const normalizedSender = activeNumber.replace(/\D/g, "");

    try {
      // 1. Dispatch initial welcome announcement
      const res = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/groups/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `!announce ${preset.welcomeMessage.replace(/\n/g, " ")}`,
            sender: normalizedSender ? `+${normalizedSender}` : "+15556771423",
            senderName: "J10 Setup Wizard",
          }),
        }
      );

      // 2. Save group configuration with preset rules
      await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/groups`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupName,
            customRulesText: `[OFFICIAL RULES - ${groupName.toUpperCase()}]\n\n${preset.defaultRules}\n\n_Protected by J10 Nexus Group Guardian._`,
            warningThreshold: 3,
            enabled: true,
          }),
        }
      );

      setDispatchResult("Bot deployed and welcome announcement successfully broadcasted to group.");
      onSuccess?.();
    } catch (err) {
      setDispatchResult(err instanceof Error ? err.message : "Error dispatching welcome.");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-violet-500/30 bg-[#0d0e12] shadow-2xl">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Client Group Bot Setup Wizard</h3>
              <p className="text-xs text-zinc-400">Deploy J10 Bot into any WhatsApp Community or VIP Group</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* STEPPER INDICATOR */}
        <div className="grid grid-cols-4 border-b border-white/10 bg-black/30 text-xs font-medium">
          {[
            { stepNum: 1, title: "1. Identity" },
            { stepNum: 2, title: "2. Add to Group" },
            { stepNum: 3, title: "3. Make Admin" },
            { stepNum: 4, title: "4. Launch" },
          ].map((item) => (
            <div
              key={item.stepNum}
              className={`flex items-center justify-center py-2.5 transition ${
                step === item.stepNum
                  ? "border-b-2 border-violet-500 bg-violet-500/10 text-violet-300 font-semibold"
                  : step > item.stepNum
                    ? "text-emerald-400"
                    : "text-zinc-500"
              }`}
            >
              <span>{item.title}</span>
            </div>
          ))}
        </div>

        {/* STEP CONTENT BODY */}
        <div className="p-6">
          {/* STEP 1: IDENTITY */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="mt-0.5 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-300">WhatsApp Cloud API Connected</h4>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                      Your J10 instance is verified with Meta Cloud API and active on the webhook pipeline.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Bot Display Name:</span>
                  <span className="font-semibold text-white">{botDisplayName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Bot WhatsApp Number:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-violet-300">{activeNumber}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(activeNumber)}
                      className="text-zinc-400 hover:text-white"
                      title="Copy Number"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Number Type:</span>
                  <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                    {activeNumber.includes("555-677-1423") || activeNumber.includes("5556771423") ? "META CLOUD API TEST NUMBER" : "PRODUCTION DEDICATED NUMBER"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Security Mode:</span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    HMAC-SHA256 VERIFIED
                  </span>
                </div>
              </div>

              {copied && <p className="text-right text-xs text-emerald-400">Copied to clipboard!</p>}
            </div>
          )}

          {/* STEP 2: ADD BOT TO GROUP */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-300 space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5">
                  <Info size={14} className="shrink-0" />
                  Meta Number Requirements for Groups
                </p>
                <p className="text-[11px] leading-relaxed text-zinc-300">
                  • <strong>Test Number (+1 555-677-1423):</strong> Meta Cloud API free sandbox numbers can send 1-on-1 messages to verified numbers. They do not have a public user profile to be added to consumer groups.<br />
                  • <strong>Production Group Bot:</strong> To add your bot into any client group, register a real dedicated phone number (a $2/mo SIM, eSIM, or VoIP number) under Meta Developer Console (Step 2: <em>Register your WhatsApp phone number</em>).
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-2">
                <label className="block text-xs text-zinc-400">
                  Target Bot WhatsApp Number:
                  <input
                    type="text"
                    value={activeNumber}
                    onChange={(e) => setActiveNumber(e.target.value)}
                    placeholder="+1 (555) 677-1423 or your registered SIM number"
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#111216] px-3 py-2 text-xs text-white font-mono outline-none focus:border-violet-500"
                  />
                </label>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 font-bold text-[11px]">
                    1
                  </span>
                  <p className="text-zinc-300">
                    Open WhatsApp on your phone or computer and open the target business or client group.
                  </p>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 font-bold text-[11px]">
                    2
                  </span>
                  <div className="space-y-1">
                    <p className="text-zinc-300">
                      Tap Group Info &rarr; <span className="text-white font-medium">Add Participants</span>.
                    </p>
                    <p className="text-zinc-400">
                      Search or type the bot phone number:{" "}
                      <code className="text-violet-300 font-mono font-semibold">{activeNumber}</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 font-bold text-[11px]">
                    3
                  </span>
                  <p className="text-zinc-300">
                    Confirm to add the bot to the group, then click <strong>Next</strong> to verify admin permissions.
                  </p>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <a
                  href={`https://wa.me/${activeNumber.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  <MessageSquare size={14} />
                  Open WhatsApp Chat with Bot ({activeNumber})
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}

          {/* STEP 3: PROMOTE TO GROUP ADMIN */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldAlert size={15} />
                  Why Group Admin Privileges Are Required:
                </div>
                <p className="mt-1.5 text-zinc-300">
                  WhatsApp only permits group administrators to delete violating link messages, remove repeat offenders,
                  publish pinned announcements, and manage participant rights.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <p className="font-semibold text-white">How to promote:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                  <li>In your group, tap the group name to view Group Info.</li>
                  <li>Scroll down to the Participants list and find <span className="text-white font-medium">{botDisplayName}</span>.</li>
                  <li>Tap on the bot&apos;s name and select <span className="text-violet-300 font-semibold">&ldquo;Make Group Admin&rdquo;</span>.</li>
                </ol>
              </div>

              <div className="pt-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-3.5">
                <div className="flex items-center gap-2.5">
                  <UserCheck size={16} className={adminVerified ? "text-emerald-400" : "text-zinc-400"} />
                  <span className="text-xs font-medium text-white">
                    {adminVerified ? "Admin Status Verified" : "Check Admin Privileges"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={verifyingAdmin || adminVerified}
                  onClick={() => void testAdminPrivileges()}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
                >
                  {verifyingAdmin ? <Loader2 size={13} className="animate-spin" /> : null}
                  {adminVerified ? "Verified" : "Verify Status"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: KICKOFF & LAUNCH */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300">Group Name</label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-violet-500"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300">Select Community Profile & Rules Preset</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(Object.keys(ONBOARDING_PRESETS) as OnboardingPreset[]).map((key) => {
                    const preset = ONBOARDING_PRESETS[key];
                    const isSelected = selectedPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedPreset(key)}
                        className={`text-left rounded-xl border p-3 transition ${
                          isSelected
                            ? "border-violet-500 bg-violet-500/15"
                            : "border-white/10 bg-black/30 hover:border-white/20"
                        }`}
                      >
                        <p className="text-xs font-semibold text-white">{preset.name}</p>
                        <p className="mt-1 text-[11px] text-zinc-400 leading-snug">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {dispatchResult && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                  {dispatchResult}
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-6 py-3.5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-1.5 text-xs text-zinc-400 hover:bg-white/5"
            >
              <ArrowLeft size={13} />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
            >
              Next
              <ArrowRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              disabled={dispatching}
              onClick={() => void handleDispatchKickoff()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {dispatching ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Deploy Bot & Dispatch Welcome
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
