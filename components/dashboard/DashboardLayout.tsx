"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { TrialDashboardBanner } from "@/components/trial/TrialDashboardBanner";
import { TrialProvider } from "@/components/trial/TrialContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [colorMode, setColorMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("j10-dashboard-color-mode");
    if (saved === "light" || saved === "dark") {
      setColorMode(saved);
    }
  }, []);

  function toggleColorMode() {
    setColorMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("j10-dashboard-color-mode", next);
      return next;
    });
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const immersiveFlow =
    pathname === "/dashboard/automation/flow" ||
    pathname.startsWith("/dashboard/automation/flow/");

  if (immersiveFlow) {
    return (
      <div
        className="j10-dashboard-theme min-h-dvh bg-[var(--j10-dashboard-canvas)] text-[var(--j10-dashboard-text)]"
        data-dashboard-mode={colorMode}
      >
        {children}
      </div>
    );
  }

  return (
    <TrialProvider>
      <div
        className="j10-dashboard-theme min-h-dvh bg-[var(--j10-dashboard-canvas)] text-[var(--j10-dashboard-text)]"
        data-dashboard-mode={colorMode}
      >
        <Sidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />

        <div className="min-h-dvh min-w-0 lg:pl-[228px]">
          <Topbar
            onOpenNavigation={() => setMobileOpen(true)}
            colorMode={colorMode}
            onToggleColorMode={toggleColorMode}
          />

          <main className="min-h-[calc(100dvh-56px)] min-w-0 overflow-x-hidden bg-[var(--j10-dashboard-canvas)]">
            <TrialDashboardBanner />
            {children}
          </main>
        </div>
      </div>
    </TrialProvider>
  );
}
