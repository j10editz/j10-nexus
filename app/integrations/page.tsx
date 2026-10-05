import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import IntegrationsClient from "./IntegrationsClient";

export const metadata: Metadata = {
  title: "Integrations | J10 NEXUS",
  description: "Explore the messaging, scheduling, payment, CRM, commerce, accounting, marketing, and automation tools in the J10 NEXUS connection roadmap.",
  alternates: { canonical: "/integrations" },
};

export default function IntegrationsPage() {
  return <main className="min-h-screen bg-[#05030a] text-white"><Navbar /><IntegrationsClient /><Footer /></main>;
}
