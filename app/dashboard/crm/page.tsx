"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Contact,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
  Save,
  Columns3,
  Table2,
  LayoutGrid,
  MessageSquare,
  Clock,
  ArrowRight,
  Sparkles,
} from "lucide-react";

import CRMIntelligencePanel from "@/components/crm/CRMIntelligencePanel";
import {
  buildContextualWhatsAppLink,
  formatUSD,
  getStalenessInfo,
  groupContactsByStage,
  SEED_CRM_CONTACTS,
} from "@/lib/crm/service";
import type { ContactStatus, ContactType, CRMContact, CRMSummary } from "@/types/crm";

type CRMResponse = {
  success: boolean;
  contacts?: CRMContact[];
  contact?: CRMContact;
  summary?: CRMSummary;
  message?: string;
  error?: string;
};

const statusOptions: (ContactStatus | "All")[] = [
  "All",
  "New",
  "Contacted",
  "Qualified",
  "Interested",
  "Won",
  "Lost",
];

const typeOptions: (ContactType | "All")[] = [
  "All",
  "Lead",
  "Prospect",
  "Customer",
];

const emptySummary: CRMSummary = {
  total: 0,
  leads: 0,
  prospects: 0,
  customers: 0,
  new: 0,
  qualified: 0,
  won: 0,
  lost: 0,
  pipelineValue: 0,
  wonValue: 0,
};

type ViewMode = "kanban" | "table" | "cards";

function computeCRMSummary(contactList: CRMContact[]): CRMSummary {
  const wonContacts = contactList.filter((c) => c.status === "Won");
  const wonVal = wonContacts.reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0);
  const pipelineVal = contactList
    .filter((c) => c.status !== "Lost" && c.status !== "Won")
    .reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0);

  return {
    total: contactList.length,
    leads: contactList.filter((c) => c.type === "Lead").length,
    prospects: contactList.filter((c) => c.type === "Prospect").length,
    customers: contactList.filter((c) => c.type === "Customer").length,
    new: contactList.filter((c) => c.status === "New").length,
    qualified: contactList.filter((c) => c.status === "Qualified").length,
    won: wonContacts.length,
    lost: contactList.filter((c) => c.status === "Lost").length,
    pipelineValue: pipelineVal,
    wonValue: wonVal,
  };
}

export default function CRMPage() {
  const [contacts, setContacts] = useState<CRMContact[]>(SEED_CRM_CONTACTS);
  const [summary, setSummary] = useState<CRMSummary>(() => computeCRMSummary(SEED_CRM_CONTACTS));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "All">("All");
  const [typeFilter, setTypeFilter] = useState<ContactType | "All">("All");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<CRMContact | null>(null);
  const [intelligenceRefreshKey, setIntelligenceRefreshKey] = useState(0);
  const [updatingContactId, setUpdatingContactId] = useState<string | null>(null);

  function refreshIntelligence() {
    setIntelligenceRefreshKey((current) => current + 1);
  }

  const loadCRM = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/crm", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as CRMResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not load CRM.");
      }

      const liveContacts = data.contacts && data.contacts.length > 0 ? data.contacts : SEED_CRM_CONTACTS;
      setContacts(liveContacts);

      if (data.summary && data.contacts && data.contacts.length > 0) {
        setSummary(data.summary);
      } else {
        setSummary(computeCRMSummary(liveContacts));
      }
    } catch {
      setContacts(SEED_CRM_CONTACTS);
      setSummary(computeCRMSummary(SEED_CRM_CONTACTS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCRM();
  }, [loadCRM]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return contacts.filter((contact) => {
      const fullName = `${contact.first_name} ${contact.last_name ?? ""}`.toLowerCase();

      const matchesSearch =
        !query ||
        fullName.includes(query) ||
        (contact.email ?? "").toLowerCase().includes(query) ||
        (contact.company ?? "").toLowerCase().includes(query) ||
        (contact.phone ?? "").includes(query);

      const matchesStatus =
        statusFilter === "All" || contact.status === statusFilter;

      const matchesType = typeFilter === "All" || contact.type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [contacts, search, statusFilter, typeFilter]);

  const kanbanColumns = useMemo(() => {
    return groupContactsByStage(filteredContacts);
  }, [filteredContacts]);

  async function handleQuickAdvanceStage(contact: CRMContact, nextStatus: ContactStatus) {
    setUpdatingContactId(contact.id);
    try {
      const response = await fetch(`/api/crm/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", status: nextStatus }),
      });
      const data = await response.json();
      if (response.ok && data.success && data.contact) {
        updateContactInState(data.contact);
      } else {
        // Optimistic local fallback
        const updated = { ...contact, status: nextStatus, updated_at: new Date().toISOString() };
        updateContactInState(updated);
      }
    } catch {
      const updated = { ...contact, status: nextStatus, updated_at: new Date().toISOString() };
      updateContactInState(updated);
    } finally {
      setUpdatingContactId(null);
    }
  }

  async function handleMarkContacted(contact: CRMContact) {
    setUpdatingContactId(contact.id);
    try {
      const response = await fetch(`/api/crm/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "contacted" }),
      });
      const data = await response.json();
      if (response.ok && data.success && data.contact) {
        updateContactInState(data.contact);
      } else {
        // Optimistic local update
        const updated: CRMContact = {
          ...contact,
          status: contact.status === "New" ? "Contacted" : contact.status,
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        updateContactInState(updated);
      }
    } catch {
      const updated: CRMContact = {
        ...contact,
        status: contact.status === "New" ? "Contacted" : contact.status,
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      updateContactInState(updated);
    } finally {
      setUpdatingContactId(null);
    }
  }

  function updateContactInState(contact: CRMContact) {
    setContacts((current) =>
      current.map((item) => (item.id === contact.id ? contact : item))
    );
    if (selectedContact?.id === contact.id) {
      setSelectedContact(contact);
    }
    refreshIntelligence();
  }

  function deleteContactFromState(id: string) {
    setContacts((current) => current.filter((contact) => contact.id !== id));
    setSelectedContact(null);
    refreshIntelligence();
  }

  function refreshCRM() {
    refreshIntelligence();
    void loadCRM();
  }

  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                CUSTOMER INTELLIGENCE & DEAL PIPELINE
              </p>
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-300">
                Autonomous
              </span>
            </div>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              CRM & Sales Pipeline
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Manage leads, deal stages, pipeline velocity, and 1-click WhatsApp follow-ups across J10 NEXUS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* VIEW MODE TOGGLE */}
            <div className="flex items-center rounded-xl border border-white/[0.08] bg-[#111216] p-1">
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "kanban"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Columns3 size={14} />
                Kanban
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "table"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Table2 size={14} />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === "cards"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <LayoutGrid size={14} />
                Cards
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <Plus size={16} />
              Add Contact
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Pipeline Contacts"
            value={String(summary.total)}
            icon={Users}
            subtitle={`${summary.leads} leads • ${summary.prospects} prospects`}
          />

          <StatCard
            label="Active Opportunities"
            value={String(summary.leads + summary.prospects)}
            icon={Contact}
            subtitle={`${summary.qualified} qualified • ${summary.new} new`}
          />

          <StatCard
            label="Pipeline Value"
            value={formatUSD(summary.pipelineValue)}
            icon={CircleDollarSign}
            subtitle="Weighted active potential"
          />

          <StatCard
            label="Revenue Closed Won"
            value={formatUSD(summary.wonValue)}
            icon={CheckCircle2}
            success
            subtitle={`${summary.won} closed accounts`}
          />
        </div>

        {/* J10 AI CRM INTELLIGENCE PANEL */}
        <div className="mt-8">
          <CRMIntelligencePanel refreshKey={intelligenceRefreshKey} />
        </div>

        {/* CONTROLS & FILTERS */}
        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, company, email, or phone..."
              className="w-full rounded-xl border border-white/[0.08] bg-[#111216] py-2.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-500/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ContactType | "All")}
              className="rounded-xl border border-white/[0.08] bg-[#111216] px-3.5 py-2.5 text-sm text-zinc-300 outline-none focus:border-violet-500/40"
            >
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type === "All" ? "All Contact Types" : type}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ContactStatus | "All")}
              className="rounded-xl border border-white/[0.08] bg-[#111216] px-3.5 py-2.5 text-sm text-zinc-300 outline-none focus:border-violet-500/40"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "All" ? "All Stages" : status}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={refreshCRM}
              disabled={loading}
              title="Refresh CRM"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[#111216] text-zinc-400 transition hover:text-white disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {/* MAIN DATA VIEW (KANBAN / TABLE / CARDS) */}
        <div className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-[260px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]"
                />
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <EmptyCRM onCreate={() => setCreateOpen(true)} />
          ) : viewMode === "kanban" ? (
            <KanbanBoardView
              columns={kanbanColumns}
              onOpenContact={setSelectedContact}
              onAdvanceStage={handleQuickAdvanceStage}
              onMarkContacted={handleMarkContacted}
              updatingContactId={updatingContactId}
            />
          ) : viewMode === "table" ? (
            <TableView
              contacts={filteredContacts}
              onOpenContact={setSelectedContact}
              onAdvanceStage={handleQuickAdvanceStage}
              onMarkContacted={handleMarkContacted}
              updatingContactId={updatingContactId}
            />
          ) : (
            <CardsGridView
              contacts={filteredContacts}
              onOpenContact={setSelectedContact}
              onAdvanceStage={handleQuickAdvanceStage}
              onMarkContacted={handleMarkContacted}
              updatingContactId={updatingContactId}
            />
          )}
        </div>
      </div>

      {/* CREATE MODAL */}
      {createOpen && (
        <CreateContactModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refreshIntelligence();
            void loadCRM();
          }}
        />
      )}

      {/* MANAGE MODAL */}
      {selectedContact && (
        <ContactModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdate={updateContactInState}
          onDelete={deleteContactFromState}
        />
      )}
    </div>
  );
}

/*
============================================================
VIEW 1: KANBAN BOARD VIEW
============================================================
*/

function KanbanBoardView({
  columns,
  onOpenContact,
  onAdvanceStage,
  onMarkContacted,
  updatingContactId,
}: {
  columns: ReturnType<typeof groupContactsByStage>;
  onOpenContact: (contact: CRMContact) => void;
  onAdvanceStage: (contact: CRMContact, nextStatus: ContactStatus) => void;
  onMarkContacted: (contact: CRMContact) => void;
  updatingContactId: string | null;
}) {
  const stageTransitions: Record<ContactStatus, ContactStatus | null> = {
    New: "Contacted",
    Contacted: "Qualified",
    Qualified: "Interested",
    Interested: "Won",
    Won: null,
    Lost: "New",
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-2 snap-x">
      {columns.map((col) => {
        return (
          <div
            key={col.stage}
            className="flex w-[320px] shrink-0 flex-col rounded-2xl border border-white/[0.08] bg-[#0E0F13] p-4 snap-start"
          >
            {/* COLUMN HEADER */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <StageDot status={col.stage} />
                <h3 className="text-sm font-semibold text-white">{col.label}</h3>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-zinc-400">
                  {col.contacts.length}
                </span>
              </div>
              <p className="text-xs font-medium text-violet-400">
                {formatUSD(col.totalValue)}
              </p>
            </div>

            {/* CARDS LIST */}
            <div className="mt-3 flex flex-1 flex-col gap-3 min-h-[300px]">
              {col.contacts.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/[0.05] p-6 text-center text-xs text-zinc-600">
                  No deals in {col.label}
                </div>
              ) : (
                col.contacts.map((contact) => {
                  const nextStage = stageTransitions[contact.status];
                  const staleness = getStalenessInfo(contact.last_contacted_at);
                  const waLink = buildContextualWhatsAppLink(contact);
                  const isUpdating = updatingContactId === contact.id;

                  return (
                    <div
                      key={contact.id}
                      className="group rounded-xl border border-white/[0.07] bg-[#14151B] p-3.5 shadow-sm transition hover:border-violet-500/30 hover:bg-[#181920]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p
                            onClick={() => onOpenContact(contact)}
                            className="cursor-pointer text-sm font-semibold text-white hover:text-violet-300"
                          >
                            {getFullName(contact)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {contact.company || contact.job_title || contact.type}
                          </p>
                        </div>
                        <span className="rounded-md border border-white/[0.06] bg-black/30 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          {formatUSD(contact.estimated_value)}
                        </span>
                      </div>

                      {/* STALENESS / CONTACTED STATUS */}
                      <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                        <Clock size={12} className={staleness.isStale ? "text-amber-400" : "text-zinc-500"} />
                        <span className={staleness.isStale ? "text-amber-400" : "text-zinc-500"}>
                          {staleness.label}
                        </span>
                      </div>

                      {/* ACTIONS ROW */}
                      <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5">
                        <div className="flex items-center gap-1.5">
                          {/* 1-CLICK WHATSAPP */}
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="1-Click WhatsApp contextual follow-up"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 transition hover:bg-emerald-500/20"
                          >
                            <MessageSquare size={13} />
                          </a>

                          {/* MARK CONTACTED */}
                          <button
                            type="button"
                            onClick={() => onMarkContacted(contact)}
                            disabled={isUpdating}
                            title="Mark Contacted Today"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
                          >
                            <UserCheck size={13} />
                          </button>
                        </div>

                        {/* ADVANCE STAGE BUTTON */}
                        {nextStage && (
                          <button
                            type="button"
                            onClick={() => onAdvanceStage(contact, nextStage)}
                            disabled={isUpdating}
                            className="flex items-center gap-1 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300 transition hover:bg-violet-500/20"
                          >
                            <span>Move to {nextStage}</span>
                            <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/*
============================================================
VIEW 2: HIGH-DENSITY TABLE VIEW
============================================================
*/

function TableView({
  contacts,
  onOpenContact,
  onAdvanceStage,
  onMarkContacted,
  updatingContactId,
}: {
  contacts: CRMContact[];
  onOpenContact: (contact: CRMContact) => void;
  onAdvanceStage: (contact: CRMContact, nextStatus: ContactStatus) => void;
  onMarkContacted: (contact: CRMContact) => void;
  updatingContactId: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E0F13]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/[0.08] bg-white/[0.02] text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-5 py-4">Contact</th>
              <th className="px-4 py-4">Company</th>
              <th className="px-4 py-4">Stage / Status</th>
              <th className="px-4 py-4">Value</th>
              <th className="px-4 py-4">Last Activity</th>
              <th className="px-5 py-4 text-right">Quick Follow-Up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {contacts.map((contact) => {
              const staleness = getStalenessInfo(contact.last_contacted_at);
              const waLink = buildContextualWhatsAppLink(contact);
              const isUpdating = updatingContactId === contact.id;

              return (
                <tr
                  key={contact.id}
                  className="transition hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-3.5">
                    <div
                      onClick={() => onOpenContact(contact)}
                      className="cursor-pointer font-medium text-white hover:text-violet-300"
                    >
                      {getFullName(contact)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {contact.email || contact.phone || "No direct email"}
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="text-zinc-300">{contact.company || "—"}</div>
                    <div className="text-xs text-zinc-500">{contact.job_title || contact.type}</div>
                  </td>

                  <td className="px-4 py-3.5">
                    <select
                      value={contact.status}
                      disabled={isUpdating}
                      onChange={(e) =>
                        onAdvanceStage(contact, e.target.value as ContactStatus)
                      }
                      className="rounded-lg border border-white/[0.08] bg-[#14151B] px-2.5 py-1 text-xs font-medium text-zinc-200 outline-none focus:border-violet-500/40"
                    >
                      {statusOptions
                        .filter((s) => s !== "All")
                        .map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                    </select>
                  </td>

                  <td className="px-4 py-3.5 font-semibold text-white">
                    {formatUSD(contact.estimated_value)}
                  </td>

                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 text-xs ${
                        staleness.isStale ? "text-amber-400" : "text-zinc-400"
                      }`}
                    >
                      <Clock size={12} />
                      {staleness.label}
                    </span>
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                      >
                        <MessageSquare size={12} />
                        WhatsApp
                      </a>

                      <button
                        type="button"
                        onClick={() => onMarkContacted(contact)}
                        disabled={isUpdating}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-white/[0.08]"
                      >
                        Contacted
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenContact(contact)}
                        className="rounded-lg p-1 text-zinc-500 hover:text-white"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/*
============================================================
VIEW 3: CARDS GRID VIEW
============================================================
*/

function CardsGridView({
  contacts,
  onOpenContact,
  onAdvanceStage,
  onMarkContacted,
  updatingContactId,
}: {
  contacts: CRMContact[];
  onOpenContact: (contact: CRMContact) => void;
  onAdvanceStage: (contact: CRMContact, nextStatus: ContactStatus) => void;
  onMarkContacted: (contact: CRMContact) => void;
  updatingContactId: string | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {contacts.map((contact) => (
        <EnhancedContactCard
          key={contact.id}
          contact={contact}
          onOpen={() => onOpenContact(contact)}
          onMarkContacted={() => onMarkContacted(contact)}
          isUpdating={updatingContactId === contact.id}
        />
      ))}
    </div>
  );
}

function EnhancedContactCard({
  contact,
  onOpen,
  onMarkContacted,
  isUpdating,
}: {
  contact: CRMContact;
  onOpen: () => void;
  onMarkContacted: () => void;
  isUpdating: boolean;
}) {
  const fullName = getFullName(contact);
  const staleness = getStalenessInfo(contact.last_contacted_at);
  const waLink = buildContextualWhatsAppLink(contact);

  return (
    <div className="group rounded-2xl border border-white/[0.07] bg-[#111216] p-5 transition-all hover:-translate-y-1 hover:border-violet-500/20">
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-sm font-semibold text-violet-400">
          {contact.first_name.charAt(0).toUpperCase()}
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={contact.status} />
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">
            {contact.type}
          </span>
        </div>
      </div>

      <h2 className="mt-4 font-semibold text-white">{fullName}</h2>

      <p className="mt-0.5 text-xs text-zinc-400">
        {contact.job_title || contact.type}
      </p>

      {contact.company && (
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
          <Building2 size={14} className="text-zinc-500" />
          <span>{contact.company}</span>
        </div>
      )}

      {contact.email && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
          <Mail size={13} className="text-zinc-600" />
          <span className="truncate">{contact.email}</span>
        </div>
      )}

      {contact.phone && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
          <Phone size={13} className="text-zinc-600" />
          <span>{contact.phone}</span>
        </div>
      )}

      {/* METRICS ROW */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.05] pt-3">
        <div className="rounded-xl border border-white/[0.05] bg-black/20 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Deal Value</p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            {formatUSD(contact.estimated_value)}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.05] bg-black/20 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Last Touch</p>
          <p className={`mt-0.5 text-xs font-medium truncate ${staleness.isStale ? "text-amber-400" : "text-zinc-300"}`}>
            {staleness.label}
          </p>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="mt-4 flex items-center gap-2">
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20"
        >
          <MessageSquare size={13} />
          WhatsApp
        </a>

        <button
          type="button"
          onClick={onMarkContacted}
          disabled={isUpdating}
          className="flex items-center justify-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.08]"
        >
          <UserCheck size={13} />
          Touch
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-400 hover:text-white"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/*
============================================================
STAT CARD
============================================================
*/

function StatCard({
  label,
  value,
  icon: Icon,
  success = false,
  subtitle,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  success?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
      <div className="flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            success ? "bg-emerald-500/10 text-emerald-400" : "bg-violet-500/10 text-violet-400"
          }`}
        >
          <Icon size={18} />
        </div>
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>

      {subtitle && (
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      )}
    </div>
  );
}

function StageDot({ status }: { status: ContactStatus }) {
  const colors: Record<ContactStatus, string> = {
    New: "bg-blue-400",
    Contacted: "bg-violet-400",
    Qualified: "bg-cyan-400",
    Interested: "bg-amber-400",
    Won: "bg-emerald-400",
    Lost: "bg-red-400",
  };

  return <span className={`h-2 w-2 rounded-full ${colors[status]}`} />;
}

function StatusBadge({ status }: { status: ContactStatus }) {
  const styles: Record<ContactStatus, string> = {
    New: "border-blue-500/20 bg-blue-500/10 text-blue-400",
    Contacted: "border-violet-500/20 bg-violet-500/10 text-violet-400",
    Qualified: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
    Interested: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    Won: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    Lost: "border-red-500/20 bg-red-500/10 text-red-400",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

/*
============================================================
CREATE MODAL
============================================================
*/

function CreateContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [type, setType] = useState<ContactType>("Lead");
  const [status, setStatus] = useState<ContactStatus>("New");
  const [source, setSource] = useState("Manual");
  const [estimatedValue, setEstimatedValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function createContact() {
    if (!firstName.trim() || creating) {
      return;
    }

    setCreating(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          company: company.trim(),
          jobTitle: jobTitle.trim(),
          type,
          status,
          source: source.trim() || "Manual",
          estimatedValue: Math.max(0, Number(estimatedValue) || 0),
          notes: notes.trim(),
        }),
      });

      const data = (await response.json()) as CRMResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not create contact.");
      }

      onCreated();
    } catch (error) {
      console.error("CRM create error:", error);
      setErrorMessage("Could not create CRM contact.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <ModalShell
      title="Add CRM Contact"
      subtitle="Create a lead, prospect or enterprise customer."
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="First Name"
          value={firstName}
          onChange={setFirstName}
          required
        />

        <FormField
          label="Last Name"
          value={lastName}
          onChange={setLastName}
        />

        <FormField
          label="Email"
          value={email}
          onChange={setEmail}
        />

        <FormField
          label="Phone"
          value={phone}
          onChange={setPhone}
          placeholder="+1 (555) 000-0000"
        />

        <FormField
          label="Company"
          value={company}
          onChange={setCompany}
        />

        <FormField
          label="Job Title"
          value={jobTitle}
          onChange={setJobTitle}
        />

        <SelectField
          label="Type"
          value={type}
          options={["Lead", "Prospect", "Customer"]}
          onChange={(value) => setType(value as ContactType)}
        />

        <SelectField
          label="Status"
          value={status}
          options={["New", "Contacted", "Qualified", "Interested", "Won", "Lost"]}
          onChange={(value) => setStatus(value as ContactStatus)}
        />

        <FormField
          label="Source"
          value={source}
          onChange={setSource}
        />

        <FormField
          label="Estimated Value (USD)"
          value={estimatedValue}
          onChange={setEstimatedValue}
          type="number"
        />
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
          Notes
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Key deal requirements, conversation takeaways..."
          className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/40"
        />
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {errorMessage}
        </div>
      )}

      <button
        type="button"
        onClick={createContact}
        disabled={creating || !firstName.trim()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
      >
        {creating ? (
          <RefreshCw size={15} className="animate-spin" />
        ) : (
          <Plus size={15} />
        )}
        {creating ? "Creating..." : "Add Contact"}
      </button>
    </ModalShell>
  );
}

/*
============================================================
CONTACT MANAGER MODAL
============================================================
*/

function ContactModal({
  contact,
  onClose,
  onUpdate,
  onDelete,
}: {
  contact: CRMContact;
  onClose: () => void;
  onUpdate: (contact: CRMContact) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [firstName, setFirstName] = useState(contact.first_name);
  const [lastName, setLastName] = useState(contact.last_name ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [jobTitle, setJobTitle] = useState(contact.job_title ?? "");
  const [type, setType] = useState<ContactType>(contact.type);
  const [status, setStatus] = useState<ContactStatus>(contact.status);
  const [source, setSource] = useState(contact.source);
  const [estimatedValue, setEstimatedValue] = useState(String(contact.estimated_value));
  const [notes, setNotes] = useState(contact.notes ?? "");

  const waLink = buildContextualWhatsAppLink(contact);
  const staleness = getStalenessInfo(contact.last_contacted_at);

  async function patchContact(
    body: Record<string, unknown>,
    actionName: string
  ) {
    if (actionLoading) return;

    setActionLoading(actionName);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/crm/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as CRMResponse;

      if (!response.ok || !data.success || !data.contact) {
        throw new Error(data.error || "Could not update contact.");
      }

      onUpdate(data.contact);
      setEditing(false);
    } catch {
      // Optimistic local update fallback
      const updated: CRMContact = {
        ...contact,
        ...(body.status ? { status: body.status as ContactStatus } : {}),
        ...(body.action === "contacted"
          ? {
              status: contact.status === "New" ? "Contacted" : contact.status,
              last_contacted_at: new Date().toISOString(),
            }
          : {}),
        updated_at: new Date().toISOString(),
      };
      onUpdate(updated);
      setEditing(false);
    } finally {
      setActionLoading("");
    }
  }

  async function saveContact() {
    await patchContact(
      {
        action: "update",
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        company: company.trim(),
        jobTitle: jobTitle.trim(),
        type,
        status,
        source: source.trim(),
        estimatedValue: Math.max(0, Number(estimatedValue) || 0),
        notes: notes.trim(),
      },
      "save"
    );
  }

  async function markContacted() {
    await patchContact({ action: "contacted" }, "contacted");
  }

  async function deleteContact() {
    const confirmed = window.confirm(`Delete ${getFullName(contact)}?`);
    if (!confirmed) return;

    setActionLoading("delete");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/crm/${contact.id}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as CRMResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not delete contact.");
      }

      onDelete(contact.id);
    } catch {
      onDelete(contact.id);
    } finally {
      setActionLoading("");
    }
  }

  return (
    <ModalShell
      title={getFullName(contact)}
      subtitle={`${contact.type} • ${contact.status}`}
      onClose={onClose}
    >
      {editing ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="First Name"
              value={firstName}
              onChange={setFirstName}
              required
            />
            <FormField
              label="Last Name"
              value={lastName}
              onChange={setLastName}
            />
            <FormField label="Email" value={email} onChange={setEmail} />
            <FormField label="Phone" value={phone} onChange={setPhone} />
            <FormField label="Company" value={company} onChange={setCompany} />
            <FormField label="Job Title" value={jobTitle} onChange={setJobTitle} />
            <SelectField
              label="Type"
              value={type}
              options={["Lead", "Prospect", "Customer"]}
              onChange={(value) => setType(value as ContactType)}
            />
            <SelectField
              label="Status"
              value={status}
              options={["New", "Contacted", "Qualified", "Interested", "Won", "Lost"]}
              onChange={(value) => setStatus(value as ContactStatus)}
            />
            <FormField label="Source" value={source} onChange={setSource} />
            <FormField
              label="Estimated Value (USD)"
              value={estimatedValue}
              onChange={setEstimatedValue}
              type="number"
            />
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
              Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm outline-none"
            />
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveContact}
              disabled={actionLoading === "save" || !firstName.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
            >
              {actionLoading === "save" ? (
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              {actionLoading === "save" ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBox label="Type" value={contact.type} />
            <InfoBox label="Status" value={contact.status} />
            <InfoBox label="Company" value={contact.company || "—"} />
            <InfoBox label="Job Title" value={contact.job_title || "—"} />
            <InfoBox label="Email" value={contact.email || "—"} />
            <InfoBox label="Phone" value={contact.phone || "—"} />
            <InfoBox label="Source" value={contact.source} />
            <InfoBox label="Estimated Value" value={formatUSD(contact.estimated_value)} />
          </div>

          {/* LAST CONTACTED & QUICK WHATSAPP */}
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Contact Activity Status</p>
                <p className={`mt-1 text-sm font-medium ${staleness.isStale ? "text-amber-400" : "text-zinc-300"}`}>
                  {staleness.label}
                </p>
              </div>

              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
              >
                <MessageSquare size={14} />
                Send Tailored WhatsApp
              </a>
            </div>
          </div>

          {contact.notes && (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs text-zinc-500">Notes</p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">{contact.notes}</p>
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.06]"
            >
              Edit Details
            </button>

            <button
              type="button"
              onClick={markContacted}
              disabled={actionLoading === "contacted"}
              className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-400 disabled:opacity-40"
            >
              {actionLoading === "contacted" ? (
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <UserCheck size={15} />
              )}
              {actionLoading === "contacted" ? "Updating..." : "Mark Contacted Today"}
            </button>
          </div>

          <button
            type="button"
            onClick={deleteContact}
            disabled={actionLoading === "delete"}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 disabled:opacity-40"
          >
            {actionLoading === "delete" ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            {actionLoading === "delete" ? "Deleting..." : "Delete Contact"}
          </button>
        </>
      )}
    </ModalShell>
  );
}

/*
============================================================
MODAL SHELL & REUSABLE FORM ELEMENTS
============================================================
*/

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/[0.07] bg-[#0b0b0e]/95 p-6 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
              J10 NEXUS CRM
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
            <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.05] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
        {required && " *"}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-500/40"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/[0.08] bg-[#111114] px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500/40"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-zinc-200">{value}</p>
    </div>
  );
}

function EmptyCRM({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#111216] px-6 py-16 text-center">
      <Users size={24} className="mx-auto text-violet-400" />
      <h2 className="mt-4 text-lg font-semibold text-white">Your CRM is empty</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
        Add your first enterprise lead or prospect and J10 NEXUS will begin building your customer pipeline.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black"
      >
        <Plus size={15} />
        Add First Contact
      </button>
    </div>
  );
}

function getFullName(contact: CRMContact) {
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    "CRM Contact"
  );
}