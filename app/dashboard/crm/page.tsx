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
} from "lucide-react";

import CRMIntelligencePanel from "@/components/crm/CRMIntelligencePanel";

type ContactType =
  | "Lead"
  | "Prospect"
  | "Customer";

type ContactStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Interested"
  | "Won"
  | "Lost";

type CRMContact = {
  id: string;
  user_id: string;

  first_name: string;
  last_name: string | null;

  email: string | null;
  phone: string | null;

  company: string | null;
  job_title: string | null;

  type: ContactType;
  status: ContactStatus;

  source: string;

  estimated_value: number;

  notes: string | null;

  last_contacted_at:
    | string
    | null;

  created_at: string;
  updated_at: string;
};

type CRMSummary = {
  total: number;
  leads: number;
  prospects: number;
  customers: number;
  new: number;
  qualified: number;
  won: number;
  lost: number;
  pipelineValue: number;
  wonValue: number;
};

type CRMResponse = {
  success: boolean;

  contacts?: CRMContact[];

  contact?: CRMContact;

  summary?: CRMSummary;

  message?: string;
  error?: string;
};

const statusOptions = [
  "All",
  "New",
  "Contacted",
  "Qualified",
  "Interested",
  "Won",
  "Lost",
];

const typeOptions = [
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

export default function CRMPage() {
  const [
    contacts,
    setContacts,
  ] = useState<CRMContact[]>(
    []
  );

  const [
    summary,
    setSummary,
  ] =
    useState<CRMSummary>(
      emptySummary
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("All");

  const [
    typeFilter,
    setTypeFilter,
  ] = useState("All");

  const [
    createOpen,
    setCreateOpen,
  ] = useState(false);

  const [
    selectedContact,
    setSelectedContact,
  ] =
    useState<CRMContact | null>(
      null
    );

  /*
  ============================================================
  J10 CRM INTELLIGENCE REFRESH
  ============================================================
  */

  const [
    intelligenceRefreshKey,
    setIntelligenceRefreshKey,
  ] = useState(0);

  function refreshIntelligence() {
    setIntelligenceRefreshKey(
      (current) =>
        current + 1
    );
  }

  /*
  ============================================================
  LOAD CRM
  ============================================================
  */

  const loadCRM =
    useCallback(async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response =
          await fetch(
            "/api/crm",
            {
              method: "GET",
              cache: "no-store",
            }
          );

        const data =
          (await response.json()) as CRMResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Could not load CRM."
          );
        }

        setContacts(
          data.contacts ?? []
        );

        setSummary(
          data.summary ??
            emptySummary
        );
      } catch (error) {
        console.error(
          "CRM load error:",
          error
        );

        setErrorMessage(
          "Could not load CRM data."
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadCRM();
  }, [loadCRM]);

  /*
  ============================================================
  FILTERS
  ============================================================
  */

  const filteredContacts =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return contacts.filter(
        (contact) => {
          const fullName =
            `${contact.first_name} ${
              contact.last_name ?? ""
            }`.toLowerCase();

          const matchesSearch =
            !query ||
            fullName.includes(
              query
            ) ||
            (
              contact.email ?? ""
            )
              .toLowerCase()
              .includes(query) ||
            (
              contact.company ?? ""
            )
              .toLowerCase()
              .includes(query) ||
            (
              contact.phone ?? ""
            ).includes(query);

          const matchesStatus =
            statusFilter ===
              "All" ||
            contact.status ===
              statusFilter;

          const matchesType =
            typeFilter === "All" ||
            contact.type ===
              typeFilter;

          return (
            matchesSearch &&
            matchesStatus &&
            matchesType
          );
        }
      );
    }, [
      contacts,
      search,
      statusFilter,
      typeFilter,
    ]);

  /*
  ============================================================
  CONTACT UPDATED
  ============================================================
  */

  function updateContactInState(
    contact: CRMContact
  ) {
    setContacts(
      (current) =>
        current.map(
          (item) =>
            item.id ===
            contact.id
              ? contact
              : item
        )
    );

    setSelectedContact(
      contact
    );

    refreshIntelligence();

    void loadCRM();
  }

  /*
  ============================================================
  CONTACT DELETED
  ============================================================
  */

  function deleteContactFromState(
    id: string
  ) {
    setContacts(
      (current) =>
        current.filter(
          (contact) =>
            contact.id !== id
        )
    );

    setSelectedContact(
      null
    );

    refreshIntelligence();

    void loadCRM();
  }

  /*
  ============================================================
  MANUAL REFRESH
  ============================================================
  */

  function refreshCRM() {
    refreshIntelligence();
    void loadCRM();
  }

  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-8">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              CUSTOMER INTELLIGENCE
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              CRM
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Manage leads,
              prospects, customers,
              pipeline value and sales
              activity across J10 NEXUS.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setCreateOpen(true)
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            <Plus size={16} />

            Add Contact

            <ChevronRight
              size={14}
            />
          </button>
        </div>

        {/* STATS */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Contacts"
            value={String(
              summary.total
            )}
            icon={Users}
          />

          <StatCard
            label="Active Leads"
            value={String(
              summary.leads +
                summary.prospects
            )}
            icon={Contact}
          />

          <StatCard
            label="Pipeline Value"
            value={formatMoney(
              summary.pipelineValue
            )}
            icon={
              CircleDollarSign
            }
          />

          <StatCard
            label="Revenue Won"
            value={formatMoney(
              summary.wonValue
            )}
            icon={
              CheckCircle2
            }
            success
          />
        </div>

        {/* PIPELINE */}
        <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <PipelineCard
            label="New"
            value={summary.new}
          />

          <PipelineCard
            label="Contacted"
            value={
              contacts.filter(
                (contact) =>
                  contact.status ===
                  "Contacted"
              ).length
            }
          />

          <PipelineCard
            label="Qualified"
            value={
              summary.qualified
            }
          />

          <PipelineCard
            label="Interested"
            value={
              contacts.filter(
                (contact) =>
                  contact.status ===
                  "Interested"
              ).length
            }
          />

          <PipelineCard
            label="Won"
            value={summary.won}
            success
          />

          <PipelineCard
            label="Lost"
            value={summary.lost}
            danger
          />
        </div>

        {/* J10 AI CRM INTELLIGENCE */}
        <div className="mt-8">
          <CRMIntelligencePanel
            refreshKey={
              intelligenceRefreshKey
            }
          />
        </div>

        {/* FILTERS */}
        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search contacts..."
              className="w-full rounded-xl border border-white/[0.07] bg-[#111216] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-500/30"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(
                  event.target.value
                )
              }
              className="rounded-xl border border-white/[0.07] bg-[#111216] px-4 py-3 text-sm text-zinc-300 outline-none"
            >
              {typeOptions.map(
                (type) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {type === "All"
                      ? "All Types"
                      : type}
                  </option>
                )
              )}
            </select>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
              className="rounded-xl border border-white/[0.07] bg-[#111216] px-4 py-3 text-sm text-zinc-300 outline-none"
            >
              {statusOptions.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status === "All"
                      ? "All Statuses"
                      : status}
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              onClick={
                refreshCRM
              }
              disabled={loading}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-[#111216] text-zinc-500 transition hover:text-white disabled:opacity-40"
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "animate-spin"
                    : ""
                }
              />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {/* CONTACTS */}
        <div className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map(
                (item) => (
                  <div
                    key={item}
                    className="h-[270px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]"
                  />
                )
              )}
            </div>
          ) : filteredContacts.length ===
            0 ? (
            <EmptyCRM
              onCreate={() =>
                setCreateOpen(
                  true
                )
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredContacts.map(
                (contact) => (
                  <ContactCard
                    key={
                      contact.id
                    }
                    contact={
                      contact
                    }
                    onOpen={() =>
                      setSelectedContact(
                        contact
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* CREATE */}
      {createOpen && (
        <CreateContactModal
          onClose={() =>
            setCreateOpen(false)
          }
          onCreated={() => {
            setCreateOpen(false);

            refreshIntelligence();

            void loadCRM();
          }}
        />
      )}

      {/* MANAGE */}
      {selectedContact && (
        <ContactModal
          contact={
            selectedContact
          }
          onClose={() =>
            setSelectedContact(
              null
            )
          }
          onUpdate={
            updateContactInState
          }
          onDelete={
            deleteContactFromState
          }
        />
      )}
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
}: {
  label: string;
  value: string;
  icon: typeof Users;
  success?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          success
            ? "bg-emerald-500/10"
            : "bg-blue-500/10"
        }`}
      >
        <Icon
          size={17}
          className={
            success
              ? "text-emerald-400"
              : "text-blue-400"
          }
        />
      </div>

      <p className="mt-5 text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-semibold">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
PIPELINE
============================================================
*/

function PipelineCard({
  label,
  value,
  success = false,
  danger = false,
}: {
  label: string;
  value: number;
  success?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111216] px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-600">
          {label}
        </p>

        <span
          className={`h-2 w-2 rounded-full ${
            success
              ? "bg-emerald-400"
              : danger
                ? "bg-red-400"
                : "bg-violet-400"
          }`}
        />
      </div>

      <p className="mt-2 text-lg font-semibold">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
CONTACT CARD
============================================================
*/

function ContactCard({
  contact,
  onOpen,
}: {
  contact: CRMContact;
  onOpen: () => void;
}) {
  const fullName =
    getFullName(contact);

  return (
    <div className="group rounded-2xl border border-white/[0.07] bg-[#111216] p-5 transition-all hover:-translate-y-1 hover:border-violet-500/20">
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-sm font-semibold text-violet-400">
          {contact.first_name
            .charAt(0)
            .toUpperCase()}
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge
            status={
              contact.status
            }
          />

          <MoreHorizontal
            size={16}
            className="text-zinc-700"
          />
        </div>
      </div>

      <h2 className="mt-5 font-semibold">
        {fullName}
      </h2>

      <p className="mt-1 text-xs text-zinc-600">
        {contact.job_title ||
          contact.type}
      </p>

      {contact.company && (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <Building2
            size={14}
          />

          {contact.company}
        </div>
      )}

      {contact.email && (
        <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
          <Mail size={14} />

          {contact.email}
        </div>
      )}

      {contact.phone && (
        <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
          <Phone size={14} />

          {contact.phone}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <InfoBox
          label="Type"
          value={contact.type}
        />

        <InfoBox
          label="Value"
          value={formatMoney(
            contact.estimated_value
          )}
        />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
      >
        Manage Contact

        <ChevronRight
          size={14}
        />
      </button>
    </div>
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
  const [
    firstName,
    setFirstName,
  ] = useState("");

  const [
    lastName,
    setLastName,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    phone,
    setPhone,
  ] = useState("");

  const [
    company,
    setCompany,
  ] = useState("");

  const [
    jobTitle,
    setJobTitle,
  ] = useState("");

  const [
    type,
    setType,
  ] =
    useState<ContactType>(
      "Lead"
    );

  const [
    status,
    setStatus,
  ] =
    useState<ContactStatus>(
      "New"
    );

  const [
    source,
    setSource,
  ] = useState("Manual");

  const [
    estimatedValue,
    setEstimatedValue,
  ] = useState("0");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    creating,
    setCreating,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  async function createContact() {
    if (
      !firstName.trim() ||
      creating
    ) {
      return;
    }

    setCreating(true);
    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/crm",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              firstName:
                firstName.trim(),

              lastName:
                lastName.trim(),

              email:
                email.trim(),

              phone:
                phone.trim(),

              company:
                company.trim(),

              jobTitle:
                jobTitle.trim(),

              type,

              status,

              source:
                source.trim() ||
                "Manual",

              estimatedValue:
                Math.max(
                  0,
                  Number(
                    estimatedValue
                  ) || 0
                ),

              notes:
                notes.trim(),
            }),
          }
        );

      const data =
        (await response.json()) as CRMResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not create contact."
        );
      }

      onCreated();
    } catch (error) {
      console.error(
        "CRM create error:",
        error
      );

      setErrorMessage(
        "Could not create CRM contact."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <ModalShell
      title="Add CRM Contact"
      subtitle="Create a lead, prospect or customer."
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="First Name"
          value={firstName}
          onChange={
            setFirstName
          }
          required
        />

        <FormField
          label="Last Name"
          value={lastName}
          onChange={
            setLastName
          }
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
          options={[
            "Lead",
            "Prospect",
            "Customer",
          ]}
          onChange={(value) =>
            setType(
              value as ContactType
            )
          }
        />

        <SelectField
          label="Status"
          value={status}
          options={[
            "New",
            "Contacted",
            "Qualified",
            "Interested",
            "Won",
            "Lost",
          ]}
          onChange={(value) =>
            setStatus(
              value as ContactStatus
            )
          }
        />

        <FormField
          label="Source"
          value={source}
          onChange={setSource}
        />

        <FormField
          label="Estimated Value"
          value={estimatedValue}
          onChange={
            setEstimatedValue
          }
          type="number"
        />
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
          Notes
        </label>

        <textarea
          rows={4}
          value={notes}
          onChange={(event) =>
            setNotes(
              event.target.value
            )
          }
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
        onClick={
          createContact
        }
        disabled={
          creating ||
          !firstName.trim()
        }
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
      >
        {creating ? (
          <RefreshCw
            size={15}
            className="animate-spin"
          />
        ) : (
          <Plus size={15} />
        )}

        {creating
          ? "Creating..."
          : "Add Contact"}
      </button>
    </ModalShell>
  );
}

/*
============================================================
CONTACT MANAGER
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

  onUpdate: (
    contact: CRMContact
  ) => void;

  onDelete: (
    id: string
  ) => void;
}) {
  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    actionLoading,
    setActionLoading,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    firstName,
    setFirstName,
  ] = useState(
    contact.first_name
  );

  const [
    lastName,
    setLastName,
  ] = useState(
    contact.last_name ?? ""
  );

  const [
    email,
    setEmail,
  ] = useState(
    contact.email ?? ""
  );

  const [
    phone,
    setPhone,
  ] = useState(
    contact.phone ?? ""
  );

  const [
    company,
    setCompany,
  ] = useState(
    contact.company ?? ""
  );

  const [
    jobTitle,
    setJobTitle,
  ] = useState(
    contact.job_title ?? ""
  );

  const [
    type,
    setType,
  ] = useState<ContactType>(
    contact.type
  );

  const [
    status,
    setStatus,
  ] =
    useState<ContactStatus>(
      contact.status
    );

  const [
    source,
    setSource,
  ] = useState(
    contact.source
  );

  const [
    estimatedValue,
    setEstimatedValue,
  ] = useState(
    String(
      contact.estimated_value
    )
  );

  const [
    notes,
    setNotes,
  ] = useState(
    contact.notes ?? ""
  );

  async function patchContact(
    body: Record<
      string,
      unknown
    >,
    actionName: string
  ) {
    if (actionLoading) {
      return;
    }

    setActionLoading(
      actionName
    );

    setErrorMessage("");

    try {
      const response =
        await fetch(
          `/api/crm/${contact.id}`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                body
              ),
          }
        );

      const data =
        (await response.json()) as CRMResponse;

      if (
        !response.ok ||
        !data.success ||
        !data.contact
      ) {
        throw new Error(
          data.error ||
            "Could not update contact."
        );
      }

      onUpdate(
        data.contact
      );

      setEditing(false);
    } catch (error) {
      console.error(
        "CRM update error:",
        error
      );

      setErrorMessage(
        "Could not update contact."
      );
    } finally {
      setActionLoading("");
    }
  }

  async function saveContact() {
    await patchContact(
      {
        action: "update",

        firstName:
          firstName.trim(),

        lastName:
          lastName.trim(),

        email:
          email.trim(),

        phone:
          phone.trim(),

        company:
          company.trim(),

        jobTitle:
          jobTitle.trim(),

        type,

        status,

        source:
          source.trim(),

        estimatedValue:
          Math.max(
            0,
            Number(
              estimatedValue
            ) || 0
          ),

        notes:
          notes.trim(),
      },
      "save"
    );
  }

  async function markContacted() {
    await patchContact(
      {
        action:
          "contacted",
      },
      "contacted"
    );
  }

  async function deleteContact() {
    const confirmed =
      window.confirm(
        `Delete ${getFullName(
          contact
        )}?`
      );

    if (!confirmed) {
      return;
    }

    setActionLoading(
      "delete"
    );

    setErrorMessage("");

    try {
      const response =
        await fetch(
          `/api/crm/${contact.id}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        (await response.json()) as CRMResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not delete contact."
        );
      }

      onDelete(
        contact.id
      );
    } catch (error) {
      console.error(
        "CRM delete error:",
        error
      );

      setErrorMessage(
        "Could not delete contact."
      );
    } finally {
      setActionLoading("");
    }
  }

  return (
    <ModalShell
      title={getFullName(
        contact
      )}
      subtitle={`${contact.type} • ${contact.status}`}
      onClose={onClose}
    >
      {editing ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="First Name"
              value={firstName}
              onChange={
                setFirstName
              }
              required
            />

            <FormField
              label="Last Name"
              value={lastName}
              onChange={
                setLastName
              }
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
              options={[
                "Lead",
                "Prospect",
                "Customer",
              ]}
              onChange={(value) =>
                setType(
                  value as ContactType
                )
              }
            />

            <SelectField
              label="Status"
              value={status}
              options={[
                "New",
                "Contacted",
                "Qualified",
                "Interested",
                "Won",
                "Lost",
              ]}
              onChange={(value) =>
                setStatus(
                  value as ContactStatus
                )
              }
            />

            <FormField
              label="Source"
              value={source}
              onChange={setSource}
            />

            <FormField
              label="Estimated Value"
              value={estimatedValue}
              onChange={
                setEstimatedValue
              }
              type="number"
            />
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
              Notes
            </label>

            <textarea
              rows={4}
              value={notes}
              onChange={(event) =>
                setNotes(
                  event.target.value
                )
              }
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
              onClick={() =>
                setEditing(false)
              }
              className="flex-1 rounded-xl border border-white/[0.08] px-4 py-3 text-sm text-zinc-400"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={
                saveContact
              }
              disabled={
                actionLoading ===
                  "save" ||
                !firstName.trim()
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
            >
              {actionLoading ===
              "save" ? (
                <RefreshCw
                  size={15}
                  className="animate-spin"
                />
              ) : (
                <Save size={15} />
              )}

              {actionLoading ===
              "save"
                ? "Saving..."
                : "Save Changes"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBox
              label="Type"
              value={
                contact.type
              }
            />

            <InfoBox
              label="Status"
              value={
                contact.status
              }
            />

            <InfoBox
              label="Company"
              value={
                contact.company ||
                "—"
              }
            />

            <InfoBox
              label="Job Title"
              value={
                contact.job_title ||
                "—"
              }
            />

            <InfoBox
              label="Email"
              value={
                contact.email ||
                "—"
              }
            />

            <InfoBox
              label="Phone"
              value={
                contact.phone ||
                "—"
              }
            />

            <InfoBox
              label="Source"
              value={
                contact.source
              }
            />

            <InfoBox
              label="Estimated Value"
              value={formatMoney(
                contact.estimated_value
              )}
            />
          </div>

          {contact.notes && (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs text-zinc-600">
                Notes
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {contact.notes}
              </p>
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
              onClick={() =>
                setEditing(true)
              }
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 hover:bg-white/[0.06]"
            >
              Edit Contact
            </button>

            <button
              type="button"
              onClick={
                markContacted
              }
              disabled={
                actionLoading ===
                "contacted"
              }
              className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 disabled:opacity-40"
            >
              {actionLoading ===
              "contacted" ? (
                <RefreshCw
                  size={15}
                  className="animate-spin"
                />
              ) : (
                <UserCheck
                  size={15}
                />
              )}

              {actionLoading ===
              "contacted"
                ? "Updating..."
                : "Mark Contacted"}
            </button>
          </div>

          <button
            type="button"
            onClick={
              deleteContact
            }
            disabled={
              actionLoading ===
              "delete"
            }
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 disabled:opacity-40"
          >
            {actionLoading ===
            "delete" ? (
              <RefreshCw
                size={15}
                className="animate-spin"
              />
            ) : (
              <Trash2
                size={15}
              />
            )}

            {actionLoading ===
            "delete"
              ? "Deleting..."
              : "Delete Contact"}
          </button>
        </>
      )}
    </ModalShell>
  );
}

/*
============================================================
MODAL
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

            <h2 className="mt-2 text-xl font-semibold">
              {title}
            </h2>

            <p className="mt-1 text-sm text-zinc-600">
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-600 hover:bg-white/[0.05] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/*
============================================================
FIELDS
============================================================
*/

function FormField({
  label,
  value,
  onChange,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  required?: boolean;
  type?: string;
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
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/40"
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
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white outline-none"
      >
        {options.map(
          (option) => (
            <option
              key={option}
              value={option}
            >
              {option}
            </option>
          )
        )}
      </select>
    </div>
  );
}

/*
============================================================
SMALL COMPONENTS
============================================================
*/

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <p className="text-[10px] text-zinc-600">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-medium text-zinc-300">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: ContactStatus;
}) {
  const styles: Record<
    ContactStatus,
    string
  > = {
    New:
      "border-blue-500/20 bg-blue-500/10 text-blue-400",

    Contacted:
      "border-violet-500/20 bg-violet-500/10 text-violet-400",

    Qualified:
      "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",

    Interested:
      "border-amber-500/20 bg-amber-500/10 text-amber-400",

    Won:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",

    Lost:
      "border-red-500/20 bg-red-500/10 text-red-400",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function EmptyCRM({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#111216] px-6 py-16 text-center">
      <Users
        size={22}
        className="mx-auto text-violet-400"
      />

      <h2 className="mt-5 text-lg font-semibold">
        Your CRM is empty
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
        Add your first lead and J10
        NEXUS will begin building your
        customer pipeline.
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

/*
============================================================
HELPERS
============================================================
*/

function getFullName(
  contact: CRMContact
) {
  return (
    [
      contact.first_name,
      contact.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "CRM Contact"
  );
}

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }
  ).format(
    Number(value ?? 0)
  );
}