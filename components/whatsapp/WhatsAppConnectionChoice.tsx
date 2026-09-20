"use client";

import { useRef, useState } from "react";

import { WhatsAppEmbeddedSignup } from "@/components/whatsapp/WhatsAppEmbeddedSignup";

type WhatsAppConnectionChoice = "meta" | "360dialog";
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
  const [choice, setChoice] = useState<WhatsAppConnectionChoice>("meta");
  const [mode, setMode] = useState<Dialog360Mode>("sandbox");
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Dialog360Result | null>(null);
  const submissionInFlight = useRef(false);

  function selectChoice(nextChoice: WhatsAppConnectionChoice) {
    setChoice(nextChoice);
    setMessage(null);
    setResult(null);
    // A key is never retained while a user navigates away from 360dialog.
    if (nextChoice !== "360dialog") setApiKey("");
  }

  async function connect360Dialog() {
    if (submissionInFlight.current || !apiKey.trim()) return;

    submissionInFlight.current = true;
    setConnecting(true);
    setMessage(null);
    const submittedApiKey = apiKey;
    // Clear React state before sending; the transient local variable exists
    // only for this one request and is never rendered, logged, or persisted.
    setApiKey("");

    try {
      const response = await fetch("/api/integrations/whatsapp/360dialog/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, apiKey: submittedApiKey }),
      });
      const payload = await response.json().catch(() => null) as {
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

  if (choice === "meta") {
    return (
      <div className="space-y-5">
        <ConnectionMethodSelector choice={choice} onSelect={selectChoice} />
        <WhatsAppEmbeddedSignup
          onSuccess={props.onMetaSuccess}
          onCancel={props.onCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ConnectionMethodSelector choice={choice} onSelect={selectChoice} />

      <div className="rounded-xl border border-white/[0.1] bg-black/20 p-4">
        <h3 className="text-sm font-semibold text-white">Connect 360dialog</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/55">
          The API key is sent only to J10&apos;s authenticated server, encrypted in the credential vault, and cleared from this form immediately.
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

      <button
        type="button"
        onClick={props.onCancel}
        className="w-full text-xs text-white/45 hover:text-white/75"
      >
        Cancel
      </button>
    </div>
  );
}

function ConnectionMethodSelector(props: {
  choice: WhatsAppConnectionChoice;
  onSelect: (choice: WhatsAppConnectionChoice) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] p-1">
      <button
        type="button"
        onClick={() => props.onSelect("meta")}
        className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${props.choice === "meta" ? "bg-[#25D366] text-black" : "text-white/60 hover:bg-white/[0.06]"}`}
      >
        Meta Cloud / Embedded Signup
      </button>
      <button
        type="button"
        onClick={() => props.onSelect("360dialog")}
        className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${props.choice === "360dialog" ? "bg-[#25D366] text-black" : "text-white/60 hover:bg-white/[0.06]"}`}
      >
        360dialog
      </button>
    </div>
  );
}
