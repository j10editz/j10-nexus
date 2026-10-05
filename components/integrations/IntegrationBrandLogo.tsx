"use client";

import React from "react";

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
  className = "h-full w-full object-contain",
  size = 22,
}: IntegrationBrandLogoProps) {
  const normalizedSlug = (slug || name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Size styling helper
  const svgProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className: className || "shrink-0",
  };

  // 1. WhatsApp Business
  if (normalizedSlug === "whatsapp" || normalizedSlug === "whatsappbusiness") {
    return (
      <svg {...svgProps} fill="none" viewBox="0 0 24 24">
        <path
          fill="#25D366"
          d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2z"
        />
        <path
          fill="#FFFFFF"
          d="M17.52 14.36c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.03-1.05 2.51s1.08 2.91 1.23 3.11c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"
        />
      </svg>
    );
  }

  // 2. Telegram
  if (normalizedSlug === "telegram") {
    return (
      <svg {...svgProps} fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="#229ED9" />
        <path
          fill="#FFFFFF"
          d="m16.8 7.3-10.2 3.93c-.7.28-.69.67-.13.84l2.61.81 6.06-3.82c.29-.17.55-.08.33.11l-4.91 4.43-.19 2.76c.27 0 .39-.12.54-.27l1.3-1.26 2.7 2c.5.28.86.13.98-.46l1.78-8.4c.18-.73-.28-1.06-.87-.84z"
        />
      </svg>
    );
  }

  // 3. Instagram
  if (normalizedSlug === "instagram" || normalizedSlug === "instagrambusiness") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="5" stroke="#E1306C" strokeWidth="2" />
        <circle cx="12" cy="12" r="4.5" stroke="#E1306C" strokeWidth="2" />
        <circle cx="17.2" cy="6.8" r="1.2" fill="#E1306C" />
      </svg>
    );
  }

  // 4. Messenger
  if (normalizedSlug === "messenger" || normalizedSlug === "facebookmessenger") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          fill="#0084FF"
          d="M12 2C6.48 2 2 6.14 2 11.25c0 2.91 1.45 5.51 3.73 7.15V22l3.43-1.89c.9.25 1.86.39 2.84.39 5.52 0 10-4.14 10-9.25S17.52 2 12 2z"
        />
        <path
          fill="#FFFFFF"
          d="m13.2 13.5-2.7-2.9-5.3 2.9 5.8-6.2 2.7 2.9 5.3-2.9-5.8 6.2z"
        />
      </svg>
    );
  }

  // 5. Twilio
  if (normalizedSlug === "twilio") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#F22F46" />
        <circle cx="8.5" cy="8.5" r="2" fill="#FFFFFF" />
        <circle cx="15.5" cy="8.5" r="2" fill="#FFFFFF" />
        <circle cx="8.5" cy="15.5" r="2" fill="#FFFFFF" />
        <circle cx="15.5" cy="15.5" r="2" fill="#FFFFFF" />
      </svg>
    );
  }

  // 6. Telnyx
  if (normalizedSlug === "telnyx") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#00E599" />
        <path
          d="m7 8 5 4-5 4M12 8l5 4-5 4"
          stroke="#0F172A"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 7. Gmail
  if (normalizedSlug === "gmail") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          fill="#EA4335"
          d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11z"
        />
        <path
          fill="#FFFFFF"
          d="M6.5 6 12 10.5 17.5 6v12h-2V9.8l-3.5 2.9-3.5-2.9V18h-2V6z"
        />
      </svg>
    );
  }

  // 8. Microsoft Outlook (Email)
  if (normalizedSlug === "microsoftoutlook" || normalizedSlug === "outlook") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#0078D4" />
        <circle cx="8.5" cy="12" r="3.5" fill="#FFFFFF" />
        <circle cx="8.5" cy="12" r="1.8" fill="#0078D4" />
        <path
          d="M13.5 8h6v8h-6z"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="m13.5 8 3 3 3-3"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 9. Google Calendar
  if (normalizedSlug === "googlecalendar") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="18" height="18" x="3" y="3" rx="4" fill="#4285F4" />
        <rect width="14" height="11" x="5" y="8" rx="2" fill="#FFFFFF" />
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fill="#4285F4"
          fontSize="8.5"
          fontWeight="bold"
          fontFamily="system-ui, sans-serif"
        >
          31
        </text>
      </svg>
    );
  }

  // 10. Calendly
  if (normalizedSlug === "calendly") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#006BFF" strokeWidth="2.5" />
        <path
          d="M14.5 8.5a4.5 4.5 0 1 0 0 7"
          stroke="#006BFF"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 11. Acuity Scheduling
  if (normalizedSlug === "acuityscheduling" || normalizedSlug === "acuity") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="18" height="18" x="3" y="3" rx="4" stroke="#F59E0B" strokeWidth="2" />
        <circle cx="12" cy="12" r="5" stroke="#F59E0B" strokeWidth="1.8" />
        <path d="M12 9.5v2.5l2 1.5" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  // 12. Stripe
  if (normalizedSlug === "stripe") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#635BFF" />
        <path
          fill="#FFFFFF"
          d="M13.9 10.6c-.8-.4-1.3-.6-1.3-1 0-.3.3-.6.9-.6.8 0 1.6.3 2.1.6l.5-1.7c-.6-.3-1.4-.5-2.4-.5-2 0-3.3 1-3.3 2.6 0 1.9 2.6 1.7 2.6 2.5 0 .4-.4.7-1 .7-.9 0-1.8-.4-2.4-.8l-.5 1.7c.7.4 1.7.6 2.7.6 2 0 3.5-1 3.5-2.7 0-2-2.7-1.7-2.7-2.5l1.3.6z"
        />
      </svg>
    );
  }

  // 13. Square
  if (normalizedSlug === "square") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="18" height="18" x="3" y="3" rx="4" fill="#006AFF" />
        <rect width="10" height="10" x="7" y="7" rx="2" fill="#FFFFFF" />
        <rect width="5" height="5" x="9.5" y="9.5" rx="1" fill="#006AFF" />
      </svg>
    );
  }

  // 14. PayPal
  if (normalizedSlug === "paypal") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          fill="#003087"
          d="M7 4h5.2c2.4 0 4.1 1.4 3.7 3.9-.4 2.7-2.4 4.1-4.8 4.1H9.4L8.1 20H5.5L7 4z"
        />
        <path
          fill="#0079C1"
          d="M9.8 9.5h3.8c1.9 0 3.3 1.1 2.9 3.2-.4 2.2-2 3.3-3.9 3.3H11l-1 5H7.8l2-11.5z"
        />
      </svg>
    );
  }

  // 15. HubSpot
  if (normalizedSlug === "hubspot") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#FF7A59" />
        <circle cx="12" cy="12" r="3.2" fill="#FFFFFF" />
        <circle cx="16.5" cy="8" r="1.8" fill="#FFFFFF" />
        <circle cx="7.5" cy="12" r="1.4" fill="#FFFFFF" />
        <path d="M12 8.8V6M12 15.2v2.8M14.2 10.2l1.6-1.5" stroke="#FFFFFF" strokeWidth="1.8" />
      </svg>
    );
  }

  // 16. Salesforce
  if (normalizedSlug === "salesforce") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          fill="#00A1E0"
          d="M17.5 9a4.5 4.5 0 0 0-4.2-3 4.6 4.6 0 0 0-4.3 3A4.2 4.2 0 0 0 5 13a4.2 4.2 0 0 0 4.2 4.2h8.3A4.5 4.5 0 0 0 22 12.7 4.3 4.3 0 0 0 17.5 9z"
        />
        <path
          fill="#FFFFFF"
          d="M12.8 11.2c-.2-.6-.7-1-1.3-1s-1.2.4-1.4 1c-.1.3-.1.6 0 .9.3.6.9.9 1.4 1.1.8.3 1.4.6 1.4 1.2 0 .5-.4.8-1 .8-.6 0-1.1-.3-1.4-.7l-.8.7c.5.7 1.3 1.1 2.2 1.1 1.2 0 2-.7 2-1.8 0-1-.8-1.5-1.7-1.8-.7-.2-1.2-.4-1.2-.8 0-.4.3-.6.7-.6.5 0 .9.2 1.1.5l.6-.6z"
        />
      </svg>
    );
  }

  // 17. Pipedrive
  if (normalizedSlug === "pipedrive") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#26292C" />
        <circle cx="12" cy="12" r="9" stroke="#28A745" strokeWidth="2" />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="12"
          fontWeight="bold"
          fontFamily="system-ui, sans-serif"
        >
          P
        </text>
      </svg>
    );
  }

  // 18. ClickUp
  if (normalizedSlug === "clickup") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#1E192B" />
        <path
          d="m7 13 5-4 5 4"
          stroke="#7B68EE"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="16.5" r="1.5" fill="#FF005A" />
      </svg>
    );
  }

  // 19. Shopify
  if (normalizedSlug === "shopify") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#96BF48" />
        <path
          fill="#FFFFFF"
          d="M14.5 7.5a2.5 2.5 0 0 0-5 0c0 .4 0 .8.2 1.1H7l2 10.5 7.5-1.5 2.5-9H14.3c.1-.3.2-.7.2-1.1zm-3.5 0a1 1 0 0 1 2 0c0 .4 0 .7-.1 1.1h-1.8c-.1-.4-.1-.7-.1-1.1z"
        />
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          fill="#5E8E3E"
          fontSize="6"
          fontWeight="bold"
        >
          S
        </text>
      </svg>
    );
  }

  // 20. WooCommerce
  if (normalizedSlug === "woocommerce") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#96588A" />
        <path
          d="m6 9.5 2.2 6 2.3-4.5 2 4.5 2-6"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 21. QuickBooks
  if (normalizedSlug === "quickbooks") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#2CA01C" />
        <path
          d="M8.5 8v8a3 3 0 0 0 3-3V8"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M15.5 16V8a3 3 0 0 0-3 3v5"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 22. Xero
  if (normalizedSlug === "xero") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#13B5EA" />
        <path
          d="m8 8 8 8M16 8l-8 8"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 23. Meta / Meta Lead Ads
  if (normalizedSlug === "meta" || normalizedSlug === "metaleadads" || normalizedSlug === "metabusiness") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          fill="#0668E1"
          d="M12 14.8c-1.3 1.8-2.6 2.7-3.9 2.7-2.2 0-3.6-2.1-3.6-5.1 0-3.1 1.5-5.2 3.7-5.2 1.3 0 2.5 1 3.8 2.8 1.3-1.8 2.5-2.8 3.8-2.8 2.2 0 3.7 2.1 3.7 5.2 0 3-1.4 5.1-3.6 5.1-1.3 0-2.6-.9-3.9-2.7zm-2.8-5.3c-.9 0-1.7.9-1.7 2.9 0 2 .8 2.8 1.7 2.8.9 0 1.8-1 2.8-2.8-1-1.9-1.9-2.9-2.8-2.9zm5.6 0c-.9 0-1.8 1-2.8 2.9 1 1.8 1.9 2.8 2.8 2.8.9 0 1.7-.8 1.7-2.8 0-2-.8-2.9-1.7-2.9z"
        />
      </svg>
    );
  }

  // 24. Google Ads
  if (normalizedSlug === "googleads") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          d="m6.5 16 5.5-9.5a2.5 2.5 0 0 1 4.3 2.5l-5.5 9.5a2.5 2.5 0 0 1-4.3-2.5z"
          fill="#FBBC04"
        />
        <circle cx="8" cy="16" r="3" fill="#4285F4" />
        <path
          d="m14 6.5 3.5 6a2 2 0 0 1-.7 2.7 2 2 0 0 1-2.7-.7l-3.5-6a2 2 0 0 1 .7-2.7 2 2 0 0 1 2.7.7z"
          fill="#34A853"
        />
      </svg>
    );
  }

  // 25. WordPress
  if (normalizedSlug === "wordpress") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#21759B" />
        <circle cx="12" cy="12" r="8.5" stroke="#FFFFFF" strokeWidth="1.2" />
        <path
          d="m6.5 8 3.5 9.5 2-5-2-4.5h2.5l2 4.5 1.8-4.5H18l-3.8 9.5-2.2-5.5"
          stroke="#FFFFFF"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 26. Typeform
  if (normalizedSlug === "typeform") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#262627" />
        <path
          d="M7 8h10M12 8v9"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 27. Jotform
  if (normalizedSlug === "jotform") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#FF6100" />
        <path
          fill="#FFFFFF"
          d="M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm2 3v6l5-3-5-3z"
        />
      </svg>
    );
  }

  // 28. Google Business Profile & Google core
  if (
    normalizedSlug === "google" ||
    normalizedSlug === "googlebusiness" ||
    normalizedSlug === "googlebusinessprofile"
  ) {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          fill="#4285F4"
          d="M21.5 12.2c0-.7-.1-1.4-.2-2.1H12v4.1h5.4a4.6 4.6 0 0 1-2 3l3.2 2.5c1.9-1.8 2.9-4.3 2.9-7.5z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 5-1 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2L3.1 16.3C4.8 19.7 8.1 22 12 22z"
        />
        <path
          fill="#FBBC05"
          d="M6.4 13.8a6 6 0 0 1 0-3.6L3.1 7.7A9.9 9.9 0 0 0 2 12c0 1.6.4 3.1 1.1 4.3l3.3-2.5z"
        />
        <path
          fill="#EA4335"
          d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 3 14.7 2 12 2 8.1 2 4.8 4.3 3.1 7.7l3.3 2.5c.8-2.4 3-4.2 5.6-4.2z"
        />
      </svg>
    );
  }

  // 29. Google Drive
  if (normalizedSlug === "googledrive") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path d="M8.5 4h7l5.5 9.5h-7L8.5 4z" fill="#FFBA00" />
        <path d="M3 13.5 6.5 7.5 13.5 19.5H6.5L3 13.5z" fill="#0066DA" />
        <path d="M6.5 19.5h14l-3.5-6H3l3.5 6z" fill="#00AC47" />
      </svg>
    );
  }

  // 30. Google Sheets
  if (normalizedSlug === "googlesheets") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="18" height="20" x="3" y="2" rx="3" fill="#0F9D58" />
        <path fill="#FFFFFF" d="M8 8h8v2H8zm0 3h8v2H8zm0 3h8v2H8z" />
        <rect width="3" height="8" x="11.5" y="8" fill="#0F9D58" />
      </svg>
    );
  }

  // 31. Microsoft OneDrive
  if (normalizedSlug === "microsoftonedrive" || normalizedSlug === "onedrive") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          fill="#0078D4"
          d="M17 11.5a4.5 4.5 0 0 0-4-2.5 4.4 4.4 0 0 0-4.1 2.8A3.7 3.7 0 0 0 6 15.2c0 2 1.7 3.8 3.8 3.8h8.4A4 4 0 0 0 22 15a4.2 4.2 0 0 0-5-3.5z"
        />
      </svg>
    );
  }

  // 32. Dropbox
  if (normalizedSlug === "dropbox") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          fill="#0061FF"
          d="m7 4-5 3.5 5 3.5 5-3.5L7 4zm10 0-5 3.5 5 3.5 5-3.5L17 4zM2 14.5l5 3.5 5-3.5-5-3.5-5 3.5zm20 0-5-3.5-5 3.5 5 3.5 5-3.5zM12 15.5l-5 3.5 5 3.5 5-3.5-5-3.5z"
        />
      </svg>
    );
  }

  // 33. Slack
  if (normalizedSlug === "slack") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#4A154B" />
        <circle cx="8" cy="9" r="1.5" fill="#E01E5A" />
        <rect width="5" height="2" x="7" y="11" rx="1" fill="#36C5F0" />
        <rect width="2" height="5" x="13" y="7" rx="1" fill="#2EB67D" />
        <circle cx="15.5" cy="14.5" r="1.5" fill="#ECB22E" />
      </svg>
    );
  }

  // 34. Microsoft Teams
  if (normalizedSlug === "microsoftteams" || normalizedSlug === "teams") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="16" cy="8" r="2.5" fill="#505AC9" />
        <path d="M12.5 17v-4a3 3 0 0 1 6 0v4h-6z" fill="#505AC9" />
        <rect width="11" height="11" x="3" y="7" rx="2.5" fill="#7B83EB" />
        <text
          x="8.5"
          y="15.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="8"
          fontWeight="bold"
        >
          T
        </text>
      </svg>
    );
  }

  // 35. Zapier
  if (normalizedSlug === "zapier") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#FF4F00" />
        <path
          d="m12 6 1.8 4.2L18 12l-4.2 1.8L12 18l-1.8-4.2L6 12l4.2-1.8L12 6z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  // 36. Make
  if (normalizedSlug === "make") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#6D28D9" />
        <path
          d="m6 16 3-7 3 5 3-5 3 7"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 37. n8n
  if (normalizedSlug === "n8n") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#EA4B71" />
        <circle cx="8" cy="12" r="2" fill="#FFFFFF" />
        <circle cx="16" cy="12" r="2" fill="#FFFFFF" />
        <path d="M10 12h4" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // 38. Webhooks & API
  if (
    normalizedSlug === "webhooks" ||
    normalizedSlug === "genericwebhook" ||
    normalizedSlug === "webhooksapi"
  ) {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="6" r="2.5" stroke="#A855F7" strokeWidth="2" />
        <circle cx="7" cy="17" r="2.5" stroke="#A855F7" strokeWidth="2" />
        <circle cx="17" cy="17" r="2.5" stroke="#A855F7" strokeWidth="2" />
        <path d="M12 8.5v4M12 12.5l-3.5 2.5M12 12.5l3.5 2.5" stroke="#A855F7" strokeWidth="2" />
      </svg>
    );
  }

  // 39. Jobber
  if (normalizedSlug === "jobber") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#7CB342" />
        <path
          d="M14 7v6a3 3 0 0 1-6 0V11"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 40. Housecall Pro
  if (normalizedSlug === "housecallpro" || normalizedSlug === "housecall") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#1E88E5" />
        <path
          d="m6 11 6-5 6 5v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7z"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <rect width="3" height="4" x="10.5" y="14" fill="#FFFFFF" />
      </svg>
    );
  }

  // 41. Mindbody
  if (normalizedSlug === "mindbody") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#FF5722" />
        <circle cx="12" cy="12" r="4" fill="#FFFFFF" />
        <circle cx="12" cy="12" r="1.5" fill="#FF5722" />
      </svg>
    );
  }

  // AI Orchestration Adapters
  if (normalizedSlug === "openai") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#10A37F" />
        <path
          d="M12 7v10M7 9.5l10 5M7 14.5l10-5"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (normalizedSlug === "anthropic" || normalizedSlug === "claude") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#D97706" />
        <path
          d="m8 16 4-9 4 9M9.5 13.5h5"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (normalizedSlug === "gemini" || normalizedSlug === "googlegemini") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2C12 7.5 7.5 12 2 12c5.5 0 10 4.5 10 10 0-5.5 4.5-10 10-10-5.5 0-10-4.5-10-10z"
          fill="#60A5FA"
        />
      </svg>
    );
  }

  if (normalizedSlug === "runway" || normalizedSlug === "higgsfield" || normalizedSlug === "pika" || normalizedSlug === "kling") {
    return (
      <svg {...svgProps} viewBox="0 0 24 24" fill="none">
        <rect width="20" height="20" x="2" y="2" rx="4" fill="#7C3AED" />
        <path d="m10 8 6 4-6 4V8z" fill="#FFFFFF" />
      </svg>
    );
  }

  // Polished Default Luxury Monogram Badge for any other custom slug
  const initial = (name || slug || "J").charAt(0).toUpperCase();
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-lg bg-gradient-to-br from-[#d7b35c]/25 to-white/[0.05] border border-[#d7b35c]/30 font-bold text-[#d7b35c] text-xs shadow-inner"
    >
      {initial}
    </div>
  );
}
