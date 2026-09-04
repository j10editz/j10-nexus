import type { ContactStatus, CRMContact, KanbanColumn } from "@/types/crm";

function stripEmojis(text: string): string {
  return text
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{2388}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}]/gu,
      ""
    )
    .trim();
}

/**
 * Builds a direct 1-click WhatsApp deep link with a status-tailored executive follow-up message.
 * Strictly adheres to zero emojis.
 */
export function buildContextualWhatsAppLink(contact: {
  phone?: string | null;
  first_name: string;
  status: ContactStatus;
  company?: string | null;
}): string {
  const cleanPhone = (contact.phone || "").replace(/\D/g, "");
  const name = contact.first_name || "there";
  const org = contact.company ? ` at ${contact.company}` : "";

  let template = "";
  switch (contact.status) {
    case "New":
      template = `Hello ${name}, thank you for connecting with J10 NEXUS${org}. How can our autonomous AI systems support your business objectives today?`;
      break;
    case "Contacted":
      template = `Hi ${name}, following up from J10 NEXUS regarding our operational roadmap. Do you have 10 minutes this week for a concise review?`;
      break;
    case "Qualified":
      template = `Hello ${name}, our team has prepared a tailored enterprise automation proposal for you${org}. When would be the best time to review key milestones?`;
      break;
    case "Interested":
      template = `Hi ${name}, we are excited to partner with you${org}. Would you like us to generate the final deployment contract and onboarding checklist?`;
      break;
    case "Won":
      template = `Hello ${name}, welcome to the J10 NEXUS client ecosystem. How are your active automated workflows performing so far?`;
      break;
    case "Lost":
      template = `Hello ${name}, checking in from J10 NEXUS. We have released new autonomous agent capabilities and would be glad to reconnect when your timing aligns.`;
      break;
    default:
      template = `Hello ${name}, checking in from J10 NEXUS. How can we assist you today?`;
      break;
  }

  const cleanMessage = stripEmojis(template);
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(cleanMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(cleanMessage)}`;
}

/**
 * Computes staleness metrics for a contact based on last_contacted_at.
 */
export function getStalenessInfo(dateString: string | null): {
  label: string;
  isStale: boolean;
  daysAgo: number | null;
} {
  if (!dateString) {
    return { label: "Never contacted", isStale: true, daysAgo: null };
  }

  const then = new Date(dateString).getTime();
  if (isNaN(then)) {
    return { label: "Unknown", isStale: false, daysAgo: null };
  }

  const now = Date.now();
  const diffHours = Math.floor((now - then) / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 24) {
    return { label: "Contacted today", isStale: false, daysAgo: 0 };
  }
  if (diffDays === 1) {
    return { label: "Contacted yesterday", isStale: false, daysAgo: 1 };
  }
  if (diffDays < 7) {
    return { label: `${diffDays} days ago`, isStale: false, daysAgo: diffDays };
  }
  return { label: `${diffDays} days ago (Stale)`, isStale: true, daysAgo: diffDays };
}

/**
 * Groups a list of contacts into Kanban stage columns with summed stage opportunity values.
 */
export function groupContactsByStage(contacts: CRMContact[]): KanbanColumn[] {
  const STAGES: { stage: ContactStatus; label: string }[] = [
    { stage: "New", label: "New Leads" },
    { stage: "Contacted", label: "Contacted" },
    { stage: "Qualified", label: "Qualified" },
    { stage: "Interested", label: "Interested" },
    { stage: "Won", label: "Closed Won" },
    { stage: "Lost", label: "Lost / Inactive" },
  ];

  return STAGES.map(({ stage, label }) => {
    const stageContacts = contacts.filter((c) => c.status === stage);
    const totalValue = stageContacts.reduce(
      (sum, c) => sum + (Number(c.estimated_value) || 0),
      0
    );
    return {
      stage,
      label,
      contacts: stageContacts,
      totalValue,
    };
  });
}

/**
 * Format currency in USD.
 */
export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export const SEED_CRM_CONTACTS: CRMContact[] = [
  {
    id: "crm-seed-1",
    user_id: "system",
    first_name: "Elena",
    last_name: "Vance",
    email: "elena.vance@apexcapital.com",
    phone: "+1 (555) 392-1084",
    company: "Apex Capital Growth",
    job_title: "Managing Director",
    type: "Prospect",
    status: "Interested",
    source: "Inbound WhatsApp",
    estimated_value: 28500,
    notes: "Requires autonomous outbound qualification agent and custom Stripe billing pipeline.",
    last_contacted_at: new Date(Date.now() - 3600000 * 5).toISOString(), // 5 hours ago
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "crm-seed-2",
    user_id: "system",
    first_name: "Marcus",
    last_name: "Thorne",
    email: "marcus@thorneindustries.io",
    phone: "+1 (555) 749-8120",
    company: "Thorne Global Logistics",
    job_title: "VP of Operations",
    type: "Customer",
    status: "Won",
    source: "Executive Referral",
    estimated_value: 45000,
    notes: "Active annual enterprise contract. 3 WhatsApp automated agents live.",
    last_contacted_at: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
    created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "crm-seed-3",
    user_id: "system",
    first_name: "Sophia",
    last_name: "Kovacs",
    email: "sophia@novabiotech.de",
    phone: "+1 (555) 238-9411",
    company: "Nova BioTech",
    job_title: "Head of Product",
    type: "Lead",
    status: "Qualified",
    source: "Web Funnel",
    estimated_value: 17500,
    notes: "Passed AI lead qualification quiz with 94% match score.",
    last_contacted_at: new Date(Date.now() - 86400000 * 8).toISOString(), // 8 days ago (stale)
    created_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "crm-seed-4",
    user_id: "system",
    first_name: "David",
    last_name: "Sterling",
    email: "david@sterlingholdings.com",
    phone: "+1 (555) 831-6204",
    company: "Sterling Holdings",
    job_title: "Chief Investment Officer",
    type: "Lead",
    status: "New",
    source: "AI Marketing Broadcast",
    estimated_value: 32000,
    notes: "Responded to Q3 Automation Webinar broadcast with request for pricing deck.",
    last_contacted_at: null,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
];
