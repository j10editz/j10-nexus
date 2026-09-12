"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface J10MascotProps {
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
  glow?: boolean;
}

/**
 * Official J10 Mascot Component
 * Clean luxury-tech presentation:
 * - Transparent PNG only (/brand/j10-mascot.png)
 * - J10 chest monogram fully visible
 * - Very subtle, elegant scroll parallax / gentle presence
 * - No spinning, no aggressive rotation
 * - Respects prefers-reduced-motion
 */
export function J10Mascot({
  width = 360,
  height = 420,
  priority = false,
  className = "",
  glow = true,
}: J10MascotProps) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const handleScroll = () => {
      // Tiny subtle parallax translation (max 6px)
      const currentScroll = window.scrollY;
      setScrollY(Math.min(currentScroll * 0.03, 6));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Subtle soft violet ambient glow */}
      {glow && (
        <div
          className="pointer-events-none absolute -inset-6 rounded-full bg-gradient-to-tr from-[#6366ff]/20 via-[#a855f7]/20 to-[#00d9ff]/15 opacity-70 blur-3xl"
          aria-hidden="true"
        />
      )}

      {/* Mascot Image with gentle, subtle vertical parallax */}
      <div
        className="relative z-10 transition-transform duration-500 ease-out"
        style={{
          transform: `translateY(${-scrollY}px)`,
        }}
      >
        <Image
          src="/brand/j10-mascot.png"
          alt="J10 AI Operating System Mascot"
          width={width}
          height={height}
          priority={priority}
          className="h-auto w-full max-w-[340px] sm:max-w-[400px] object-contain drop-shadow-[0_20px_40px_rgba(0,217,255,0.2)]"
        />
      </div>
    </div>
  );
}
