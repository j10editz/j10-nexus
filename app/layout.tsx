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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://j10-nexus.com"),
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
