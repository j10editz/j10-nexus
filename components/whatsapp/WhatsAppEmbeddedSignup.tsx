"use client";

import Script from "next/script";
import { CheckCircle2, Loader2, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "1830547288111074";
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID ?? "28294076036901722";

type SignupSession = { wabaId: string; phoneNumberId: string };
type FacebookLoginResponse = { authResponse?: { code?: string }; status?: string };
type FacebookSdk = {
  init(options: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
  login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void;
};

declare global {
  interface Window { FB?: FacebookSdk; }
}

export function WhatsAppEmbeddedSignup({ integrationId, onConnected }: {
  integrationId: string | null;
  onConnected?: () => void;
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<SignupSession | null>(null);
  const submittedRef = useRef(false);

  const finish = useCallback(async () => {
    if (!integrationId || !codeRef.current || !sessionRef.current || submittedRef.current) return;
    submittedRef.current = true;
    try {
      const response = await fetch(`/api/integrations/${integrationId}/whatsapp/embedded-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeRef.current, ...sessionRef.current }),
      });
      const body = await response.json() as { success?: boolean; error?: string; phone?: { displayPhoneNumber?: string } };
      if (!response.ok || !body.success) throw new Error(body.error ?? "WhatsApp connection could not be completed.");
      setSuccess(true);
      setMessage(body.phone?.displayPhoneNumber ? `${body.phone.displayPhoneNumber} is connected.` : "WhatsApp Business is connected.");
      onConnected?.();
    } catch (error) {
      submittedRef.current = false;
      setMessage(error instanceof Error ? error.message : "WhatsApp connection could not be completed.");
    } finally {
      setWorking(false);
    }
  }, [integrationId, onConnected]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== "object") return;
      const payload = data as { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string; error_message?: string } };
      if (payload.type !== "WA_EMBEDDED_SIGNUP") return;
      if (payload.event === "FINISH" && payload.data?.waba_id && payload.data?.phone_number_id) {
        sessionRef.current = { wabaId: payload.data.waba_id, phoneNumberId: payload.data.phone_number_id };
        void finish();
      } else if (payload.event === "ERROR") {
        setWorking(false);
        setMessage(payload.data?.error_message ?? "Meta could not complete WhatsApp onboarding.");
      } else if (payload.event === "CANCEL") {
        setWorking(false);
        setMessage("WhatsApp onboarding was cancelled. Nothing was changed.");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [finish]);

  const connect = () => {
    if (!integrationId || !window.FB) return;
    codeRef.current = null;
    sessionRef.current = null;
    submittedRef.current = false;
    setMessage(null);
    setSuccess(false);
    setWorking(true);
    window.FB.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setWorking(false);
        setMessage("Meta sign-in did not return authorization. Please try again.");
        return;
      }
      codeRef.current = code;
      void finish();
    }, {
      config_id: META_CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
    });
  };

  return (
    <section className="mt-6 rounded-2xl border border-emerald-500/20 bg-[#111216] p-6">
      <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" onLoad={() => {
        window.FB?.init({ appId: META_APP_ID, cookie: true, xfbml: true, version: "v26.0" });
        setSdkReady(Boolean(window.FB));
      }} />
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">OFFICIAL META COEXISTENCE</p>
          <h2 className="mt-2 text-lg font-semibold">Connect your existing WhatsApp Business number</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">A client signs in with Meta, selects their business and number, and keeps using the WhatsApp Business mobile app while J10 automates approved conversations.</p>
        </div>
        <button type="button" onClick={connect} disabled={!integrationId || !sdkReady || working} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
          {working ? <Loader2 size={16} className="animate-spin" /> : <MessageSquareText size={16} />}
          {working ? "Connecting..." : "Connect existing number"}
        </button>
      </div>
      {message && <div className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${success ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>{success && <CheckCircle2 size={16} />}{message}</div>}
    </section>
  );
}
