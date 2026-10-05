import Image from "next/image";
import Link from "next/link";

interface J10LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  className?: string;
  href?: string;
}

/**
 * Official J10 Monogram Brand Identity Component
 * Non-negotiable brand rules:
 * - J10 monogram is the official brand identity mark.
 * - Never use generic sparkles or star icons for J10.
 * - Never use NEXA as the mascot name or standalone identity.
 */
export function J10Logo({
  size = 28,
  showWordmark = true,
  wordmarkClassName = "text-[17px] font-bold tracking-tight text-white",
  className = "",
  href,
}: J10LogoProps) {
  const content = (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="flex items-center justify-center rounded-xl p-1.5 bg-gradient-to-tr from-[#7c3aed] via-[#9333ea] to-[#a855f7] border border-purple-400/30 shadow-[0_0_22px_rgba(168,85,247,0.55)] transition-transform duration-200 group-hover:scale-105"
        style={{ width: size + 10, height: size + 10 }}
      >
        <Image
          src="/brand/j10-logo.png"
          alt="J10 Monogram"
          width={size}
          height={size}
          className="h-full w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
          priority
        />
      </span>
      {showWordmark && (
        <span className={wordmarkClassName}>
          <span className="font-bold text-purple-200">J10</span>{" "}
          <span className="font-extrabold text-purple-400">NEXUS</span>
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group transition-opacity hover:opacity-95">
        {content}
      </Link>
    );
  }

  return content;
}
