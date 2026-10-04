import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LaunchHome from "@/components/marketing/RoyalHero";

interface HomePageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Home(props: HomePageProps) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const code = typeof searchParams?.code === "string" ? searchParams.code : undefined;
  if (code) {
    const error = typeof searchParams?.error === "string" ? searchParams.error : undefined;
    const errorParam = error ? `&error=${encodeURIComponent(error)}` : "";
    redirect(`/auth/callback?code=${encodeURIComponent(code)}${errorParam}`);
  }

  return (
    <main className="min-h-screen bg-[#09090B] text-white">
      <Navbar />
      <LaunchHome />
      <Footer />
    </main>
  );
}
