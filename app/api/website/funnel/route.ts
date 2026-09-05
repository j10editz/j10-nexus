import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/auth";
import { getDefaultWebsiteFunnel, stripEmojis } from "@/lib/website/service";
import type { WebsiteFunnel } from "@/types/website";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    // 1. Public Published Funnel Resolution (by requested slug)
    if (slug) {
      const cleanSlug = slug.trim().toLowerCase();
      const admin = createAdminSupabaseClient();

      const { data: funnel, error } = await admin
        .from("website_funnels")
        .select("*")
        .eq("slug", cleanSlug)
        .eq("is_published", true)
        .maybeSingle();

      if (error || !funnel) {
        return NextResponse.json(
          { success: false, error: `Published funnel '${cleanSlug}' not found.` },
          { status: 404 }
        );
      }

      const formatted: WebsiteFunnel = {
        id: funnel.id,
        workspaceId: funnel.workspace_id,
        title: stripEmojis(funnel.title),
        slug: funnel.slug,
        theme: funnel.theme || "obsidian",
        customDomain: funnel.custom_domain,
        isPublished: true,
        heroHeadline: stripEmojis(funnel.hero_headline),
        heroSubheadline: stripEmojis(funnel.hero_subheadline),
        primaryCtaText: stripEmojis(funnel.primary_cta_text),
        primaryCtaLink: funnel.primary_cta_link,
        features: Array.isArray(funnel.features) ? funnel.features : [],
        testimonials: Array.isArray(funnel.testimonials) ? funnel.testimonials : [],
        faqs: Array.isArray(funnel.faqs) ? funnel.faqs : [],
        seoTitle: stripEmojis(funnel.seo_title || ""),
        seoDescription: stripEmojis(funnel.seo_description || ""),
        createdAt: funnel.created_at,
        updatedAt: funnel.updated_at,
      };

      return NextResponse.json({ success: true, funnel: formatted });
    }

    // 2. Private Builder Resolution (requires authenticated workspace context)
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Authentication and active workspace required." },
        { status: 401 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data: funnel, error } = await supabase
      .from("website_funnels")
      .select("*")
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Website funnel fetch error:", error);
    }

    if (!funnel) {
      const defaultBlueprint = getDefaultWebsiteFunnel();
      const initialFunnel: WebsiteFunnel = {
        id: "draft",
        workspaceId: context.workspace.id,
        ...defaultBlueprint,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return NextResponse.json({ success: true, funnel: initialFunnel });
    }

    const formatted: WebsiteFunnel = {
      id: funnel.id,
      workspaceId: funnel.workspace_id,
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
      createdAt: funnel.created_at,
      updatedAt: funnel.updated_at,
    };

    return NextResponse.json({ success: true, funnel: formatted });
  } catch (error: any) {
    console.error("Website Funnel GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load website funnel." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json(
        { success: false, error: "Authentication and active workspace required to save funnels." },
        { status: 401 }
      );
    }

    if (!["owner", "admin", "manager"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to edit website funnels." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const rawSlug = body.slug || "main";
    const cleanSlug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");

    const updates = {
      workspace_id: context.workspace.id,
      title: stripEmojis(body.title || "Landing Page"),
      slug: cleanSlug,
      theme: body.theme || "obsidian",
      custom_domain: body.customDomain?.trim() || null,
      is_published: Boolean(body.isPublished),
      hero_headline: stripEmojis(body.heroHeadline || "Autonomous Business Systems"),
      hero_subheadline: stripEmojis(body.heroSubheadline || "Instant WhatsApp automation."),
      primary_cta_text: stripEmojis(body.primaryCtaText || "Chat on WhatsApp"),
      primary_cta_link: body.primaryCtaLink || "https://wa.me/",
      features: Array.isArray(body.features)
        ? body.features.map((f: any) => ({
            title: stripEmojis(f.title),
            description: stripEmojis(f.description),
            icon: f.icon || "Zap",
          }))
        : [],
      testimonials: Array.isArray(body.testimonials)
        ? body.testimonials.map((t: any) => ({
            name: stripEmojis(t.name),
            company: stripEmojis(t.company),
            quote: stripEmojis(t.quote),
            rating: Number(t.rating) || 5,
          }))
        : [],
      faqs: Array.isArray(body.faqs)
        ? body.faqs.map((faq: any) => ({
            question: stripEmojis(faq.question),
            answer: stripEmojis(faq.answer),
          }))
        : [],
      updated_at: new Date().toISOString(),
    };

    const supabase = createServerSupabaseClient();

    // Check if funnel exists in this workspace
    const { data: existing } = await supabase
      .from("website_funnels")
      .select("id")
      .eq("workspace_id", context.workspace.id)
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

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from("website_funnels")
        .insert([updates])
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({
      success: true,
      message: "Landing page & funnel saved successfully.",
      funnel: result,
    });
  } catch (error: any) {
    console.error("Website Funnel POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save website funnel." },
      { status: 500 }
    );
  }
}
