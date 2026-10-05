"use client";

import { useRef, useState } from "react";
import {
  Smartphone,
  Cloud,
  Plus,
  ArrowRight,
  ChevronLeft,
  CheckCircle2,
  Lock,
  Sparkles,
  Info,
  HelpCircle,
  Hash,
  Play,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Volume2,
} from "lucide-react";
import { WhatsAppEmbeddedSignup } from "@/components/whatsapp/WhatsAppEmbeddedSignup";

type WhatsAppSetupStep =
  | "choose_type" // Screen 1: Get a number vs Use my own number
  | "choose_app" // Screen 2: Where is your number now (Business app coexistence vs Another provider / API)
  | "video_guide" // Screen 3: Watch before you continue
  | "embedded_flow" // Meta popup execution
  | "api_flow" // 360dialog / Cloud API manual key entry
  | "provision_flow"; // Get dedicated number

type Dialog360Mode = "sandbox" | "production";

interface Dialog360Result {
  provider: "360dialog";
  mode: Dialog360Mode;
  status: "connected";
  credentialState: "configured";
  readyForTest: true;
}

export function WhatsAppConnectionChoice(props: {
  onMetaSuccess: () => void;
  onDialog360Connected: () => void;
  onCancel: () => void;
}) {
  const [currentStep, setCurrentStep] = useState<WhatsAppSetupStep>("choose_type");
  const [selectedOwnNumberOption, setSelectedOwnNumberOption] = useState<"coexistence" | "api">("coexistence");
  const [showCoexistenceDetails, setShowCoexistenceDetails] = useState(false);
  const [showApiDetails, setShowApiDetails] = useState(false);
  const [watchedVideo, setWatchedVideo] = useState(false);
  const [showStepByStepGuide, setShowStepByStepGuide] = useState(false);
  const [isPlayingVideoSim, setIsPlayingVideoSim] = useState(false);

  // 360dialog state
  const [apiProvider, setApiProvider] = useState<"meta_cloud" | "360dialog">("360dialog");
  const [mode, setMode] = useState<Dialog360Mode>("sandbox");
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Dialog360Result | null>(null);
  const submissionInFlight = useRef(false);

  async function connect360Dialog() {
    if (submissionInFlight.current || !apiKey.trim()) return;

    submissionInFlight.current = true;
    setConnecting(true);
    setMessage(null);
    const submittedApiKey = apiKey;
    setApiKey("");

    try {
      const response = await fetch("/api/integrations/whatsapp/360dialog/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, apiKey: submittedApiKey }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        connection?: Dialog360Result;
      } | null;

      if (!response.ok || !payload?.success || !payload.connection) {
        setMessage(payload?.error || "360dialog could not be connected.");
        return;
      }

      setResult(payload.connection);
      props.onDialog360Connected();
    } catch {
      setMessage("360dialog could not be connected.");
    } finally {
      setApiKey("");
      setConnecting(false);
      submissionInFlight.current = false;
    }
  }

  // SCREEN 1: Choose how to set up your number (Zernio Reference Match)
  if (currentStep === "choose_type") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Smartphone className="text-[#25D366]" size={18} />
            Connect WhatsApp
          </h3>
          <p className="text-xs text-white/60 mt-0.5">Choose how to set up your number</p>
        </div>

        <div className="space-y-3">
          {/* Option 1: Get a number */}
          <button
            type="button"
            onClick={() => setCurrentStep("provision_flow")}
            className="w-full text-left rounded-2xl border border-white/[0.08] bg-[#14121a] p-4 transition-all hover:border-[#d7b35c]/50 hover:bg-[#191522] group"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-white/70 group-hover:border-[#d7b35c]/40 group-hover:text-[#d7b35c] transition">
                <Plus size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-semibold text-white group-hover:text-[#d7b35c] transition">
                    Get a number
                  </strong>
                  <span className="rounded bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                    Add-on
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-white/55">
                  From $3/mo. Pick a country, we handle setup.
                </p>
              </div>
            </div>
          </button>

          {/* Option 2: Use my own number */}
          <button
            type="button"
            onClick={() => setCurrentStep("choose_app")}
            className="w-full text-left rounded-2xl border border-emerald-500/30 bg-[#14121a] p-4 transition-all hover:border-[#25D366] hover:bg-[#191522] group shadow-lg shadow-emerald-950/20"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[#25D366] group-hover:scale-105 transition">
                <Hash size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-semibold text-white group-hover:text-emerald-400 transition">
                    Use my own number
                  </strong>
                  <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Popular
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-white/55">
                  Bring your existing phone number. Requires verification during setup.
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={props.onCancel}
            className="text-xs text-white/45 hover:text-white/75"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // SCREEN 2: Where is your number now? (Zernio Reference Match)
  if (currentStep === "choose_app") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <button
            type="button"
            onClick={() => setCurrentStep("choose_type")}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
          >
            <ChevronLeft size={14} />
            <span>Back</span>
          </button>
          <span className="text-xs font-semibold text-white/50">Step 2 of 3</span>
        </div>

        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Smartphone className="text-[#25D366]" size={18} />
            Connect WhatsApp
          </h3>
          <p className="text-xs text-white/60 mt-0.5">Where is your number now?</p>
        </div>

        <div className="space-y-3">
          {/* Choice A: I chat from the WhatsApp Business app (Coexistence) */}
          <div
            onClick={() => setSelectedOwnNumberOption("coexistence")}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              selectedOwnNumberOption === "coexistence"
                ? "border-[#25D366] bg-[#171b1e] shadow-lg shadow-emerald-950/30"
                : "border-white/[0.08] bg-[#14121a] hover:border-white/20"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-white/80">
                <Smartphone size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-semibold text-white">
                    I chat from the WhatsApp Business app
                  </strong>
                  <span className="rounded-full bg-white/[0.08] border border-white/[0.1] px-2 py-0.5 text-[9px] font-semibold text-white/80">
                    Coexistence
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/60 leading-relaxed">
                  Keep the app on your phone working exactly as it does. We connect alongside it, so nothing changes for you or your customers.
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCoexistenceDetails(!showCoexistenceDetails);
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#25D366] hover:underline"
                >
                  <span>Learn more</span>
                  {showCoexistenceDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showCoexistenceDetails && (
                  <div className="mt-2 rounded-xl bg-black/40 border border-white/[0.06] p-3 text-[11px] text-white/70 leading-relaxed space-y-1">
                    <p>• Your phone app continues receiving customer messages exactly as usual.</p>
                    <p>• J10 answers incoming leads automatically 24/7 with your AI Receptionist.</p>
                    <p>• You can jump into any live chat on your phone whenever you want.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Choice B: It's with another provider or on the API */}
          <div
            onClick={() => setSelectedOwnNumberOption("api")}
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              selectedOwnNumberOption === "api"
                ? "border-blue-500 bg-[#131622] shadow-lg shadow-blue-950/30"
                : "border-white/[0.08] bg-[#14121a] hover:border-white/20"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-white/80">
                <Cloud size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <strong className="text-sm font-semibold text-white">
                  It&apos;s with another provider or on the API
                </strong>
                <p className="mt-1 text-xs text-white/60 leading-relaxed">
                  Already on the WhatsApp Business API (Twilio, 360dialog, your own Meta setup...). We take over as the provider; your number and templates come with you.
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowApiDetails(!showApiDetails);
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:underline"
                >
                  <span>Learn more</span>
                  {showApiDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showApiDetails && (
                  <div className="mt-2 rounded-xl bg-black/40 border border-white/[0.06] p-3 text-[11px] text-white/70 leading-relaxed space-y-1">
                    <p>• Supports direct 360dialog API key encryption or official Meta WABA migration.</p>
                    <p>• Preserves verified business badge, pre-approved message templates, and display names.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Subtext */}
        <p className="text-[11px] text-white/50 leading-relaxed">
          Using the regular WhatsApp app? Switch the number to the free WhatsApp Business app first, then pick the first option.
        </p>

        {/* Next Button */}
        <div className="pt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={props.onCancel}
            className="text-xs text-white/45 hover:text-white/75"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedOwnNumberOption === "coexistence") {
                setCurrentStep("video_guide");
              } else {
                setCurrentStep("api_flow");
              }
            }}
            className="rounded-xl bg-[#25D366] px-6 py-2.5 text-xs font-bold text-black shadow-lg shadow-emerald-950/30 transition hover:bg-[#34e275]"
          >
            Next
          </button>
        </div>
      </div>
    );
  }

  // SCREEN 3: Watch before you continue (Zernio Reference Match)
  if (currentStep === "video_guide") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <button
            type="button"
            onClick={() => setCurrentStep("choose_app")}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
          >
            <ChevronLeft size={14} />
            <span>Back</span>
          </button>
          <span className="text-xs font-semibold text-white/50">Step 3 of 3</span>
        </div>

        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Smartphone className="text-[#25D366]" size={18} />
            Connect WhatsApp
          </h3>
          <p className="text-xs text-[#d7b35c] font-medium mt-0.5">Watch before you continue</p>
        </div>

        <p className="text-xs text-white/70 leading-relaxed">
          This 2-minute walkthrough shows you exactly what Meta&apos;s popup will ask: logging in with Facebook, typing in the number from your WhatsApp Business app, and scanning a QR code with your phone. Watch it once and the setup will feel familiar.
        </p>

        {/* Video / Visual Walkthrough Card */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0c0d12] shadow-2xl">
          <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-[#1a2035] via-[#101420] to-[#0a0c10] flex flex-col justify-between p-4">
            {/* Top Bar Controls */}
            <div className="flex items-center justify-between z-10">
              <span className="rounded bg-black/60 border border-white/10 px-2 py-0.5 text-[10px] font-mono text-white/80">
                2x ▾
              </span>
              <button
                type="button"
                onClick={() => setIsPlayingVideoSim(!isPlayingVideoSim)}
                className="rounded bg-black/60 border border-white/10 p-1 text-white/70 hover:text-white"
              >
                <Maximize2 size={13} />
              </button>
            </div>

            {/* Central Graphic / Mockup Preview */}
            <div className="my-auto flex flex-col items-center justify-center text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366]/20 border border-[#25D366]/40 text-[#25D366] shadow-xl shadow-emerald-950/40 mb-3">
                <Play size={24} className="ml-1" />
              </div>
              <strong className="text-sm font-bold text-white">Meta Coexistence Onboarding Preview</strong>
              <p className="text-[11px] text-white/60 mt-1 max-w-xs">
                Log in with Facebook → Select Business Portfolio → Verify WhatsApp SMS Code
              </p>
            </div>

            {/* Bottom Player Controls */}
            <div className="z-10 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 px-3 py-2 flex items-center justify-between text-[11px] text-white/80">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlayingVideoSim(!isPlayingVideoSim)}
                  className="text-white hover:text-[#25D366]"
                >
                  <Play size={14} className="fill-current" />
                </button>
                <span className="font-mono text-[10px] text-white/70">0:00 / 1:53</span>
              </div>
              <div className="flex items-center gap-2">
                <Volume2 size={14} className="text-white/60" />
              </div>
            </div>
          </div>
        </div>

        {/* Checkbox Acknowledgment */}
        <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-white/[0.08] bg-[#14121a] p-3 text-xs text-white/80 hover:bg-[#191522]">
          <input
            type="checkbox"
            checked={watchedVideo}
            onChange={(e) => setWatchedVideo(e.target.checked)}
            className="mt-0.5 rounded border-white/20 bg-white/10 text-emerald-500 focus:ring-0"
          />
          <span className="leading-snug">
            I&apos;ve reviewed the guide and understand how the Meta setup popup works.
          </span>
        </label>

        {/* Step-by-step accordion if requested */}
        {showStepByStepGuide && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-xs space-y-2.5">
            <h5 className="font-bold text-emerald-300">Quick 3-Step Setup Checklist:</h5>
            <ol className="space-y-2 text-white/75">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">1</span>
                <span>Click &quot;Continue to WhatsApp setup&quot; to launch the official Meta popup.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">2</span>
                <span>Log into Facebook, select your business, and enter your WhatsApp phone number.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">3</span>
                <span>Enter the 6-digit verification code sent via SMS. J10 is instantly connected!</span>
              </li>
            </ol>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={() => setCurrentStep("embedded_flow")}
            className="w-full rounded-xl bg-[#25D366] py-3 text-xs font-bold text-black shadow-lg shadow-emerald-950/40 transition hover:bg-[#34e275]"
          >
            Continue to WhatsApp setup
          </button>

          <button
            type="button"
            onClick={() => setShowStepByStepGuide(!showStepByStepGuide)}
            className="w-full rounded-xl border border-white/[0.12] bg-white/[0.03] py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.08] hover:text-white"
          >
            {showStepByStepGuide ? "Hide step by step guide" : "I want to be guided step by step"}
          </button>
        </div>
      </div>
    );
  }

  // SCREEN 4: Meta Embedded Signup Execution
  if (currentStep === "embedded_flow") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <button
            type="button"
            onClick={() => setCurrentStep("video_guide")}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
          >
            <ChevronLeft size={14} />
            <span>Back</span>
          </button>
          <span className="text-xs font-semibold text-[#25D366]">Meta Cloud API</span>
        </div>

        <WhatsAppEmbeddedSignup
          onSuccess={props.onMetaSuccess}
          onCancel={() => setCurrentStep("video_guide")}
        />
      </div>
    );
  }

  // SCREEN 5: API / 360dialog Custom Setup
  if (currentStep === "api_flow") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <button
            type="button"
            onClick={() => setCurrentStep("choose_app")}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
          >
            <ChevronLeft size={14} />
            <span>Back</span>
          </button>
          <span className="text-xs font-semibold text-blue-400">API Provider Setup</span>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] p-1 text-xs">
          <button
            type="button"
            onClick={() => setApiProvider("meta_cloud")}
            className={`rounded-lg px-3 py-2 font-semibold transition ${
              apiProvider === "meta_cloud" ? "bg-[#25D366] text-black" : "text-white/60 hover:bg-white/[0.06]"
            }`}
          >
            Meta Cloud / Embedded Signup
          </button>
          <button
            type="button"
            onClick={() => setApiProvider("360dialog")}
            className={`rounded-lg px-3 py-2 font-semibold transition ${
              apiProvider === "360dialog" ? "bg-[#25D366] text-black" : "text-white/60 hover:bg-white/[0.06]"
            }`}
          >
            360dialog API
          </button>
        </div>

        {apiProvider === "meta_cloud" ? (
          <WhatsAppEmbeddedSignup
            onSuccess={props.onMetaSuccess}
            onCancel={() => setCurrentStep("choose_app")}
          />
        ) : (
          <div className="rounded-xl border border-white/[0.1] bg-black/20 p-4">
            <h4 className="text-sm font-semibold text-white">Connect 360dialog</h4>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              The API key is encrypted in J10&apos;s credential vault and cleared from the browser immediately.
            </p>

            {result ? (
              <div className="mt-4 space-y-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs">
                <p className="font-semibold text-emerald-200">Ready for test</p>
                <p className="text-white/75">Provider: {result.provider}</p>
                <p className="text-white/75">Mode: {result.mode === "sandbox" ? "Sandbox" : "Production"}</p>
                <p className="text-white/75">Connection status: connected</p>
                <p className="text-white/75">Credential state: configured ••••••••</p>
              </div>
            ) : (
              <>
                <label className="mt-4 block text-xs font-medium text-white/70" htmlFor="dialog360-mode">
                  Mode
                </label>
                <select
                  id="dialog360-mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as Dialog360Mode)}
                  disabled={connecting}
                  className="mt-1 w-full rounded-lg border border-white/[0.12] bg-[#151821] px-3 py-2 text-sm text-white"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>

                <label className="mt-4 block text-xs font-medium text-white/70" htmlFor="dialog360-api-key">
                  360dialog API key
                </label>
                <input
                  id="dialog360-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={connecting}
                  className="mt-1 w-full rounded-lg border border-white/[0.12] bg-[#151821] px-3 py-2 text-sm text-white"
                  placeholder="Paste API key"
                />

                {message && <p role="alert" className="mt-3 text-xs text-rose-300">{message}</p>}

                <button
                  type="button"
                  onClick={() => void connect360Dialog()}
                  disabled={connecting || !apiKey.trim()}
                  className="mt-4 w-full rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#4ee687] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connecting ? "Connecting…" : "Connect 360dialog"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // SCREEN 6: Provision Flow
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#14121a] p-5 text-center space-y-4">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 text-left">
        <button
          type="button"
          onClick={() => setCurrentStep("choose_type")}
          className="flex items-center gap-1 text-xs text-white/60 hover:text-white"
        >
          <ChevronLeft size={14} />
          <span>Back</span>
        </button>
        <span className="text-xs font-semibold text-purple-400">Dedicated Number Add-on</span>
      </div>

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/10 text-purple-300 mx-auto">
        <Sparkles size={22} />
      </div>
      <div>
        <h4 className="text-base font-bold text-white">Dedicated WhatsApp Numbers</h4>
        <p className="mt-1 text-xs text-white/60 max-w-sm mx-auto">
          We provide clean, dedicated business numbers for US, UK, EU, and 40+ countries directly inside your J10 workspace.
        </p>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-white/70 text-left space-y-1.5">
        <div className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-400" /><span>Instant automated provisioning</span></div>
        <div className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-400" /><span>Included in Growth and Business plans</span></div>
        <div className="flex items-center gap-2"><CheckCircle2 size={13} className="text-emerald-400" /><span>No physical SIM or second device needed</span></div>
      </div>
      <button
        type="button"
        onClick={() => setCurrentStep("choose_app")}
        className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg transition hover:brightness-110"
      >
        Continue with Existing Number First
      </button>
    </div>
  );
}
