"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] =
    useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const immersiveFlow =
    pathname === "/dashboard/automation/flow" ||
    pathname.startsWith(
      "/dashboard/automation/flow/"
    );

  if (immersiveFlow) {
    return (
      <div className="min-h-dvh bg-[#07070A] text-white">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#09090B] text-white">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="min-h-dvh min-w-0 lg:pl-[260px]">
        <Topbar
          onOpenNavigation={() =>
            setMobileOpen(true)
          }
        />

        <main className="min-h-[calc(100dvh-72px)] min-w-0 overflow-x-hidden bg-[#09090B]">
          {children}
        </main>
      </div>
    </div>
  );
}
