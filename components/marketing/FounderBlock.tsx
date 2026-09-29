import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export function FounderBlock() {
  return (
    <section
      aria-labelledby="founder-heading"
      className="relative my-16 sm:my-20 rounded-[26px] border border-white/[0.08] bg-[#0b1020]/80 p-6 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-xl"
    >
      <div className="flex flex-col md:flex-row items-center md:items-start gap-8 sm:gap-10">
        {/* Approved Founder Photo (Head & Upper Torso Framed) */}
        <div className="relative shrink-0">
          <div className="relative h-44 w-44 sm:h-52 sm:w-52 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#07090f] shadow-2xl">
            <Image
              src="/images/founder/jeefthe-osne-founder-ceo.png"
              alt="Jeefthe Osne, Founder and CEO of J10 NEXUS"
              width={400}
              height={400}
              loading="lazy"
              sizes="(max-width: 640px) 176px, 208px"
              className="h-full w-full object-cover object-top"
            />
          </div>
          <div className="absolute -bottom-2.5 -right-2.5 rounded-full bg-cyan-950/90 border border-cyan-400/30 px-3 py-1 text-[10px] font-bold text-cyan-300 shadow-lg">
            Founder
          </div>
        </div>

        {/* Founder Details & Mission Copy */}
        <div className="flex-1 text-center md:text-left space-y-3.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/[0.08] px-3.5 py-1 text-xs font-semibold text-violet-200">
            <span>{"FOUNDER & MISSION"}</span>
          </div>

          <div>
            <h3
              id="founder-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white"
            >
              Jeefthe Richeder Osne
            </h3>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
              {"Founder & CEO, J10 NEXUS"}
            </p>
          </div>

          <p className="text-sm sm:text-base leading-relaxed text-[#c4cdd5] max-w-2xl">
            Built with purpose by Jeefthe Osne, Founder and CEO of J10 NEXUS—building affordable AI revenue and operations technology for service businesses.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-4">
            <a
              href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-400/40 hover:bg-white/[0.08] hover:text-cyan-200"
            >
              <svg
                className="w-4 h-4 text-[#0a66c2] fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.44 1.44 0 0 0 1.44-1.44 1.44 1.44 0 0 0-1.44-1.45 1.45 1.45 0 0 0-1.45 1.45 1.44 1.44 0 0 0 1.45 1.44m1.39 9.74v-8.37H5.07v8.37h2.78z" />
              </svg>
              <span>Connect on LinkedIn</span>
              <ArrowUpRight size={13} className="text-[#8d96a8]" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
