import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { recordWorkspaceMessageUsage } from "@/lib/billing/entitlements";
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
        name: "[Client Reference 1]",
        company: "[Enterprise Partner]",
        quote: "Insert verified client quotation here detailing specific operations improvements.",
        rating: 5,
      },
      {
        name: "[Client Reference 2]",
        company: "[Growth Agency]",
        quote: "Insert verified client quotation here detailing conversion and pipeline efficiency.",
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
  ecommerce: {
    heroHeadline: "Convert WhatsApp Inquiries into Verified Stripe Checkouts",
    heroSubheadline: "Provide 24/7 conversational customer service, personalized product recommendations, and instant payment links that recover abandoned carts.",
    primaryCtaText: "Explore WhatsApp Commerce",
    features: [
      {
        title: "Conversational Catalog Browsing",
        description: "Guide shoppers to their ideal product with intelligent recommendation cards delivered directly in WhatsApp chat.",
        icon: "DollarSign",
      },
      {
        title: "One-Click Stripe Checkout Links",
        description: "Send pre-populated Stripe-verified payment links directly in chat for frictionless, PCI-compliant mobile purchases.",
        icon: "ShieldCheck",
      },
      {
        title: "Automated Cart Recovery",
        description: "Deliver timed, personalized follow-ups that address buyer objections and recover lost revenue on high-ticket items.",
        icon: "TrendingUp",
      },
    ],
    testimonials: [
      {
        name: "[Client Reference 1]",
        company: "[Retail Brand]",
        quote: "Insert verified customer quotation here describing checkout experience and customer retention.",
        rating: 5,
      },
      {
        name: "[Client Reference 2]",
        company: "[Commerce Merchant]",
        quote: "Insert verified customer quotation here describing WhatsApp cart recovery metrics.",
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
    // 1. Enforce Authentication & Active Workspace Context
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Authentication and active workspace required for AI generation." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      businessName = context.workspace.brand_name || context.workspace.name || "J10 NEXUS",
      industry = "agency",
      goal = "increase inbound sales inquiries",
      targetAudience = "Founders and executive leaders",
    } = body;

    // 2. Meter usage atomically against the active workspace
    const supabase = createServerSupabaseClient();
    try {
      await recordWorkspaceMessageUsage(supabase, context.workspace.id, 1);
    } catch (billingErr: any) {
      // If billing error is quota or inactive, fail closed
      if (billingErr?.code === "BILLING_REQUIRED") {
        return NextResponse.json(
          { success: false, error: billingErr.message, code: billingErr.code },
          { status: 402 }
        );
      }
      // If DB migration is pending or table uninitialized, allow in dev/staging
    }

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
CRITICAL INTEGRITY RULE: DO NOT INVENT FAKE CUSTOMER TESTIMONIALS OR FABRICATED NUMERICAL RESULTS. Output clearly labeled editable placeholder copy for testimonials.
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
    { "name": "[Client Name Placeholder]", "company": "[Client Company Placeholder]", "quote": "Insert verified customer quotation here describing your operational engagement.", "rating": 5 },
    { "name": "[Client Name Placeholder]", "company": "[Client Company Placeholder]", "quote": "Insert verified customer quotation here describing your operational engagement.", "rating": 5 }
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

Remember: ZERO emojis. No fake testimonials.`,
            },
          ],
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return NextResponse.json({
            success: true,
            copy: {
              heroHeadline: stripEmojis(parsed.heroHeadline || "Autonomous Business Systems"),
              heroSubheadline: stripEmojis(parsed.heroSubheadline || "Instant WhatsApp automation."),
              primaryCtaText: stripEmojis(parsed.primaryCtaText || "Chat on WhatsApp"),
              features: Array.isArray(parsed.features)
                ? parsed.features.map((f: any) => ({
                    title: stripEmojis(f.title || "Feature"),
                    description: stripEmojis(f.description || ""),
                    icon: f.icon || "Zap",
                  }))
                : [],
              testimonials: Array.isArray(parsed.testimonials)
                ? parsed.testimonials.map((t: any) => ({
                    name: stripEmojis(t.name || "[Client Name]"),
                    company: stripEmojis(t.company || "[Company]"),
                    quote: stripEmojis(t.quote || "Insert verified quote"),
                    rating: t.rating || 5,
                  }))
                : [],
              faqs: Array.isArray(parsed.faqs)
                ? parsed.faqs.map((faq: any) => ({
                    question: stripEmojis(faq.question || "Question"),
                    answer: stripEmojis(faq.answer || "Answer"),
                  }))
                : [],
            },
          });
        }
      } catch (aiError) {
        console.warn("OpenAI generation failed, falling back to deterministic template:", aiError);
      }
    }

    // Deterministic High-Quality Preset Fallback
    const preset = INDUSTRY_PRESETS[industry] || INDUSTRY_PRESETS.agency;
    return NextResponse.json({
      success: true,
      copy: {
        heroHeadline: preset.heroHeadline,
        heroSubheadline: preset.heroSubheadline,
        primaryCtaText: preset.primaryCtaText,
        features: preset.features,
        testimonials: preset.testimonials,
        faqs: preset.faqs,
      },
    });
  } catch (error: any) {
    console.error("AI Copy Generation API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate AI copy." },
      { status: 500 }
    );
  }
}
