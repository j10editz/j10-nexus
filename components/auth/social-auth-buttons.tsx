"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { getCanonicalOrigin } from "@/lib/auth/origin";
import { sanitizeAuthError } from "@/lib/auth/errors";

interface SocialAuthButtonsProps {
  providers: {
    google: boolean;
    apple: boolean;
  };
  nextUrl?: string;
  mode: "signin" | "signup";
  disabled?: boolean;
  onError: (errorMessage: string) => void;
  onLoadingChange?: (loading: boolean) => void;
}

import {
  resolveOAuthCallbackUrl,
  setClientOAuthIntentCookie,
} from "@/lib/auth/oauth";

export interface InitiateOAuthSignInResult {
  success: boolean;
  authorizationUrl?: string;
  redirectTo?: string;
  provider: "google" | "apple";
}

export interface InitiateOAuthSignInParams {
  supabase: any;
  provider: "google" | "apple";
  origin?: string;
  nextUrl?: string;
  mode: "signin" | "signup";
  disabled?: boolean;
  submittingProvider?: "google" | "apple" | null;
  onError: (errorMessage: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  setSubmittingProvider?: (provider: "google" | "apple" | null) => void;
}

export async function initiateOAuthSignIn({
  supabase,
  provider,
  origin,
  nextUrl,
  mode,
  disabled = false,
  submittingProvider = null,
  onError,
  onLoadingChange,
  setSubmittingProvider,
}: InitiateOAuthSignInParams): Promise<InitiateOAuthSignInResult> {
  if (disabled || submittingProvider) {
    return { success: false, provider }; // Prevent duplicate submissions
  }

  setSubmittingProvider?.(provider);
  onLoadingChange?.(true);
  onError("");

  try {
    const resolvedOrigin =
      origin ||
      (typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : getCanonicalOrigin());

    const safeNext = getSafeRedirectUrl(nextUrl, "/dashboard");
    const callbackUrl = resolveOAuthCallbackUrl(resolvedOrigin, safeNext);

    setClientOAuthIntentCookie(safeNext);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      onError(sanitizeAuthError(error, mode));
      setSubmittingProvider?.(null);
      onLoadingChange?.(false);
      return { success: false, provider, redirectTo: callbackUrl };
    }

    return {
      success: true,
      provider,
      authorizationUrl: data?.url,
      redirectTo: callbackUrl,
    };
  } catch {
    onError("Authentication could not be initiated. Please try again or use email.");
    setSubmittingProvider?.(null);
    onLoadingChange?.(false);
    return { success: false, provider };
  }
}

export function SocialAuthButtons({
  providers,
  nextUrl,
  mode,
  disabled = false,
  onError,
  onLoadingChange,
}: SocialAuthButtonsProps) {
  const [submittingProvider, setSubmittingProvider] = useState<"google" | "apple" | null>(null);
  const supabase = createClient();

  const hasAnyProvider = providers.google || providers.apple;

  // Truthful Provider Display: If neither provider is actively configured, render nothing
  if (!hasAnyProvider) {
    return null;
  }

  async function handleOAuthSignIn(provider: "google" | "apple") {
    await initiateOAuthSignIn({
      supabase,
      provider,
      nextUrl,
      mode,
      disabled,
      submittingProvider,
      onError,
      onLoadingChange,
      setSubmittingProvider,
    });
  }

  const isBusy = Boolean(submittingProvider) || disabled;

  return (
    <div className="space-y-3">
      {providers.google && (
        <button
          type="button"
          onClick={() => handleOAuthSignIn("google")}
          disabled={isBusy}
          aria-label={
            submittingProvider === "google"
              ? "Connecting to Google..."
              : mode === "signin"
              ? "Continue with Google"
              : "Sign up with Google"
          }
          aria-busy={submittingProvider === "google"}
          className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold text-white transition hover:bg-white/[0.08] hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-[#0b0f17] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submittingProvider === "google" ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>Connecting to Google...</span>
            </span>
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
                className="shrink-0"
              >
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>{mode === "signin" ? "Continue with Google" : "Sign up with Google"}</span>
            </>
          )}
        </button>
      )}

      {providers.apple && (
        <button
          type="button"
          onClick={() => handleOAuthSignIn("apple")}
          disabled={isBusy}
          aria-label={
            submittingProvider === "apple"
              ? "Connecting to Apple..."
              : mode === "signin"
              ? "Continue with Apple"
              : "Sign up with Apple"
          }
          aria-busy={submittingProvider === "apple"}
          className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold text-white transition hover:bg-white/[0.08] hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-[#0b0f17] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submittingProvider === "apple" ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>Connecting to Apple...</span>
            </span>
          ) : (
            <>
              <svg
                viewBox="0 0 170 170"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.03-7.61-7.7-11.73-14.01-6.19-9.5-11.05-20.2-14.58-32.09-3.53-11.89-5.3-23.2-5.3-33.94 0-14.61 3.75-26.65 11.24-36.12 7.49-9.47 16.79-14.31 27.9-14.52 4.7 0 9.87 1.25 15.51 3.76 5.64 2.5 9.4 3.76 11.28 3.76 1.68 0 5.66-1.31 11.95-3.93 6.29-2.62 11.66-3.83 16.12-3.62 12.39.63 22.37 5.25 29.93 13.87-10.87 6.6-16.19 15.68-15.96 27.24.23 9.04 3.71 16.59 10.45 22.65 6.74 6.06 14.86 9.58 24.36 10.57-2.12 6.53-4.7 13.06-7.75 19.59zM119.22 31.81c0-7.08 2.57-13.78 7.71-20.1 5.14-6.32 11.46-10.49 18.96-12.51.52 1.46.78 3.03.78 4.71 0 7.08-2.63 13.84-7.89 20.28-5.26 6.44-11.75 10.6-19.46 12.49-.07-1.46-.1-3.08-.1-4.87z" />
              </svg>
              <span>{mode === "signin" ? "Continue with Apple" : "Sign up with Apple"}</span>
            </>
          )}
        </button>
      )}

      {/* Divider */}
      <div className="relative py-2 flex items-center justify-center">
        <div className="w-full border-t border-white/[0.08]" />
        <span className="absolute bg-[#121824] px-3 text-[11px] font-medium text-[#5f697d] uppercase tracking-wider">
          or continue with email
        </span>
      </div>
    </div>
  );
}
