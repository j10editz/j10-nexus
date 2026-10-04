import Link from "next/link";

import { DEMO_REVENUE_DASHBOARD_DATA as data } from "@/lib/dashboard/demo-fixture";

export default function BookingPage() {
  const appointments = [...data.appointments.today, ...data.appointments.upcoming];

  return (
    <div className="j10-product-page">
      <header className="j10-product-heading">
        <div>
          <p>J10 BOOKING</p>
          <h1>Appointments</h1>
          <span>Bookings, reminders, rescheduling, and no-show recovery in one place.</span>
        </div>
        <button type="button">Create booking link</button>
      </header>

      <section className="j10-booking-summary">
        <div><span>Today</span><strong>{data.appointments.today.length}</strong></div>
        <div><span>Upcoming</span><strong>{data.appointments.upcoming.length}</strong></div>
        <div><span>Conversion</span><strong>{data.appointments.bookingConversionRate}%</strong></div>
        <div><span>Needs follow-up</span><strong>{data.appointments.leadsAwaitingFollowupCount}</strong></div>
      </section>

      <section className="j10-booking-layout">
        <article className="j10-product-panel">
          <div className="j10-product-panel-title"><h2>Schedule</h2><span>This week</span></div>
          <div className="j10-booking-days">
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, index) => (
              <div className={index === 2 ? "today" : ""} key={day}><span>{day}</span><b>{14 + index}</b></div>
            ))}
          </div>
          <div className="j10-booking-list">
            {appointments.map((appointment) => (
              <div key={appointment.id}>
                <time>{appointment.timeFormatted}</time>
                <span><strong>{appointment.clientName}</strong><small>{appointment.serviceRequested}</small></span>
                <em>{appointment.status}</em>
              </div>
            ))}
          </div>
        </article>

        <aside className="j10-product-panel">
          <div className="j10-product-panel-title"><h2>Booking health</h2></div>
          <div className="j10-booking-health">
            <strong>{data.appointments.bookingConversionRate}%</strong>
            <span>of qualified leads booked</span>
            <hr />
            <p>Reminders are active</p>
            <p>Rescheduling is enabled</p>
            <p>No-show follow-up is active</p>
          </div>
          <Link href="/dashboard/bot-setup">Edit booking rules</Link>
        </aside>
      </section>
    </div>
  );
}
