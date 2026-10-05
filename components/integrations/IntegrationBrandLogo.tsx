"use client";

import React, { useState } from "react";
import {
  Webhook,
  Sparkles,
  Calendar,
  Folder,
  Users,
  Wrench,
  Home,
  HeartPulse,
  Brain,
  Cpu,
  Video,
  Film,
  PhoneCall,
  Calculator,
  Mail,
  FileText,
  FileSpreadsheet,
  Building,
} from "lucide-react";

interface IntegrationBrandLogoProps {
  slug?: string;
  name?: string;
  category?: string;
  className?: string;
  size?: number;
}

export default function IntegrationBrandLogo({
  slug = "",
  name = "",
  category = "",
  className = "h-full w-full object-contain",
  size = 22,
}: IntegrationBrandLogoProps) {
  const [imgError, setImgError] = useState(false);

  const normalizedSlug = (slug || name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Specialized SVG / Icon map for platforms that don't have SimpleIcons or often fail
  if (normalizedSlug === "webhooks" || normalizedSlug === "genericwebhook" || normalizedSlug === "webhooksapi") {
    return (
      <div className="flex h-full w-full items-center justify-center text-purple-400">
        <Webhook size={size} className="text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
      </div>
    );
  }

  if (normalizedSlug === "jobber") {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-[#7CB342]/15 text-[#7CB342]">
        <Wrench size={size} className="text-[#7CB342]" />
      </div>
    );
  }

  if (normalizedSlug === "housecallpro" || normalizedSlug === "housecall") {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-[#1E88E5]/15 text-[#1E88E5]">
        <Home size={size} className="text-[#1E88E5]" />
      </div>
    );
  }

  if (normalizedSlug === "mindbody") {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-[#FF5722]/15 text-[#FF5722]">
        <HeartPulse size={size} className="text-[#FF5722]" />
      </div>
    );
  }

  if (normalizedSlug === "openai") {
    return (
      <div className="flex h-full w-full items-center justify-center text-emerald-400">
        <Brain size={size} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
      </div>
    );
  }

  if (normalizedSlug === "anthropic" || normalizedSlug === "claude") {
    return (
      <div className="flex h-full w-full items-center justify-center text-[#F59E0B]">
        <Cpu size={size} className="text-[#F59E0B] drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
      </div>
    );
  }

  if (normalizedSlug === "gemini" || normalizedSlug === "googlegemini") {
    return (
      <div className="flex h-full w-full items-center justify-center text-[#60A5FA]">
        <Sparkles size={size} className="text-[#60A5FA] drop-shadow-[0_0_8px_rgba(96,165,250,0.4)]" />
      </div>
    );
  }

  if (normalizedSlug === "huggingface" || normalizedSlug === "huggingface") {
    return (
      <div className="flex h-full w-full items-center justify-center text-[#FFD21E]">
        <Brain size={size} className="text-[#FFD21E] drop-shadow-[0_0_8px_rgba(255,210,30,0.4)]" />
      </div>
    );
  }

  if (normalizedSlug === "runway") {
    return (
      <div className="flex h-full w-full items-center justify-center text-purple-400">
        <Video size={size} className="text-purple-400" />
      </div>
    );
  }

  if (normalizedSlug === "higgsfield") {
    return (
      <div className="flex h-full w-full items-center justify-center text-orange-400">
        <Film size={size} className="text-orange-400" />
      </div>
    );
  }

  if (normalizedSlug === "pika") {
    return (
      <div className="flex h-full w-full items-center justify-center text-pink-400">
        <Sparkles size={size} className="text-pink-400" />
      </div>
    );
  }

  if (normalizedSlug === "kling" || normalizedSlug === "klingai") {
    return (
      <div className="flex h-full w-full items-center justify-center text-blue-400">
        <Video size={size} className="text-blue-400" />
      </div>
    );
  }

  if (normalizedSlug === "microsoftonedrive" || normalizedSlug === "onedrive") {
    return (
      <div className="flex h-full w-full items-center justify-center text-[#0078D4]">
        <Folder size={size} className="text-[#0078D4]" />
      </div>
    );
  }

  if (normalizedSlug === "microsoftteams" || normalizedSlug === "teams") {
    return (
      <div className="flex h-full w-full items-center justify-center text-[#6264A7]">
        <Users size={size} className="text-[#7C7FD1]" />
      </div>
    );
  }

  if (normalizedSlug === "acuityscheduling" || normalizedSlug === "acuity") {
    return (
      <div className="flex h-full w-full items-center justify-center text-white/80">
        <Calendar size={size} className="text-white/80" />
      </div>
    );
  }

  // Canonical SimpleIcons CDN mapping
  const cdnSlugMap: Record<string, string> = {
    whatsapp: "whatsapp",
    whatsappbusiness: "whatsapp",
    telegram: "telegram",
    instagram: "instagram",
    instagrambusiness: "instagram",
    messenger: "facebookmessenger",
    facebookmessenger: "facebookmessenger",
    twilio: "twilio",
    telnyx: "telnyx",
    gmail: "gmail",
    microsoftoutlook: "microsoftoutlook",
    outlook: "microsoftoutlook",
    googlecalendar: "googlecalendar",
    calendly: "calendly",
    stripe: "stripe",
    square: "square",
    paypal: "paypal",
    hubspot: "hubspot",
    salesforce: "salesforce",
    pipedrive: "pipedrive",
    clickup: "clickup",
    shopify: "shopify",
    woocommerce: "woocommerce",
    quickbooks: "quickbooks",
    xero: "xero",
    meta: "meta",
    metabusiness: "meta",
    metaleadads: "meta",
    googleads: "googleads",
    wordpress: "wordpress",
    typeform: "typeform",
    jotform: "jotform",
    google: "google",
    googlebusiness: "google",
    googlebusinessprofile: "google",
    googledrive: "googledrive",
    googlesheets: "googlesheets",
    dropbox: "dropbox",
    slack: "slack",
    zapier: "zapier",
    make: "make",
    n8n: "n8n",
    github: "github",
    tiktok: "tiktok",
    tiktokshop: "tiktok",
    youtube: "youtube",
    linkedin: "linkedin",
    x: "x",
    notion: "notion",
    airtable: "airtable",
    trello: "trello",
    asana: "asana",
    monday: "mondaydotcom",
    zoom: "zoom",
    mailchimp: "mailchimp",
  };

  const simpleIconSlug = cdnSlugMap[normalizedSlug] || normalizedSlug;

  if (imgError) {
    // Elegant fallback based on category or first letter
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-white/[0.06] font-bold text-[#d7b35c] text-xs">
        {name ? name.charAt(0).toUpperCase() : <Sparkles size={16} className="text-[#d7b35c]" />}
      </div>
    );
  }

  return (
    <img
      src={`https://cdn.simpleicons.org/${simpleIconSlug}/white`}
      alt={name || slug}
      loading="lazy"
      className={className}
      onError={() => setImgError(true)}
    />
  );
}
