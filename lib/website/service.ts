import type { WebsiteFunnel } from "@/types/website";

export function stripEmojis(text?: string | null): string {
  if (!text) return "";
  // Removes unicode emoji ranges, pictographs, symbols, dingbats, variation selectors, and zero-width joiners
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{FE00}-\u{FE0F}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{200D}\u{20E3}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildWhatsAppClickToChatLink(phone?: string | null, message?: string): string {
  const cleanPhone = (phone || "").replace(/\D/g, "");
  const defaultMsg = stripEmojis(message || "Hello! I am interested in learning more about your services.");
  if (!cleanPhone) {
    return `https://wa.me/?text=${encodeURIComponent(defaultMsg)}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultMsg)}`;
}

export function getDefaultWebsiteFunnel(brandName: string = "J10 NEXUS"): Omit<WebsiteFunnel, "id" | "userId" | "createdAt" | "updatedAt"> {
  return {
    title: `${brandName} Official Landing Page`,
    slug: "main",
    theme: "obsidian",
    customDomain: null,
    isPublished: true,
    heroHeadline: `Accelerate Growth with ${brandName} AI Automation`,
    heroSubheadline: "Deploy autonomous WhatsApp sales bots, capture qualified leads into CRM, and streamline client invoicing 24/7.",
    primaryCtaText: "Message Us on WhatsApp",
    primaryCtaLink: "https://wa.me/",
    features: [
      {
        title: "24/7 WhatsApp Conversational Sales",
        description: "Respond instantly to inquiries, qualify inbound prospects, and close deals in real time.",
        icon: "MessageSquare",
      },
      {
        title: "Company Knowledge Grounding",
        description: "Verified answers backed by your live product documentation and company business rules.",
        icon: "Brain",
      },
      {
        title: "Integrated CRM & Instant Invoicing",
        description: "Turn conversations into tracked deals and issue Stripe-enabled payment links automatically.",
        icon: "DollarSign",
      },
    ],
    testimonials: [
      {
        name: "[Client Reference 1]",
        company: "[Partner Organization]",
        quote: "Insert your verified customer quotation here describing your operational engagement and lead response improvements.",
        rating: 5,
      },
      {
        name: "[Client Reference 2]",
        company: "[Growth Agency]",
        quote: "Insert your verified customer quotation here describing autonomous agent workflows and CRM productivity.",
        rating: 5,
      },
    ],
    faqs: [
      {
        question: "How quickly can we go live?",
        answer: "You can connect your WhatsApp number and upload your company documentation in under 10 minutes.",
      },
      {
        question: "How are agent responses grounded in company truth?",
        answer: "All agent replies are grounded in your verified Company Knowledge Hub documents and pricing tables.",
      },
    ],
    seoTitle: `${brandName} - Autonomous Business Operating System`,
    seoDescription: "Transform operations with autonomous WhatsApp sales agents, CRM intelligence, and multi-agent workflows.",
  };
}
