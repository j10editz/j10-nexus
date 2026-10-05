"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Clock3, Pause, Play, Plus, RefreshCw } from "lucide-react";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused" | "archived";
  total_executions: number;
  successful_executions: number;
  last_run_at: string | null;
};

const templates = [
  { id: "lead", title: "Reply to new leads", description: "Answer instantly, qualify the lead, and notify your team.", trigger: "New lead arrives", action: "J10 qualifies and replies", outcome: "Sales receives a hot lead", color: "purple" },
  { id: "missed-call", title: "Recover missed calls", description: "Send a text within seconds and offer the next available time.", trigger: "Call is missed", action: "J10 texts the caller", outcome: "Appointment is offered", color: "gold" },
  { id: "booking", title: "Confirm appointments", description: "Confirm bookings, send reminders, and follow up after no-shows.", trigger: "Booking is created", action: "J10 sends reminders", outcome: "Fewer no-shows", color: "purple" },
  { id: "review", title: "Request a review", description: "Ask satisfied customers for a review after the service is complete.", trigger: "Job is completed", action: "J10 requests feedback", outcome: "Review link is sent", color: "gold" },
  { id: "invoice", title: "Follow up on invoices", description: "Remind customers before and after a payment becomes overdue.", trigger: "Invoice is due", action: "J10 sends a reminder", outcome: "Payment status is tracked", color: "purple" },
  { id: "reactivate", title: "Bring customers back", description: "Reach past customers with a timely, approved offer.", trigger: "Customer becomes inactive", action: "J10 sends an offer", outcome: "New conversation starts", color: "gold" },
];

export default function AutomationPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [error, setError] = useState("");

  async function loadAutomations() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/automations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not load workflows.");
      setAutomations(Array.isArray(data.automations) ? data.automations : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load workflows.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAutomations(); }, []);

  const activeCount = useMemo(() => automations.filter((item) => item.status === "active").length, [automations]);
  const executionCount = useMemo(() => automations.reduce((sum, item) => sum + item.total_executions, 0), [automations]);

  return (
    <div className="j10-simple-automation">
      <header className="j10-auto-header">
        <div><p>J10 AUTOMATION</p><h1>Put repetitive work on autopilot</h1><span>Choose an outcome. J10 prepares the workflow and keeps important decisions under your control.</span></div>
        <div><button onClick={() => void loadAutomations()} aria-label="Refresh workflows"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button><Link href="/dashboard/automation/flow"><Plus size={17} /> Build custom</Link></div>
      </header>

      <section className="j10-auto-status">
        <Image src="/brand/j10-expression-focused.png" alt="J10 automation assistant" width={72} height={72} />
        <div><span>J10 AUTOMATION ASSISTANT</span><strong>What should I handle for your business?</strong><small>Start with a proven workflow. You can review every step before it goes live.</small></div>
        <dl><div><dt>Active</dt><dd>{activeCount}</dd></div><div><dt>Runs</dt><dd>{executionCount}</dd></div><div><dt>Saved</dt><dd>{automations.length}</dd></div></dl>
      </section>

      <main className="j10-auto-workspace">
        <section className="j10-auto-template-panel">
          <div className="j10-auto-section-title"><div><span>1</span><h2>Choose what you want to automate</h2></div><small>Popular workflows for local businesses</small></div>
          <div className="j10-auto-template-grid">
            {templates.map((template) => (
              <button key={template.id} className={`${template.color} ${selectedTemplate.id === template.id ? "selected" : ""}`} onClick={() => setSelectedTemplate(template)}>
                <i>{selectedTemplate.id === template.id ? <Check size={13} /> : null}</i><strong>{template.title}</strong><span>{template.description}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="j10-auto-preview">
          <div className="j10-auto-section-title"><div><span>2</span><h2>Review the workflow</h2></div></div>
          <h3>{selectedTemplate.title}</h3>
          <div className="j10-auto-flow-step"><b>WHEN</b><span>{selectedTemplate.trigger}</span></div>
          <ChevronRight className="flow-arrow" size={17} />
          <div className="j10-auto-flow-step featured"><b>J10 DOES</b><span>{selectedTemplate.action}</span></div>
          <ChevronRight className="flow-arrow" size={17} />
          <div className="j10-auto-flow-step"><b>RESULT</b><span>{selectedTemplate.outcome}</span></div>
          <div className="j10-auto-safety"><span>Human approval</span><strong>Required for money, discounts, and sensitive actions</strong></div>
          <Link href={`/dashboard/automation/flow?template=${selectedTemplate.id}`}>Customize this workflow</Link>
        </aside>
      </main>

      <section className="j10-auto-library">
        <div className="j10-auto-section-title"><div><span>3</span><h2>Your workflows</h2></div><small>{automations.length} saved</small></div>
        {error && <p className="j10-auto-error">{error} <button onClick={() => void loadAutomations()}>Try again</button></p>}
        {!error && loading ? <div className="j10-auto-loading"><RefreshCw size={17} className="animate-spin" /> Loading workflows</div> : null}
        {!error && !loading && automations.length === 0 ? (
          <div className="j10-auto-empty"><Image src="/brand/j10-expression-focused.png" alt="" width={58} height={58} /><div><strong>No workflows yet</strong><span>Choose a template above to create your first automation.</span></div><Link href={`/dashboard/automation/flow?template=${selectedTemplate.id}`}>Create first workflow</Link></div>
        ) : (
          <div className="j10-auto-list">{automations.slice(0, 5).map((automation) => <Link href={`/dashboard/automation/flow/${automation.id}`} key={automation.id}><div className={automation.status === "active" ? "active" : "paused"}>{automation.status === "active" ? <Play size={12} /> : <Pause size={12} />}</div><span><strong>{automation.name}</strong><small>{automation.description || "Custom J10 workflow"}</small></span><em>{automation.total_executions} runs</em><Clock3 size={15} /></Link>)}</div>
        )}
      </section>
    </div>
  );
}
