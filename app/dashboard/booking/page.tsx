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
  X,
} from "lucide-react";
import {
  DashboardPageHeader,
  DashboardButton,
} from "@/components/dashboard/DashboardPrimitives";

interface BookingItem {
  id: string;
  contact_id?: string;
  title: string;
  status: string;
  scheduled_at?: string;
  duration_minutes?: number;
  notes?: string | null;
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
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingForm, setBookingForm] = useState({ title: "", scheduledAt: "", durationMinutes: "60", notes: "" });
  const [businessHours, setBusinessHours] = useState<string | null>(null);

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
    fetch("/api/bot/config", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setBusinessHours(payload?.config?.business_hours || null))
      .catch(() => setBusinessHours(null));
  }, [fetchBookings]);

  async function createBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/crm/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bookingForm.title,
          scheduledAt: new Date(bookingForm.scheduledAt).toISOString(),
          durationMinutes: Number(bookingForm.durationMinutes) || 60,
          notes: bookingForm.notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Booking could not be created.");
      }
      setBookingForm({ title: "", scheduledAt: "", durationMinutes: "60", notes: "" });
      setShowCreate(false);
      await fetchBookings();
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "Booking could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-[#F8F7FC] px-4 py-6 sm:px-6 lg:px-8 text-[#17151F]">
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
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#6347E8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5136D6]"
              >
                <Plus size={13} />
                <span>New booking</span>
              </button>
            </div>
          }
        />

        {showCreate ? (
          <form onSubmit={createBooking} className="rounded-xl border border-[#D8B565]/30 bg-[#FFFFFF] p-4 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#17151F]">Create an internal booking</h2>
                <p className="text-[11px] text-[#6F687A]">This records the appointment in J10. It does not claim an external calendar reservation.</p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close booking form" className="text-[#6F687A]"><X size={16} /></button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="md:col-span-2 text-[11px] text-[#6F687A]">Title<input required value={bookingForm.title} onChange={(event) => setBookingForm((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label>
              <label className="text-[11px] text-[#6F687A]">Date and time<input required type="datetime-local" value={bookingForm.scheduledAt} onChange={(event) => setBookingForm((current) => ({ ...current, scheduledAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label>
              <label className="text-[11px] text-[#6F687A]">Duration<input required min="15" step="15" type="number" value={bookingForm.durationMinutes} onChange={(event) => setBookingForm((current) => ({ ...current, durationMinutes: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label>
            </div>
            <label className="mt-3 block text-[11px] text-[#6F687A]">Internal notes<textarea value={bookingForm.notes} onChange={(event) => setBookingForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] px-3 py-2 text-xs text-[#17151F]" /></label>
            <div className="mt-3 flex justify-end"><button disabled={submitting} className="rounded-lg bg-[#6347E8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{submitting ? "Creating…" : "Create booking"}</button></div>
          </form>
        ) : null}

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 border-b border-[#E2DEEA] pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("appointments")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "appointments"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            Appointments ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("availability")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "availability"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            Availability & Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reminders")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "reminders"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            Reminders & Policies
          </button>
        </div>

        {/* Tab 1: Appointments */}
        {activeTab === "appointments" && (
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl border border-[#E11D48]/20 bg-[#E11D48]/10 p-4 text-xs text-[#E11D48]">
                {error}
              </div>
            )}

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl border border-[#E2DEEA] bg-[#FFFFFF]"
                  />
                ))}
              </div>
            ) : bookings.length === 0 ? (
              <div className="rounded-2xl border border-[#E2DEEA] bg-[#FFFFFF] p-8 text-center shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
                <CalendarIcon className="mx-auto h-8 w-8 text-[#918A9D]" />
                <h3 className="mt-3 text-sm font-semibold text-[#17151F]">
                  No Bookings Recorded Yet
                </h3>
                <p className="mt-1 max-w-sm mx-auto text-xs text-[#6F687A]">
                  Appointments scheduled by your AI Operator or booked through your lead funnel will appear here with automated reminders.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Link
                    href="/dashboard/ai-operator"
                    className="rounded-xl bg-[#6347E8] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5136D6]"
                  >
                    Configure Booking Rules in J10 AI Operator
                  </Link>
                  <Link
                    href="/dashboard/crm"
                    className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] px-4 py-2 text-xs font-medium text-[#6F687A] transition hover:text-[#17151F]"
                  >
                    View J10 Lead Center
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#E2DEEA] rounded-2xl border border-[#E2DEEA] bg-[#FFFFFF] shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
                {bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0ECFF] text-[#6347E8]">
                        <CalendarIcon size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#17151F]">
                          {b.metadata?.clientName || b.title || "Customer Appointment"}
                        </div>
                        <div className="text-[11px] text-[#6F687A]">
                          {b.scheduled_at
                            ? new Date(b.scheduled_at).toLocaleString([], {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "Scheduled consultation"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-[#168A65]/20 bg-[#168A65]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#168A65]">
                        {b.status}
                      </span>
                      {b.contact_id && (
                        <Link
                          href={`/dashboard/crm?contactId=${b.contact_id}`}
                          className="text-xs text-[#6347E8] hover:text-[#5136D6]"
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
          <div className="rounded-2xl border border-[#E2DEEA] bg-[#FFFFFF] p-6 space-y-4 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <h3 className="text-sm font-semibold text-[#17151F]">
              Business Availability & Scheduling Sync
            </h3>
            <p className="text-xs text-[#6F687A]">
              J10 uses the verified operating-hours configuration below. External calendar availability is not claimed until a calendar connection confirms it.
            </p>
            <div className="rounded-xl border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs text-[#6F687A] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#17151F] font-medium">Weekly Operating Hours</span>
                <Link
                  href="/dashboard/ai-operator"
                  className="text-[#6347E8] hover:text-[#5136D6] font-semibold"
                >
                  Edit in J10 AI Operator
                </Link>
              </div>
              <p>{businessHours || "Business hours have not been configured yet."}</p>
              <p className="text-[11px]">Internal J10 bookings are available now. External calendar reservations require a verified connection.</p>
            </div>
          </div>
        )}

        {/* Tab 3: Reminders */}
        {activeTab === "reminders" && (
          <div className="rounded-2xl border border-[#E2DEEA] bg-[#FFFFFF] p-6 space-y-4 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <h3 className="text-sm font-semibold text-[#17151F]">
              Automated Reminders & No-Show Recovery
            </h3>
            <p className="text-xs text-[#6F687A]">
              Reminder workflows are shown as active only after a published automation and connected delivery channel are verified.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs">
                <div className="font-semibold text-[#17151F]">24-Hour Reminder</div>
                <p className="mt-1 text-[#6F687A]">
                  Configure a published reminder workflow for a connected WhatsApp or Telegram channel.
                </p>
              </div>
              <div className="rounded-xl border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs">
                <div className="font-semibold text-[#17151F]">1-Hour Arrival Notice</div>
                <p className="mt-1 text-[#6F687A]">
                  No reminder is assumed active from this screen. Verify delivery in J10 Automations before relying on it.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
