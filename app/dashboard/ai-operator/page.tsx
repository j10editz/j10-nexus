"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const sources = [
  ["Services & pricing", "12 services", "Complete"],
  ["Policies", "8 policies", "Complete"],
  ["Business hours", "2 locations", "Complete"],
  ["Frequently asked questions", "28 answers", "Needs update"],
];

const rules = [
  ["Lead qualification", "Ask up to five questions about service, location, budget, and timeline."],
  ["Booking behavior", "Check availability, book directly, and send confirmations and reminders."],
  ["Payment collection", "Present approved deposits and payment options without creating surprise charges."],
  ["Human handoff", "Transfer complex, urgent, upset, or out-of-scope customers to the team."],
];

const actions = [
  ["10:15 AM", "Sarah Mitchell", "Answered pricing question", "FAQ match", "Answered"],
  ["10:12 AM", "Mike Roberts", "Requested booking approval", "Qualified lead", "Pending"],
  ["10:08 AM", "Emily Carter", "Provided deposit options", "Service requires deposit", "Info provided"],
  ["9:52 AM", "Jason Lee", "Transferred custom quote", "Non-standard scope", "Escalated"],
  ["9:43 AM", "Amanda Thomas", "Answered hours question", "Business hours match", "Answered"],
];

export default function AiOperatorPage() {
  const [active, setActive] = useState(true);
  const [approvals, setApprovals] = useState([true, true, true, true, true]);
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("");

  function runPrompt(value?: string) {
    const question = (value || prompt).trim();
    if (!question) return;
    setPrompt(question);
    setNotice("J10 reviewed the current operator rules. No unsafe action was taken.");
  }

  return (
    <div className="j10-operator-page">
      <header className="j10-operator-heading">
        <div className="j10-operator-identity">
          <div className="j10-operator-mascot"><Image src="/brand/j10-expression-focused.png" alt="J10 Operator" width={82} height={82} /></div>
          <div>
            <div className="j10-operator-title"><h1>J10 AI Operator</h1><span>Workspace operator</span></div>
            <p>Control what J10 may answer, automate, approve, and escalate.</p>
          </div>
        </div>
        <div className="j10-operator-actions">
          <button className={active ? "active" : ""} onClick={() => setActive(!active)}><i />{active ? "Active" : "Paused"}</button>
          <Link href="/dashboard/activity">Training logs</Link>
          <button className="primary" onClick={() => runPrompt("Test a customer response")}>Test response</button>
        </div>
      </header>

      <section className="j10-operator-grid">
        <article className="j10-operator-panel gold">
          <div className="j10-operator-panel-title"><div><b>Knowledge</b><span>Sources J10 uses to answer, qualify, and book.</span></div><Link href="/dashboard/knowledge">Add source</Link></div>
          <div className="j10-operator-stack">
            {sources.map(([name, detail, status]) => <Link href="/dashboard/knowledge" key={name}><div><strong>{name}</strong><span>{detail}</span></div><em className={status === "Complete" ? "good" : "warn"}>{status}</em><b>›</b></Link>)}
          </div>
        </article>

        <article className="j10-operator-panel">
          <div className="j10-operator-panel-title"><div><b>Rules & behavior</b><span>Define how J10 handles customer outcomes.</span></div></div>
          <div className="j10-operator-stack rules">
            {rules.map(([name, detail]) => <div key={name}><div><strong>{name}</strong><span>{detail}</span></div><button>Edit</button></div>)}
          </div>
        </article>

        <article className="j10-operator-panel">
          <div className="j10-operator-panel-title"><div><b>Escalation & approvals</b><span>Choose decisions that require a human.</span></div></div>
          <div className="j10-approval-list">
            {["Custom or non-standard quotes", "Discounts over 15%", "Service area exceptions", "Upset or high-risk customers", "Refund or policy disputes"].map((label, index) => (
              <label key={label}><input type="checkbox" checked={approvals[index]} onChange={() => setApprovals((current) => current.map((value, i) => i === index ? !value : value))} /><span>{label}</span></label>
            ))}
          </div>
          <div className="j10-escalation-list"><h3>Recent escalations</h3><div><span>Custom quote request<small>$4,200 project</small></span><em>Pending</em></div><div><span>Outside service area<small>Beyond coverage radius</small></span><em className="good">Approved</em></div><div><span>Customer complaint<small>Human review completed</small></span><em>Handled</em></div></div>
        </article>
      </section>

      <section className="j10-operator-activity">
        <div className="j10-operator-panel-title"><div><b>Recent operator actions</b><span>Actions involving money or commitments remain approval-gated.</span></div><select aria-label="Filter actions"><option>All actions</option><option>Approvals</option><option>Answers</option></select></div>
        <div className="j10-action-table">
          <div className="head"><span>Time</span><span>Customer</span><span>Action</span><span>Reason</span><span>Outcome</span></div>
          {actions.map(([time, customer, action, reason, outcome]) => <div key={`${time}-${customer}`}><span>{time}</span><strong>{customer}</strong><span>{action}</span><span>{reason}</span><em className={outcome === "Answered" ? "good" : outcome === "Pending" ? "warn" : ""}>{outcome}</em></div>)}
        </div>
      </section>

      <section className="j10-operator-command">
        <Image src="/brand/j10-logo.png" alt="" width={24} height={24} />
        <input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runPrompt(); }} placeholder="Ask J10 about your business..." />
        <button onClick={() => runPrompt()}>→</button>
      </section>
      {notice && <p className="j10-operator-notice">{notice}</p>}
      <div className="j10-operator-suggestions"><span>Try asking:</span>{["How do you qualify a lead?", "What will you say about pricing?", "Show me your handoff rules", "Summarize today’s activity"].map((item) => <button key={item} onClick={() => runPrompt(item)}>{item}</button>)}</div>
    </div>
  );
}
