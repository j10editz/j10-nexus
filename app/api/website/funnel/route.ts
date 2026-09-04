import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import { getDefaultWebsiteFunnel } from "@/lib/website/service";
import type { WebsiteFunnel } from "@/types/website";

export async function GET() {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
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
        title: defaultBlueprint.title,
        slug: defaultBlueprint.slug,
        theme: defaultBlueprint.theme,
        custom_domain: defaultBlueprint.customDomain,
        is_published: defaultBlueprint.isPublished,
        hero_headline: defaultBlueprint.heroHeadline,
        hero_subheadline: defaultBlueprint.heroSubheadline,
        primary_cta_text: defaultBlueprint.primaryCtaText,
        primary_cta_link: defaultBlueprint.primaryCtaLink,
        features: defaultBlueprint.features,
        testimonials: defaultBlueprint.testimonials,
        faqs: defaultBlueprint.faqs,
        seo_title: defaultBlueprint.seoTitle,
        seo_description: defaultBlueprint.seoDescription,
      };

      const { data: created, error } = await supabase
        .from("website_funnels")
        .insert([insertRecord])
        .select()
        .single();

      funnel = created || insertRecord;
    }

    const formattedFunnel: WebsiteFunnel = {
      id: funnel.id || "default-funnel",
      userId: funnel.user_id,
      title: funnel.title,
      slug: funnel.slug,
      theme: funnel.theme || "obsidian",
      customDomain: funnel.custom_domain,
      isPublished: funnel.is_published ?? true,
      heroHeadline: funnel.hero_headline,
      heroSubheadline: funnel.hero_subheadline,
      primaryCtaText: funnel.primary_cta_text,
      primaryCtaLink: funnel.primary_cta_link,
      features: Array.isArray(funnel.features) ? funnel.features : [],
      testimonials: Array.isArray(funnel.testimonials) ? funnel.testimonials : [],
      faqs: Array.isArray(funnel.faqs) ? funnel.faqs : [],
      seoTitle: funnel.seo_title,
      seoDescription: funnel.seo_description,
      createdAt: funnel.created_at || new Date().toISOString(),
      updatedAt: funnel.updated_at || new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      funnel: formattedFunnel,
    });
  } catch (error) {
    console.error("Website Funnel GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load website funnel." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const updates = {
      user_id: user.id,
      title: body.title || "Landing Page",
      theme: body.theme || "obsidian",
      custom_domain: body.customDomain?.trim() || null,
      is_published: Boolean(body.isPublished),
      hero_headline: body.heroHeadline || "Autonomous Business Systems",
      hero_subheadline: body.heroSubheadline || "Instant WhatsApp automation.",
      primary_cta_text: body.primaryCtaText || "Chat on WhatsApp",
      primary_cta_link: body.primaryCtaLink || "https://wa.me/",
      features: Array.isArray(body.features) ? body.features : [],
      testimonials: Array.isArray(body.testimonials) ? body.testimonials : [],
      faqs: Array.isArray(body.faqs) ? body.faqs : [],
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("website_funnels")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    let result;
    if (existing?.id) {
      const { data, error } = await supabase
        .from("website_funnels")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();
      result = data;
    } else {
      const { data, error } = await supabase
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
