"use client";

import Script from "next/script";
import { CheckCircle2, Loader2, MessageSquareText, AlertCircle } from "lucide-react";
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
  interface Window {
    FB?: FacebookSdk;
  }
}

export interface WhatsAppEmbeddedSignupProps {
  integrationId?: string | null;
  onConnected?: () => void;
  onSuccess?: () => void;
  onCancel?: () => void;
  standalone?: boolean;
}

export function WhatsAppEmbeddedSignup({
  integrationId,
  onConnected,
  onSuccess,
  onCancel,
  standalone = false,
}: WhatsAppEmbeddedSignupProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [success, setSuccess] = useState(false);

  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<SignupSession | null>(null);
  const stateTokenRef = useRef<string | null>(null);
  const submittedRef = useRef(false);

  const finish = useCallback(async () => {
    if (!codeRef.current || !sessionRef.current || submittedRef.current) return;
    submittedRef.current = true;
    setIsError(false);

    try {
      // Connect endpoint accepts code, state, wabaId, phoneNumberId
      const connectUrl = integrationId
        ? `/api/integrations/${integrationId}/whatsapp/embedded-signup`
        : `/api/integrations/whatsapp/connect`;

      const response = await fetch(connectUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeRef.current,
          state: stateTokenRef.current || undefined,
          ...sessionRef.current,
        }),
      });

      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        phone?: { displayPhoneNumber?: string };
        account?: { displayPhoneNumber?: string };
      };

      if (!response.ok || !body.success) {
        throw new Error(body.error ?? "WhatsApp connection could not be completed.");
      }

      setSuccess(true);
      const displayPhone =
        body.phone?.displayPhoneNumber || body.account?.displayPhoneNumber;
      setMessage(
        displayPhone
          ? `${displayPhone} is connected and ready for AI automation.`
          : "WhatsApp Business Account is connected."
      );
      onConnected?.();
      onSuccess?.();
    } catch (error: any) {
      submittedRef.current = false;
      setIsError(true);
      setMessage(error?.message || "WhatsApp connection could not be completed.");
    } finally {
      setWorking(false);
    }
  }, [integrationId, onConnected, onSuccess]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) {
        return;
      }

      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }

      if (!data || typeof data !== "object") return;
      const payload = data as {
        type?: string;
        event?: string;
        data?: {
          waba_id?: string;
          phone_number_id?: string;
          error_message?: string;
        };
      };

      if (payload.type !== "WA_EMBEDDED_SIGNUP") return;

      if (
        payload.event === "FINISH" &&
        payload.data?.waba_id &&
        payload.data?.phone_number_id
      ) {
        sessionRef.current = {
          wabaId: payload.data.waba_id,
          phoneNumberId: payload.data.phone_number_id,
        };
        void finish();
      } else if (payload.event === "ERROR") {
        setWorking(false);
        setIsError(true);
        setMessage(
          payload.data?.error_message ??
            "Meta could not complete WhatsApp onboarding."
        );
      } else if (payload.event === "CANCEL") {
        setWorking(false);
        setIsError(false);
        setMessage("WhatsApp onboarding was cancelled by the user.");
        onCancel?.();
      }
    };

    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [finish, onCancel]);

  const connect = async () => {
    codeRef.current = null;
    sessionRef.current = null;
    submittedRef.current = false;
    setMessage(null);
    setIsError(false);
    setSuccess(false);
    setWorking(true);

    try {
      // 1. Fetch CSRF state token from server
      const sessionRes = await fetch("/api/integrations/whatsapp/session", {
        method: "POST",
      });

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        stateTokenRef.current = sessionData.state || null;
      }
    } catch {
      // Allow continuation in offline/mock test environments
    }

    if (!window.FB) {
      setWorking(false);
      setIsError(true);
      setMessage(
        "Meta SDK is not loaded. Please check your browser connection or disable ad-blockers."
      );
      return;
    }

    // Launch Meta Embedded Signup
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setWorking(false);
          setMessage("Meta sign-in did not return authorization. Please try again.");
          return;
        }
        codeRef.current = code;
        void finish();
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      }
    );
  };

  return (
    <div
      className={
        standalone
          ? "rounded-2xl border border-emerald-500/20 bg-[#111216] p-6"
          : "p-1"
      }
    >
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.FB?.init({
            appId: META_APP_ID,
            cookie: true,
            xfbml: true,
            version: "v21.0",
          });
          setSdkReady(Boolean(window.FB));
        }}
      />

      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            OFFICIAL META EMBEDDED SIGNUP
          </p>
          <h2 className="mt-1.5 text-base font-semibold text-white">
            Connect WhatsApp Business
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">
            Authenticate directly through Meta to connect your WhatsApp Business Account.
            Your phone number remains active while J10 NEXUS powers 24/7 AI Receptionist automations.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void connect()}
          disabled={working}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 shadow-lg shadow-emerald-500/20"
        >
          {working ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <MessageSquareText size={15} />
          )}
          {working ? "Connecting to Meta..." : "Launch WhatsApp Signup"}
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${
            success
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : isError
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}
        >
          {success ? (
            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle size={15} className="shrink-0" />
          )}
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
