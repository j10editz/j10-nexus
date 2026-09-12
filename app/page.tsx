import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LaunchHome from "@/components/marketing/LaunchHome";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#09090B] text-white">
      <Navbar />
      <LaunchHome />
      <Footer />
    </main>
  );
}
