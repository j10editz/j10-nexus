"use client";

import { useEffect, useMemo, useState } from "react";

export function TrialCountdown({ endsAt, serverNow, status }: { endsAt: string | null; serverNow: string; status: string | null }) {
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(endsAt || 0).getTime() - (Date.now() + offset)));
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, new Date(endsAt || 0).getTime() - (Date.now() + offset)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, offset]);
  if (status === "expired") {
    return <div className="mx-auto mb-4 max-w-6xl rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">Your 72-hour trial has ended. This workspace is read-only. <a className="font-semibold underline" href="/dashboard/settings">Upgrade to resume AI, automations, messages, and lead processing.</a></div>;
  }
  if (!endsAt || status !== "active") return null;
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return <div className="mx-auto mb-4 max-w-6xl rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">72-hour trial: <strong>{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong> remaining. WhatsApp is an <strong>interactive demo</strong> during the trial; no live WhatsApp sender is connected.</div>;
}
