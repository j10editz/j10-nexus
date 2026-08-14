import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#09090B] text-white">
      <Navbar />
      <Hero />
      <Features />
      <Footer />
    </main>
  );
}