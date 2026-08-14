import { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

interface ModulePageProps {
  title: string;
  description: string;
  icon: ReactNode;
  action: string;
}

export default function ModulePage({
  title,
  description,
  icon,
  action,
}: ModulePageProps) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600">
            {icon}
          </div>

          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-zinc-400">{description}</p>
          </div>
        </div>

        <button className="rounded-xl bg-blue-600 px-5 py-3 font-medium transition hover:bg-blue-500">
          {action}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#111216] p-20 text-center">
        <h2 className="text-2xl font-semibold">{title}</h2>

        <p className="mt-3 text-zinc-500">
          This module is ready for implementation.
        </p>

        <button className="mt-8 inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 hover:bg-white/5">
          Start Building
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}