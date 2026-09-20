"use client";

import { useEffect, useState } from "react";
import { TrialCountdown } from "./TrialCountdown";

type Trial = { trial_ends_at: string | null; trial_status: string | null; provenance: string | null };

export function TrialDashboardBanner() {
  const [state, setState] = useState<{ trial: Trial; serverNow: string } | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/onboarding/outcome", { credentials: "same-origin" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (active && data?.trial && data.trial.provenance === "trial") setState(data); });
    return () => { active = false; };
  }, []);
  if (!state) return null;
  return <TrialCountdown endsAt={state.trial.trial_ends_at} status={state.trial.trial_status} serverNow={state.serverNow} />;
}
