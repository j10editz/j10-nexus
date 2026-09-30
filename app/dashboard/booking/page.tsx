"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  User,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import {
  DashboardPageHeader,
  DashboardButton,
} from "@/components/dashboard/DashboardPrimitives";

interface BookingItem {
  id: string;
  contact_id?: string;
  status: string;
  scheduled_start?: string;
  scheduled_end?: string;
  metadata?: {
    clientName?: string;
    serviceName?: string;
    amount?: number;
    notes?: string;
  };
  created_at: string;
}

export default function J10BookingPage() {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"appointments" | "availability" | "reminders">("appointments");

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/crm/bookings");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load bookings.");
      }
      setBookings(json.bookings || []);
    } catch (err) {
      console.error("Failed to load J10 Bookings:", err);
      setError(err instanceof Error ? err.message : "Error querying bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-[#090B10] px-4 py-6 sm:px-6 lg:px-8 text-[#F5F7FA]">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <DashboardPageHeader
          title="J10 Booking"
          subtitle="Manage customer appointments, availability windows, and automated reminders."
          actions={
            <div className="flex items-center gap-2.5">
              <DashboardButton
                variant="secondary"
                onClick={() => void fetchBookings()}
                disabled={loading}
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                <span>Refresh</span>
              </DashboardButton>
              <Link
                href="/dashboard/connections"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#242A35] bg-[#151922] px-3 py-1.5 text-xs font-medium text-[#98A2B3] transition hover:bg-[#242A35] hover:text-[#F5F7FA]"
              >
                <CalendarIcon size={13} />
                <span>Google Calendar (Coming Soon)</span>
              </Link>
            </div>
          }
        />

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 border-b border-[#242A35] pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("appointments")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "appointments"
                ? "bg-[#4F7CFF] text-white"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Appointments ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("availability")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "availability"
                ? "bg-[#4F7CFF] text-white"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Availability & Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reminders")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "reminders"
                ? "bg-[#4F7CFF] text-white"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Reminders & Policies
          </button>
        </div>

        {/* Tab 1: Appointments */}
        {activeTab === "appointments" && (
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-4 text-xs text-rose-300">
                {error}
              </div>
            )}

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
                  />
                ))}
              </div>
            ) : bookings.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-[#111216] p-8 text-center">
                <CalendarIcon className="mx-auto h-8 w-8 text-[#8d96a8]" />
                <h3 className="mt-3 text-sm font-semibold text-white">
                  No Bookings Recorded Yet
                </h3>
                <p className="mt-1 max-w-sm mx-auto text-xs text-[#8d96a8]">
                  Appointments scheduled by your AI Operator or booked through your lead funnel will appear here with automated reminders.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Link
                    href="/dashboard/ai-operator"
                    className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                  >
                    Configure Booking Rules in J10 AI Operator
                  </Link>
                  <Link
                    href="/dashboard/crm"
                    className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs font-medium text-[#8d96a8] transition hover:text-white"
                  >
                    View J10 Lead Center
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-[#111216]">
                {bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                        <CalendarIcon size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {b.metadata?.clientName || "Customer Appointment"}
                        </div>
                        <div className="text-[11px] text-[#8d96a8]">
                          {b.scheduled_start
                            ? new Date(b.scheduled_start).toLocaleString([], {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "Scheduled consultation"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                        {b.status}
                      </span>
                      {b.contact_id && (
                        <Link
                          href={`/dashboard/crm?contactId=${b.contact_id}`}
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          View Contact
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Availability */}
        {activeTab === "availability" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Business Availability & Scheduling Sync
            </h3>
            <p className="text-xs text-[#8d96a8]">
              J10 AI Operator uses your configured operating hours and calendar sync to offer customers available slots in real time.
            </p>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-[#8d96a8] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Weekly Operating Hours</span>
                <Link
                  href="/dashboard/ai-operator"
                  className="text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  Edit in J10 AI Operator
                </Link>
              </div>
              <p>Monday - Friday: 9:00 AM - 6:00 PM</p>
              <p>Buffer between appointments: 15 minutes</p>
            </div>
          </div>
        )}

        {/* Tab 3: Reminders */}
        {activeTab === "reminders" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Automated Reminders & No-Show Recovery
            </h3>
            <p className="text-xs text-[#8d96a8]">
              Automated reminders reduce no-shows and give customers a quick way to confirm or reschedule through WhatsApp or Telegram.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs">
                <div className="font-semibold text-white">24-Hour Reminder</div>
                <p className="mt-1 text-[#8d96a8]">
                  Automated WhatsApp or SMS reminder sent 24 hours prior to appointment with instant confirmation button.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs">
                <div className="font-semibold text-white">1-Hour Arrival Notice</div>
                <p className="mt-1 text-[#8d96a8]">
                  Final reminder with directions and business contact number sent 60 minutes prior.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
