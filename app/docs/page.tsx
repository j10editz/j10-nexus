import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DocsClient from "./DocsClient";

export const metadata: Metadata = {
  title: "Documentation | J10 NEXUS",
  description: "Learn how to set up, connect, operate, and grow with J10 NEXUS.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return <main className="min-h-screen bg-[#05030a] text-white"><Navbar /><DocsClient /><Footer /></main>;
}
