import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/auth";
import { stripEmojis } from "@/lib/website/service";
import type { WebsiteFunnel } from "@/types/website";
import { PublicFunnelView } from "@/components/website/PublicFunnelView";

export const dynamic = "force-dynamic";

export default async function PublicFunnelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cleanSlug = String(slug || "").trim().toLowerCase();

  if (!cleanSlug) {
    notFound();
  }

  const admin = createAdminSupabaseClient();
  const { data: funnel, error } = await admin
    .from("website_funnels")
    .select("*")
    .eq("slug", cleanSlug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !funnel) {
    notFound();
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

  return <PublicFunnelView funnel={formatted} slug={cleanSlug} />;
}
