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
        className="j10-gradient flex items-center justify-center rounded-xl p-1.5 shadow-[0_6px_20px_rgba(0,217,255,0.25)] transition-transform duration-200"
        style={{ width: size + 10, height: size + 10 }}
      >
        <Image
          src="/brand/j10-logo.png"
          alt="J10 Monogram"
          width={size}
          height={size}
          className="h-full w-full object-contain"
          priority
        />
      </span>
      {showWordmark && (
        <span className={wordmarkClassName}>
          J10 <span className="font-medium text-[#8d96a8]">NEXUS</span>
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
