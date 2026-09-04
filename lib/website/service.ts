import type { WebsiteFunnel } from "@/types/website";

export function buildWhatsAppClickToChatLink(phone?: string | null, message?: string): string {
  const cleanPhone = (phone || "").replace(/\D/g, "");
  const defaultMsg = message || "Hello! I am interested in learning more about your services.";
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
        description: "Zero hallucination answers backed by your live product documentation and verified pricing.",
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
        name: "David Chen",
        company: "Apex Global Ventures",
        quote: "Our lead response time dropped from 4 hours to 8 seconds. We closed $45,000 in additional sales in our first month.",
        rating: 5,
      },
      {
        name: "Elena Rostova",
        company: "Kinetix Growth Studio",
        quote: "The hybrid team model is unmatched. One human operator manages 4 autonomous agents effortlessly.",
        rating: 5,
      },
    ],
    faqs: [
      {
        question: "How quickly can we go live?",
        answer: "You can connect your WhatsApp number and upload your company documentation in under 10 minutes.",
      },
      {
        question: "Does the AI ever hallucinate or make up false pricing?",
        answer: "No. All agent replies are strictly grounded in your verified Company Knowledge Hub articles.",
      },
    ],
    seoTitle: `${brandName} - Autonomous Business Operating System`,
    seoDescription: "Transform operations with autonomous WhatsApp sales agents, CRM intelligence, and multi-agent workflows.",
  };
}
