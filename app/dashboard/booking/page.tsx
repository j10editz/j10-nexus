"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Link2, Mail, MapPin, Phone, Plus, UserRound } from "lucide-react";

const bookings = [
  { id: "emily", day: 0, top: 52, height: 76, name: "Emily Carter", service: "House Cleaning", time: "9:00 – 10:00", status: "confirmed" },
  { id: "daniel", day: 0, top: 214, height: 86, name: "Daniel Kim", service: "Deep Cleaning", time: "11:00 – 12:00", status: "pending" },
  { id: "james", day: 1, top: 64, height: 94, name: "James Wilson", service: "Move Out Clean", time: "9:00 – 10:30", status: "confirmed" },
  { id: "sarah", day: 1, top: 286, height: 70, name: "Sarah Lee", service: "Standard Clean", time: "1:00 – 2:00", status: "confirmed" },
  { id: "michael", day: 2, top: 54, height: 88, name: "Michael Brown", service: "House Cleaning", time: "9:00 – 10:00", status: "pending" },
  { id: "lisa", day: 2, top: 198, height: 94, name: "Lisa Park", service: "Deep Cleaning", time: "11:00 – 12:30", status: "confirmed" },
  { id: "ryan", day: 2, top: 372, height: 94, name: "Ryan Davis", service: "Post-Construction", time: "3:00 – 4:00", status: "confirmed" },
  { id: "olivia", day: 3, top: 58, height: 82, name: "Olivia Martinez", service: "Standard Clean", time: "9:00 – 10:00", status: "confirmed" },
  { id: "kevin", day: 3, top: 290, height: 80, name: "Kevin Zhang", service: "Airbnb Turnover", time: "1:00 – 2:30", status: "pending" },
  { id: "amanda", day: 4, top: 206, height: 82, name: "Amanda White", service: "House Cleaning", time: "11:00 – 12:00", status: "confirmed" },
  { id: "chris", day: 5, top: 60, height: 86, name: "Chris Taylor", service: "Move In Clean", time: "9:00 – 10:30", status: "confirmed" },
  { id: "nicole", day: 6, top: 122, height: 84, name: "Nicole Adams", service: "Standard Clean", time: "10:00 – 11:00", status: "pending" },
];

const days = [["Mon", "21"], ["Tue", "22"], ["Wed", "23"], ["Thu", "24"], ["Fri", "25"], ["Sat", "26"], ["Sun", "27"]];

export default function BookingPage() {
  const [selectedId, setSelectedId] = useState("michael");
  const [notice, setNotice] = useState("");
  const selected = bookings.find((item) => item.id === selectedId) ?? bookings[4];

  function confirm(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  return (
    <div className="j10-booking-workspace">
      <header className="j10-booking-head">
        <div><p>J10 BOOKING</p><h1>Appointments</h1><span>Manage availability, reminders, rescheduling, and no-show recovery.</span></div>
        <div className="j10-booking-head-actions">
          <button className="secondary" onClick={() => confirm("Booking link copied.")}><Link2 size={16} /> Booking link</button>
          <button onClick={() => confirm("New booking workspace opened.")}><Plus size={17} /> New booking</button>
        </div>
      </header>

      <section className="j10-booking-kpis">
        <div><span>Today</span><strong>4</strong><small>3 confirmed</small></div>
        <div><span>This week</span><strong>12</strong><small>84% capacity</small></div>
        <div><span>Booking rate</span><strong>30.8%</strong><small>+4.2% this month</small></div>
        <div><span>Needs attention</span><strong>3</strong><small>2 deposits pending</small></div>
      </section>

      <div className="j10-booking-toolbar">
        <div><button className="active"><CalendarDays size={15} /> Calendar</button><button>List</button></div>
        <div><button>This week</button><button aria-label="Previous week"><ChevronLeft size={16} /></button><button aria-label="Next week"><ChevronRight size={16} /></button><strong>Apr 21 – Apr 27, 2025</strong></div>
      </div>

      <section className="j10-booking-main">
        <article className="j10-calendar-shell">
          <div className="j10-calendar-days">{days.map(([day, date], index) => <div className={index === 2 ? "today" : ""} key={day}><span>{day}</span><b>{date}</b></div>)}</div>
          <div className="j10-calendar-body">
            <div className="j10-time-rail">{["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"].map((time) => <span key={time}>{time}</span>)}</div>
            <div className="j10-calendar-grid">
              {days.map(([day], index) => <div className={index === 2 ? "today" : ""} key={day} />)}
              {bookings.map((booking) => <button key={booking.id} onClick={() => setSelectedId(booking.id)} className={`j10-calendar-event ${booking.status} ${selectedId === booking.id ? "selected" : ""}`} style={{ left: `calc(${booking.day} * (100% / 7) + 5px)`, top: booking.top, width: "calc(100% / 7 - 10px)", height: booking.height }}><strong>{booking.name}</strong><span>{booking.service}</span><small>{booking.time}</small><i>{booking.status === "confirmed" ? <Check size={10} /> : <Clock3 size={10} />}</i></button>)}
            </div>
          </div>
        </article>

        <aside className="j10-booking-detail">
          <div className="j10-detail-title"><div><span>BOOKING DETAILS</span><h2>{selected.name}</h2></div><button onClick={() => confirm("Reschedule options opened.")}>Reschedule</button></div>
          <div className="j10-customer-card"><div>{selected.name.split(" ").map((part) => part[0]).join("")}</div><span><strong>{selected.name}</strong><small>Lead · J10 qualified</small></span></div>
          <div className="j10-contact-line"><Phone size={15} /><span>(555) 123-4567</span></div>
          <div className="j10-contact-line"><Mail size={15} /><span>customer@example.com</span></div>
          <hr />
          <dl className="j10-booking-facts">
            <div><dt><CalendarDays size={16} /> Date & time</dt><dd>Wed, Apr 23<br /><span>{selected.time} (1 hour)</span></dd></div>
            <div><dt><MapPin size={16} /> Service</dt><dd>{selected.service}<br /><span>3 bedrooms · Standard</span></dd></div>
            <div><dt><UserRound size={16} /> Assigned to</dt><dd>Jessica Martin<br /><span>Cleaning Specialist</span></dd></div>
            <div className="gold"><dt>Deposit</dt><dd>$50 <em>Pending</em></dd></div>
            <div><dt><Bell size={16} /> Reminders</dt><dd><span>24 hours before · Scheduled</span><br /><span>2 hours before · Scheduled</span></dd></div>
          </dl>
          <div className="j10-detail-actions"><button onClick={() => confirm("Deposit request prepared.")}>Request deposit</button><button onClick={() => confirm("Reminder sent.")}>Send reminder</button></div>
          <Link href="/dashboard/bot-setup?tab=operator">Edit booking automation rules</Link>
        </aside>
      </section>
      {notice && <div className="j10-booking-toast">{notice}</div>}
    </div>
  );
}
