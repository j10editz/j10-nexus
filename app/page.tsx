import { redirect } from "next/navigation";
import LaunchHome from "@/components/marketing/LaunchHome";

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
    <main className="min-h-screen bg-[#07060f] text-white">
      <LaunchHome />
    </main>
  );
}
