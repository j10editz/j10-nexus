export interface WebsiteFeature {
  title: string;
  description: string;
  icon: string;
}

export interface WebsiteTestimonial {
  name: string;
  company: string;
  quote: string;
  rating: number;
}

export interface WebsiteFAQ {
  question: string;
  answer: string;
}

export interface WebsiteFunnel {
  id: string;
  userId?: string;
  title: string;
  slug: string;
  theme: "obsidian" | "violet" | "emerald" | "slate";
  customDomain?: string | null;
  isPublished: boolean;
  heroHeadline: string;
  heroSubheadline: string;
  primaryCtaText: string;
  primaryCtaLink?: string | null;
  features: WebsiteFeature[];
  testimonials: WebsiteTestimonial[];
  faqs: WebsiteFAQ[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: string;
  updatedAt: string;
}
