"use client";

import Image from "next/image";

type J10ThinkingStateProps = {
  label?: string;
};

export default function J10ThinkingState({
  label = "J10 is preparing your command center",
}: J10ThinkingStateProps) {
  return (
    <div className="j10-thinking" role="status" aria-live="polite">
      <div className="j10-thinking__halo" aria-hidden="true" />
      <div className="j10-thinking__mascot">
        <Image
          src="/brand/j10-expression-focused.png"
          alt="J10 mascot thinking"
          width={180}
          height={180}
          priority
        />
      </div>
      <p>{label}</p>
      <div className="j10-thinking__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
