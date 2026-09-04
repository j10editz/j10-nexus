import { NextResponse } from "next/server";
import OpenAI from "openai";
import { stripEmojis } from "@/lib/website/service";

const INDUSTRY_PRESETS: Record<
  string,
  {
    heroHeadline: string;
    heroSubheadline: string;
    primaryCtaText: string;
    features: { title: string; description: string; icon: string }[];
    testimonials: { name: string; company: string; quote: string; rating: number }[];
    faqs: { question: string; answer: string }[];
  }
> = {
  agency: {
    heroHeadline: "Scale Client Acquisitions with Autonomous B2B Operations",
    heroSubheadline: "Deploy dedicated WhatsApp sales agents that qualify enterprise leads, book calendar demonstrations, and synchronize deal pipeline 24/7.",
    primaryCtaText: "Request Agency Consultation",
    features: [
      {
        title: "Sub-Second Inbound Lead Response",
        description: "Engage prospective clients instantly on WhatsApp before competitors can even review their inbox.",
        icon: "Zap",
      },
      {
        title: "BANT Qualification Engine",
        description: "Verify budget, decision authority, timeline, and business pain points through natural conversational intelligence.",
        icon: "ShieldCheck",
      },
      {
        title: "Autonomous Calendar Booking",
        description: "Coordinate executive schedules and directly insert qualified discovery calls onto sales team calendars.",
        icon: "Layers",
      },
    ],
    testimonials: [
      {
        name: "Marcus Vance",
        company: "Apex Media Group",
        quote: "Our close rate on outbound pipeline jumped 34% within thirty days. Inbound leads are qualified and ready before our first call.",
        rating: 5,
      },
      {
        name: "Devon Reed",
        company: "Northstar Growth Partners",
        quote: "Eliminated two hours of daily manual CRM data entry across our entire account team. The systems run around the clock.",
        rating: 5,
      },
    ],
    faqs: [
      {
        question: "How does the sales agent qualify prospects?",
        answer: "The agent asks context-aware qualifying questions aligned with your deal criteria and logs responses directly to your CRM.",
      },
      {
        question: "Can our human team take over a conversation?",
        answer: "Yes. Any conversation can be transitioned to a human team member with one click from the inbox.",
      },
    ],
  },
  saas: {
    heroHeadline: "Transform Software Signups into Enterprise Contracts",
    heroSubheadline: "Deliver instantaneous onboarding support, resolve technical product questions, and identify high-value account expansion opportunities.",
    primaryCtaText: "Start Product Walkthrough",
    features: [
      {
        title: "Grounded Knowledge Retrieval",
        description: "Provide verified technical documentation and architecture answers without hallucination.",
        icon: "Brain",
      },
      {
        title: "Automated Trial Conversion",
        description: "Guide self-serve trial users through key activation milestones via intelligent conversational reminders.",
        icon: "Bot",
      },
      {
        title: "Usage & Telemetry Triggers",
        description: "Trigger automated outreach when accounts hit high consumption thresholds to offer enterprise upgrades.",
        icon: "TrendingUp",
      },
    ],
    testimonials: [
      {
        name: "Sophia Lin",
        company: "CloudScale Systems",
        quote: "Trial-to-paid conversions increased 28%. Prospects get instant answers to security and compliance questions on WhatsApp.",
        rating: 5,
      },
      {
        name: "Liam O'Connor",
        company: "Hyperion Data",
        quote: "Our support tickets dropped by half while customer satisfaction scores rose to 98%. An indispensable operational layer.",
        rating: 5,
      },
    ],
    faqs: [
      {
        question: "Is our proprietary technical data secure?",
        answer: "Yes. Data is isolated within your dedicated workspace partition and is never shared across external models.",
      },
      {
        question: "Can the AI integrate with existing webhook infrastructure?",
        answer: "Yes. Full bi-directional webhooks and API endpoints allow synchronization with your core application backend.",
      },
    ],
  },
  realestate: {
    heroHeadline: "Instant Property Inquiries and Qualified Buyer Triage",
    heroSubheadline: "Never miss a high-net-worth real estate inquiry. Schedule private viewings, qualify financing capacity, and capture buyer requirements 24/7.",
    primaryCtaText: "Schedule Private Viewing",
    features: [
      {
        title: "Instant Listing Details",
        description: "Deliver high-resolution brochures, floor plans, and property specifications immediately upon request.",
        icon: "Globe",
      },
      {
        title: "Purchaser Readiness Verification",
        description: "Confirm buyer timeframe, pre-approval status, and desired locations before scheduling showings.",
        icon: "ShieldCheck",
      },
      {
        title: "Automated Agent Dispatch",
        description: "Notify listing brokers immediately when high-priority buyers request private consultations.",
        icon: "MessageSquare",
      },
    ],
    testimonials: [
      {
        name: "Julian Thorne",
        company: "Thorne Luxury Properties",
        quote: "We captured three luxury property contracts in a single weekend from buyers who inquired after normal business hours.",
        rating: 5,
      },
      {
        name: "Camilla Morales",
        company: "Metropolitan Realty Advisors",
        quote: "Buyers love the immediate responsiveness. It sets an elite first impression that separates our brokerage from competitors.",
        rating: 5,
      },
    ],
    faqs: [
      {
        question: "Can the bot send listing documents and brochures?",
        answer: "Yes. PDF specification sheets, virtual tours, and photo galleries can be delivered directly in the conversation.",
      },
      {
        question: "Does this connect to our existing MLS feed?",
        answer: "Yes. Active property listings and price updates can be synchronized continuously into the knowledge hub.",
      },
    ],
  },
  ecommerce: {
    heroHeadline: "Conversational Commerce That Converts Browsers to Buyers",
    heroSubheadline: "Deliver personalized product recommendations, answer sizing and shipping questions, and recover abandoned carts directly over WhatsApp.",
    primaryCtaText: "Shop Verified Catalog",
    features: [
      {
        title: "One-Click Stripe Checkout",
        description: "Generate authenticated payment links and invoice balances without forcing shoppers through clunky web carts.",
        icon: "DollarSign",
      },
      {
        title: "Real-Time Order Tracking",
        description: "Provide instantaneous tracking numbers, delivery updates, and carrier status via automated message flows.",
        icon: "Clock",
      },
      {
        title: "Proactive VIP Re-engagement",
        description: "Notify repeat customers of limited product releases and tailored discounts matched to past purchase history.",
        icon: "Star",
      },
    ],
    testimonials: [
      {
        name: "Evelyn Ross",
        company: "Vanguard Apparel",
        quote: "Our repeat customer purchase rate increased by 41%. Customers love purchasing directly through WhatsApp messages.",
        rating: 5,
      },
      {
        name: "Kenji Sato",
        company: "Kuro Craft Goods",
        quote: "Abandoned cart recovery increased from 8% on email to over 39% on WhatsApp. An extraordinary lift in net revenue.",
        rating: 5,
      },
    ],
    faqs: [
      {
        question: "How are payments handled securely?",
        answer: "All transactions are processed through Stripe-verified checkout sessions with full PCI compliance.",
      },
      {
        question: "Can the bot process order exchanges or returns?",
        answer: "Yes. Return policies and exchange workflows are handled automatically according to your custom business rules.",
      },
    ],
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      businessName = "J10 NEXUS",
      industry = "agency",
      goal = "increase inbound sales inquiries",
      targetAudience = "Founders and executive leaders",
    } = body;

    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          temperature: 0.7,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an elite direct-response copywriter creating a landing page for a modern high-ticket technology or service business.
CRITICAL MANDATORY RULE: DO NOT USE ANY EMOJIS ANYWHERE. Zero emojis. No pictographs. No icons in text. Maintain a sleek, modern, professional tone similar to Stripe, Vercel, or Linear.
Output strictly JSON matching this structure:
{
  "heroHeadline": "compelling punchy headline (max 80 chars)",
  "heroSubheadline": "clear value proposition explaining how it solves the pain point (max 160 chars)",
  "primaryCtaText": "action-oriented CTA button text (e.g. Chat with Sales Team, Schedule Strategy Call)",
  "features": [
    { "title": "Feature 1 Title", "description": "Crisp outcome-driven explanation", "icon": "Zap" },
    { "title": "Feature 2 Title", "description": "Crisp outcome-driven explanation", "icon": "ShieldCheck" },
    { "title": "Feature 3 Title", "description": "Crisp outcome-driven explanation", "icon": "Layers" }
  ],
  "testimonials": [
    { "name": "Full Name", "company": "Company Name", "quote": "Specific quantitative result quote", "rating": 5 },
    { "name": "Full Name", "company": "Company Name", "quote": "Specific quantitative result quote", "rating": 5 }
  ],
  "faqs": [
    { "question": "Clear objection question?", "answer": "Confident, verified answer" },
    { "question": "Clear operational question?", "answer": "Confident, verified answer" }
  ]
}`,
            },
            {
              role: "user",
              content: `Generate high-converting landing page copy for:
Business Name: ${businessName}
Industry / Niche: ${industry}
Primary Conversion Goal: ${goal}
Target Audience: ${targetAudience}

Remember: ZERO emojis.`,
            },
          ],
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return NextResponse.json({
            success: true,
            source: "gpt-4o",
            funnel: {
              heroHeadline: stripEmojis(parsed.heroHeadline || ""),
              heroSubheadline: stripEmojis(parsed.heroSubheadline || ""),
              primaryCtaText: stripEmojis(parsed.primaryCtaText || "Message Us on WhatsApp"),
              features: Array.isArray(parsed.features)
                ? parsed.features.map((f: any) => ({
                    title: stripEmojis(f.title),
                    description: stripEmojis(f.description),
                    icon: f.icon || "Zap",
                  }))
                : [],
              testimonials: Array.isArray(parsed.testimonials)
                ? parsed.testimonials.map((t: any) => ({
                    name: stripEmojis(t.name),
                    company: stripEmojis(t.company),
                    quote: stripEmojis(t.quote),
                    rating: Number(t.rating) || 5,
                  }))
                : [],
              faqs: Array.isArray(parsed.faqs)
                ? parsed.faqs.map((faq: any) => ({
                    question: stripEmojis(faq.question),
                    answer: stripEmojis(faq.answer),
                  }))
                : [],
            },
          });
        }
      } catch (openAiError) {
        console.warn("OpenAI copy generation failed, using intelligent preset fallback:", openAiError);
      }
    }

    // Intelligent Preset Fallback with zero emojis
    const selectedPreset =
      INDUSTRY_PRESETS[industry.toLowerCase()] || INDUSTRY_PRESETS.agency;

    return NextResponse.json({
      success: true,
      source: "preset_synthesis",
      funnel: {
        heroHeadline: stripEmojis(selectedPreset.heroHeadline),
        heroSubheadline: stripEmojis(selectedPreset.heroSubheadline),
        primaryCtaText: stripEmojis(selectedPreset.primaryCtaText),
        features: selectedPreset.features.map((f) => ({
          title: stripEmojis(f.title),
          description: stripEmojis(f.description),
          icon: f.icon,
        })),
        testimonials: selectedPreset.testimonials.map((t) => ({
          name: stripEmojis(t.name),
          company: stripEmojis(t.company),
          quote: stripEmojis(t.quote),
          rating: t.rating,
        })),
        faqs: selectedPreset.faqs.map((faq) => ({
          question: stripEmojis(faq.question),
          answer: stripEmojis(faq.answer),
        })),
      },
    });
  } catch (error) {
    console.error("AI Copy Generation API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate AI copy." },
      { status: 500 }
    );
  }
}
