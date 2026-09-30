import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-handwritten",
  subsets: ["latin"],
});

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://j10-nexus.vercel.app")
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "J10 NEXUS | AI Revenue & Operations System",
    template: "%s | J10 NEXUS",
  },
  description:
    "J10 NEXUS helps service businesses answer, qualify, follow up, book, and collect payment around the clock.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "J10 NEXUS",
    title: "J10 NEXUS | AI Revenue & Operations System",
    description: "Never miss another lead. J10 keeps customer conversations and revenue moving 24/7.",
  },
  twitter: {
    card: "summary",
    title: "J10 NEXUS | AI Revenue & Operations System",
    description: "Never miss another lead. J10 keeps customer conversations and revenue moving 24/7.",
  },
  robots: { index: true, follow: true },
};

const organizationAndPersonJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      "name": "J10 NEXUS",
      "url": siteUrl,
      "logo": `${siteUrl}/brand/j10-logo.png`,
      "description":
        "The AI Revenue & Operations System for service businesses. Answering, qualifying, following up, booking, and collecting payment automatically.",
      "founder": {
        "@type": "Person",
        "@id": `${siteUrl}/#founder`,
        "name": "Jeefthe Richeder Osne",
        "jobTitle": "Founder and CEO of J10 NEXUS",
        "sameAs": ["https://www.linkedin.com/in/jeefthe-osne-143a9126b/"],
        "image": `${siteUrl}/images/founder/jeefthe-osne-founder-ceo.png`,
      },
    },
    {
      "@type": "Person",
      "@id": `${siteUrl}/#founder`,
      "name": "Jeefthe Richeder Osne",
      "jobTitle": "Founder and CEO of J10 NEXUS",
      "worksFor": {
        "@id": `${siteUrl}/#organization`,
      },
      "sameAs": ["https://www.linkedin.com/in/jeefthe-osne-143a9126b/"],
      "image": `${siteUrl}/images/founder/jeefthe-osne-founder-ceo.png`,
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationAndPersonJsonLd),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
