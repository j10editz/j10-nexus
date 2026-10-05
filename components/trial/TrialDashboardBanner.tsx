"use client";

import { useTrial } from "./TrialContext";
import { TrialCountdown } from "./TrialCountdown";

export function TrialDashboardBanner() {
  const trial = useTrial();

  // If still loading initial trial state, do not flicker
  if (trial.isLoading) {
    return null;
  }

  // Only display banner if workspace is on trial (or trial has expired)
  if (!trial.trialEndsAt && trial.status !== "expired") {
    return null;
  }

  return (
    <TrialCountdown
      endsAt={trial.trialEndsAt}
      status={trial.status}
      serverNow={trial.serverNow}
    />
  );
}
