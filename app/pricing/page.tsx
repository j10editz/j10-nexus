import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Pricing from "@/components/Pricing";

export const metadata: Metadata = {
  title: "Pricing Plans | J10 NEXUS",
  description: "Approved J10 NEXUS commercial operating plans: Starter ($19/mo), Growth ($49/mo), Business ($99/mo), and Enterprise (Contact Sales).",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24 sm:pb-32">
        {/* Glow backdrop */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-[50rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(47,107,255,0.18),transparent_70%)] blur-3xl" />
        <div className="pointer-events-none absolute right-[10%] top-[30%] h-80 w-80 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.15),transparent_65%)] blur-3xl" />

        <Pricing />
      </section>

      <Footer />
    </main>
  );
}
