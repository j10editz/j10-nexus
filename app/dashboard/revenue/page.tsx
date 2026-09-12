import ExecutiveRevenueDashboard from "@/components/revenue/ExecutiveRevenueDashboard";

export default function RevenuePage() {
  return <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-4 py-7 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1280px]"><p className="text-sm font-medium text-blue-300">Revenue</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Revenue operations</h1><p className="mt-2 text-sm text-zinc-400">Track customer movement from qualified conversations through payment.</p><div className="mt-7"><ExecutiveRevenueDashboard /></div></div></div>;
}
