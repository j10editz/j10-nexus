import Link from "next/link";
import { Globe } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#08090C] px-4 text-center text-white">
      <div className="max-w-md rounded-2xl border border-white/[0.08] bg-[#111216] p-8 shadow-2xl">
        <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 mb-4">
          <Globe size={24} />
        </div>
        <h1 className="text-xl font-bold tracking-tight">404 - Page Not Found</h1>
        <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
          The requested page or funnel is unpublished or does not exist.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/[0.12] transition"
          >
            Return to J10 NEXUS Home
          </Link>
        </div>
      </div>
    </div>
  );
}
