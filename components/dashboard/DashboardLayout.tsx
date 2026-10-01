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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const immersiveFlow =
    pathname === "/dashboard/automation/flow" ||
    pathname.startsWith("/dashboard/automation/flow/");

  if (immersiveFlow) {
    return (
      <div className="j10-dashboard-theme min-h-dvh bg-[#070A08] text-[#F3F7F4]">
        {children}
      </div>
    );
  }

  return (
    <TrialProvider>
      <div className="j10-dashboard-theme min-h-dvh bg-[#070A08] text-[#F3F7F4]">
        <Sidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />

        <div className="min-h-dvh min-w-0 lg:pl-[228px]">
          <Topbar onOpenNavigation={() => setMobileOpen(true)} />

          <main className="min-h-[calc(100dvh-56px)] min-w-0 overflow-x-hidden bg-[#070A08]">
            <TrialDashboardBanner />
            {children}
          </main>
        </div>
      </div>
    </TrialProvider>
  );
}
