"use client";

import { useState } from "react";

export default function IntegrationLogo({ name, domain, size = 34 }: { name: string; domain: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <span className="j10-integration-logo" style={{ width: size, height: size }} aria-hidden="true">
      {failed || domain === "j10-nexus.com" ? (
        <span className="j10-integration-logo-fallback">{initials}</span>
      ) : (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
