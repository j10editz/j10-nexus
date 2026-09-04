import type {
  InboxChannel,
  InboxDealStage,
  InboxFilterOptions,
  InboxMessage,
  InboxThread,
  SendReplyInput,
} from "@/types/inbox";

export const CHANNEL_METADATA: Record<
  InboxChannel,
  { label: string; badgeClass: string }
> = {
  whatsapp: {
    label: "WhatsApp Business",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  website: {
    label: "Website Lead Form",
    badgeClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  },
  crm: {
    label: "CRM Direct Desk",
    badgeClass: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
};

export const STAGE_METADATA: Record<
  InboxDealStage,
  { label: string; badgeClass: string }
> = {
  lead: {
    label: "Lead",
    badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-700",
  },
  qualified: {
    label: "Qualified",
    badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  proposal: {
    label: "Proposal",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  won: {
    label: "Closed Won",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  churned: {
    label: "Lost / Churned",
    badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
};

export const SEED_INBOX_THREADS: InboxThread[] = [
  {
    id: "thread-wa-1",
    contactName: "Marcus Sterling",
    contactIdentifier: "+14155552671",
    company: "Aegis Capital",
    channel: "whatsapp",
    priority: "urgent",
    dealStage: "proposal",
    estimatedValue: 18500,
    unreadCount: 1,
    assignedSpecialist: "Sarah Chen (Sales Specialist)",
    lastMessageSnippet: "Can you send the payment link for the Enterprise AI rollout today? We are ready to execute.",
    lastMessageTimestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    messages: [
      {
        id: "msg-wa-101",
        threadId: "thread-wa-1",
        direction: "inbound",
        sender: "+14155552671",
        senderName: "Marcus Sterling",
        body: "Hello Sarah, we reviewed the J10 NEXUS autonomous workforce proposal for our trading desk.",
        timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
        status: "read",
      },
      {
        id: "msg-wa-102",
        threadId: "thread-wa-1",
        direction: "outbound",
        sender: "agent",
        senderName: "Sarah Chen",
        body: "Glad to hear from you Marcus. The package includes 3 dedicated autonomous agents, custom CRM integration, and 24/7 Group Guardian security.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        status: "read",
      },
      {
        id: "msg-wa-103",
        threadId: "thread-wa-1",
        direction: "inbound",
        sender: "+14155552671",
        senderName: "Marcus Sterling",
        body: "Can you send the payment link for the Enterprise AI rollout today? We are ready to execute.",
        timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        status: "delivered",
      },
    ],
  },
  {
    id: "thread-web-2",
    contactName: "Dr. Evelyn Vance",
    contactIdentifier: "evelyn.vance@vancebiotech.com",
    company: "Vance BioTech",
    channel: "website",
    priority: "high",
    dealStage: "qualified",
    estimatedValue: 12000,
    unreadCount: 1,
    assignedSpecialist: "Alex Vance (Marketing Agent)",
    lastMessageSnippet: "Inbound funnel form submitted from Agency Accelerator landing page.",
    lastMessageTimestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    messages: [
      {
        id: "msg-web-201",
        threadId: "thread-web-2",
        direction: "inbound",
        sender: "website-lead-form",
        senderName: "Dr. Evelyn Vance",
        body: "We need autonomous customer intake triage and WhatsApp qualification for our international research team. Current response delay is 18 hours.",
        timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        status: "read",
        metadata: {
          leadFormDetails: {
            Funnel: "Agency Accelerator Funnel",
            TeamSize: "50-100 employees",
            MonthlyBudget: "$10,000+",
          },
        },
      },
    ],
  },
  {
    id: "thread-crm-3",
    contactName: "Liam O'Connor",
    contactIdentifier: "+12125559812",
    company: "Nova Retail Group",
    channel: "crm",
    priority: "medium",
    dealStage: "lead",
    estimatedValue: 8400,
    unreadCount: 0,
    assignedSpecialist: "Elena Rostova (Customer Support)",
    lastMessageSnippet: "Understood. Let us schedule the integration kickoff for Tuesday.",
    lastMessageTimestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    messages: [
      {
        id: "msg-crm-301",
        threadId: "thread-crm-3",
        direction: "inbound",
        sender: "+12125559812",
        senderName: "Liam O'Connor",
        body: "Does J10 NEXUS support real-time inventory synchronization with Shopify and direct WhatsApp click-to-pay links?",
        timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
        status: "read",
      },
      {
        id: "msg-crm-302",
        threadId: "thread-crm-3",
        direction: "outbound",
        sender: "agent",
        senderName: "Elena Rostova",
        body: "Yes Liam, our Commerce Hub generates automated Click-to-Pay deep links and verifies Stripe checkout sessions instantly.",
        timestamp: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
        status: "read",
      },
      {
        id: "msg-crm-303",
        threadId: "thread-crm-3",
        direction: "inbound",
        sender: "+12125559812",
        senderName: "Liam O'Connor",
        body: "Understood. Let us schedule the integration kickoff for Tuesday.",
        timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        status: "read",
      },
    ],
  },
  {
    id: "thread-wa-4",
    contactName: "Sofia Ramirez",
    contactIdentifier: "+17865554321",
    company: "Nexus Freight Solutions",
    channel: "whatsapp",
    priority: "medium",
    dealStage: "won",
    estimatedValue: 24000,
    unreadCount: 0,
    assignedSpecialist: "Sarah Chen (Sales Specialist)",
    lastMessageSnippet: "Stripe invoice for $24,000 paid. Access provisioned.",
    lastMessageTimestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    messages: [
      {
        id: "msg-wa-401",
        threadId: "thread-wa-4",
        direction: "outbound",
        sender: "system",
        senderName: "J10 Stripe Billing",
        body: "Invoice payment verified for Annual Enterprise License ($24,000). Receipt generated.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        status: "read",
        metadata: {
          stripeCheckoutUrl: "https://checkout.stripe.com/c/pay/cs_live_nexus_enterprise",
          amount: 24000,
          currency: "USD",
          productName: "Annual Enterprise License",
        },
      },
    ],
  },
];

export function filterInboxThreads(
  threads: InboxThread[],
  options: InboxFilterOptions,
): InboxThread[] {
  return threads.filter((thread) => {
    if (options.channel !== "all" && thread.channel !== options.channel) {
      return false;
    }

    if (options.stage !== "all" && thread.dealStage !== options.stage) {
      return false;
    }

    if (options.priorityOnly && thread.priority !== "urgent" && thread.priority !== "high") {
      return false;
    }

    if (options.search) {
      const q = options.search.toLowerCase().trim();
      const matchName = thread.contactName.toLowerCase().includes(q);
      const matchCompany = (thread.company || "").toLowerCase().includes(q);
      const matchIdentifier = thread.contactIdentifier.toLowerCase().includes(q);
      const matchSnippet = thread.lastMessageSnippet.toLowerCase().includes(q);
      if (!matchName && !matchCompany && !matchIdentifier && !matchSnippet) {
        return false;
      }
    }

    return true;
  });
}

export function advanceThreadStage(
  thread: InboxThread,
  newStage: InboxDealStage,
): InboxThread {
  return {
    ...thread,
    dealStage: newStage,
  };
}

export function appendThreadReply(
  thread: InboxThread,
  input: SendReplyInput,
): InboxThread {
  const newMessage: InboxMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    threadId: thread.id,
    direction: "outbound",
    sender: "agent",
    senderName: input.agentName || "Executive Agent",
    body: input.body,
    timestamp: new Date().toISOString(),
    status: "sent",
    metadata: input.stripePayment
      ? {
          stripeCheckoutUrl: input.stripePayment.checkoutUrl,
          amount: input.stripePayment.amount,
          currency: "USD",
          productName: input.stripePayment.productName,
        }
      : undefined,
  };

  return {
    ...thread,
    lastMessageSnippet: input.body,
    lastMessageTimestamp: newMessage.timestamp,
    unreadCount: 0,
    messages: [...thread.messages, newMessage],
  };
}

export function buildWhatsAppReplyLink(
  phoneNumber: string,
  messageText: string,
): string {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(messageText)}`;
}

export function generateAICopilotDraft(
  thread: InboxThread,
  objective: "payment_request" | "deal_follow_up" | "objection_handling",
): string {
  const name = thread.contactName.split(" ")[0];
  const company = thread.company || "your organization";

  switch (objective) {
    case "payment_request":
      return `Hello ${name}, thank you for confirming the rollout scope for ${company}. Here is the direct Stripe checkout link for instant processing and immediate deployment.`;
    case "deal_follow_up":
      return `Hi ${name}, following up on our discussion regarding autonomous workflow optimization for ${company}. Our technical team is prepared to activate your integration this week. When is the best time for a 15-minute briefing?`;
    case "objection_handling":
      return `Understood, ${name}. J10 NEXUS is architected specifically with enterprise data isolation and controlled human approvals, ensuring total governance over all autonomous operations. We are happy to review the security architecture directly.`;
    default:
      return `Hello ${name}, thank you for contacting J10 NEXUS. How can we best assist ${company} today?`;
  }
}
