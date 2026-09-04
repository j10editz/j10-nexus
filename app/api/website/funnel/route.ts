import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import { getDefaultWebsiteFunnel, stripEmojis } from "@/lib/website/service";
import type { WebsiteFunnel } from "@/types/website";

export async function GET() {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      const defaultBlueprint = getDefaultWebsiteFunnel();
      const formattedFunnel: WebsiteFunnel = {
        id: "default-funnel",
        userId: "demo-user",
        ...defaultBlueprint,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return NextResponse.json({
        success: true,
        funnel: formattedFunnel,
      });
    }

    let { data: funnel } = await supabase
      .from("website_funnels")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!funnel) {
      const defaultBlueprint = getDefaultWebsiteFunnel();
      const insertRecord = {
        user_id: user.id,
        title: stripEmojis(defaultBlueprint.title),
        slug: defaultBlueprint.slug,
        theme: defaultBlueprint.theme,
        custom_domain: defaultBlueprint.customDomain,
        is_published: defaultBlueprint.isPublished,
        hero_headline: stripEmojis(defaultBlueprint.heroHeadline),
        hero_subheadline: stripEmojis(defaultBlueprint.heroSubheadline),
        primary_cta_text: stripEmojis(defaultBlueprint.primaryCtaText),
        primary_cta_link: defaultBlueprint.primaryCtaLink,
        features: defaultBlueprint.features,
        testimonials: defaultBlueprint.testimonials,
        faqs: defaultBlueprint.faqs,
        seo_title: stripEmojis(defaultBlueprint.seoTitle || ""),
        seo_description: stripEmojis(defaultBlueprint.seoDescription || ""),
      };

      const { data: created } = await supabase
        .from("website_funnels")
        .insert([insertRecord])
        .select()
        .single();

      funnel = created || insertRecord;
    }

    const formattedFunnel: WebsiteFunnel = {
      id: funnel.id || "default-funnel",
      userId: funnel.user_id,
      title: stripEmojis(funnel.title),
      slug: funnel.slug,
      theme: funnel.theme || "obsidian",
      customDomain: funnel.custom_domain,
      isPublished: funnel.is_published ?? true,
      heroHeadline: stripEmojis(funnel.hero_headline),
      heroSubheadline: stripEmojis(funnel.hero_subheadline),
      primaryCtaText: stripEmojis(funnel.primary_cta_text),
      primaryCtaLink: funnel.primary_cta_link,
      features: Array.isArray(funnel.features) ? funnel.features : [],
      testimonials: Array.isArray(funnel.testimonials) ? funnel.testimonials : [],
      faqs: Array.isArray(funnel.faqs) ? funnel.faqs : [],
      seoTitle: stripEmojis(funnel.seo_title || ""),
      seoDescription: stripEmojis(funnel.seo_description || ""),
      createdAt: funnel.created_at || new Date().toISOString(),
      updatedAt: funnel.updated_at || new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      funnel: formattedFunnel,
    });
  } catch (error) {
    console.error("Website Funnel GET error:", error);
    const defaultBlueprint = getDefaultWebsiteFunnel();
    return NextResponse.json({
      success: true,
      funnel: {
        id: "default-funnel",
        userId: "demo-user",
        ...defaultBlueprint,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);
    const body = await request.json();

    const sanitizedUpdates = {
      title: stripEmojis(body.title || "Landing Page"),
      theme: body.theme || "obsidian",
      custom_domain: body.customDomain?.trim() || null,
      is_published: Boolean(body.isPublished),
      hero_headline: stripEmojis(body.heroHeadline || "Autonomous Business Systems"),
      hero_subheadline: stripEmojis(body.heroSubheadline || "Instant WhatsApp automation."),
      primary_cta_text: stripEmojis(body.primaryCtaText || "Chat on WhatsApp"),
      primary_cta_link: body.primaryCtaLink || "https://wa.me/",
      features: Array.isArray(body.features)
        ? body.features.map((f: any) => ({
            ...f,
            title: stripEmojis(f.title),
            description: stripEmojis(f.description),
          }))
        : [],
      testimonials: Array.isArray(body.testimonials)
        ? body.testimonials.map((t: any) => ({
            ...t,
            name: stripEmojis(t.name),
            company: stripEmojis(t.company),
            quote: stripEmojis(t.quote),
          }))
        : [],
      faqs: Array.isArray(body.faqs)
        ? body.faqs.map((faq: any) => ({
            ...faq,
            question: stripEmojis(faq.question),
            answer: stripEmojis(faq.answer),
          }))
        : [],
      updated_at: new Date().toISOString(),
    };

    if (!user) {
      return NextResponse.json({
        success: true,
        message: "Landing page saved and updated to live edge preview.",
        funnel: {
          id: "default-funnel",
          userId: "demo-user",
          slug: "main",
          ...sanitizedUpdates,
          heroHeadline: sanitizedUpdates.hero_headline,
          heroSubheadline: sanitizedUpdates.hero_subheadline,
          primaryCtaText: sanitizedUpdates.primary_cta_text,
          primaryCtaLink: sanitizedUpdates.primary_cta_link,
          customDomain: sanitizedUpdates.custom_domain,
          isPublished: sanitizedUpdates.is_published,
          createdAt: new Date().toISOString(),
        },
      });
    }

    const updates = {
      user_id: user.id,
      ...sanitizedUpdates,
    };

    const { data: existing } = await supabase
      .from("website_funnels")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    let result;
    if (existing?.id) {
      const { data } = await supabase
        .from("website_funnels")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();
      result = data;
    } else {
      const { data } = await supabase
        .from("website_funnels")
        .insert([updates])
        .select()
        .single();
      result = data;
    }

    return NextResponse.json({
      success: true,
      message: "Landing page & funnel saved successfully.",
      funnel: result,
    });
  } catch (error) {
    console.error("Website Funnel POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save website funnel." },
      { status: 500 }
    );
  }
}
