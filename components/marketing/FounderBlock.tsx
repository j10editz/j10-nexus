import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export function FounderBlock() {
  return (
    <section
      aria-labelledby="founder-heading"
      className="my-10 md:my-12 mx-auto max-w-5xl rounded-2xl border border-white/[0.08] bg-[#0b1020]/70 p-5 md:p-7 shadow-xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] items-center gap-7 md:gap-8">
        {/* Compact Portrait: centered on mobile, max 240px on desktop */}
        <div className="mx-auto w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] md:w-[220px] md:h-[220px] max-w-[240px] max-h-[240px]">
          <div className="relative aspect-square w-full h-full overflow-hidden rounded-xl border border-white/[0.12] bg-[#07090f] shadow-lg">
            <Image
              src="/images/founder/jeefthe-osne-founder-ceo.png"
              alt="Jeefthe Richeder Osne, Founder and CEO of J10 NEXUS"
              width={1254}
              height={1254}
              quality={95}
              loading="lazy"
              sizes="(max-width: 768px) 220px, 240px"
              className="h-full w-full object-cover object-top"
            />
          </div>
        </div>

        {/* Founder statement: vertically centered */}
        <div className="flex flex-col justify-center text-left space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            From the founder
          </p>

          <div>
            <h3
              id="founder-heading"
              className="text-xl sm:text-2xl font-bold tracking-tight text-white"
            >
              Jeefthe Richeder Osne
            </h3>
            <p className="mt-0.5 text-sm text-[#8d96a8]">
              Founder and CEO, J10 NEXUS
            </p>
          </div>

          <p className="text-sm leading-relaxed text-[#c4cdd5]">
            I built J10 NEXUS after seeing how often small service businesses lose customers to missed calls, slow follow ups, and disconnected tools. Owners should not need a large team or five expensive apps to stay on top of the work. J10 NEXUS puts customer conversations, follow ups, bookings, and daily operations in one affordable place.
          </p>

          <div className="pt-1">
            <a
              href="https://www.linkedin.com/in/jeefthe-osne-143a9126b/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-white transition hover:border-cyan-400/40 hover:bg-white/[0.08] hover:text-cyan-200"
            >
              <svg
                className="w-4 h-4 text-[#0a66c2] fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.44 1.44 0 0 0 1.44-1.44 1.44 1.44 0 0 0-1.44-1.45 1.45 1.45 0 0 0-1.45 1.45 1.44 1.44 0 0 0 1.45 1.44m1.39 9.74v-8.37H5.07v8.37h2.78z" />
              </svg>
              <span>View LinkedIn profile</span>
              <ArrowUpRight size={13} className="text-[#8d96a8]" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
