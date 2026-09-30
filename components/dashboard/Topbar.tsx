"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Bell,
  ChevronRight,
  Command,
  CreditCard,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCircle2,
  X,
} from "lucide-react";

import {
  readyDashboardNavigationItems,
} from "@/lib/dashboard/navigation";
import WorkspaceSwitcher from "@/components/dashboard/WorkspaceSwitcher";

type TopbarProps = {
  onOpenNavigation: () => void;
};

type NotificationsSummaryResponse = {
  success?: boolean;
  summary?: {
    attention?: number;
  };
};

export default function Topbar({
  onOpenNavigation,
}: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const isDemo = searchParams.get("demo") === "true";

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [attentionCount, setAttentionCount] = useState(0);

  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [dropdownAvatarFailed, setDropdownAvatarFailed] = useState(false);

  const [profileData, setProfileData] = useState<{
    displayName: string;
    jobTitle: string;
    workspaceRole: string;
    workspaceName: string;
    platformRole: string | null;
    email: string;
    avatarUrl: string | null;
    loading: boolean;
    authFailed?: boolean;
  }>(() => {
    if (isDemo) {
      return {
        displayName: "Demo Owner",
        jobTitle: "Sample Identity",
        workspaceRole: "Demo Workspace",
        workspaceName: "Apex Commercial & Home Services",
        platformRole: null,
        email: "demo.owner@apexservices.com",
        avatarUrl: null,
        loading: false,
      };
    }
    return {
      displayName: "User",
      jobTitle: "",
      workspaceRole: "",
      workspaceName: "",
      platformRole: null,
      email: "",
      avatarUrl: null,
      loading: true,
    };
  });

  useEffect(() => {
    setAvatarLoadFailed(false);
    setDropdownAvatarFailed(false);
  }, [profileData.avatarUrl]);

  useEffect(() => {
    if (isDemo) {
      setProfileData({
        displayName: "Demo Owner",
        jobTitle: "Sample Identity",
        workspaceRole: "Demo Workspace",
        workspaceName: "Apex Commercial & Home Services",
        platformRole: null,
        email: "demo.owner@apexservices.com",
        avatarUrl: null,
        loading: false,
      });
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      try {
        const res = await fetch("/api/account/profile", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setProfileData((prev) => ({
              ...prev,
              loading: false,
              authFailed: true,
            }));
          }
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (data.success && data.profile) {
          setProfileData({
            displayName:
              data.profile.full_name ||
              data.profile.display_name ||
              data.profile.email?.split("@")[0] ||
              "User",
            jobTitle: data.profile.job_title || "",
            workspaceRole: data.workspaceRole || "Owner",
            workspaceName: data.workspaceName || "Active Workspace",
            platformRole: data.platformRole || null,
            email: data.profile.email || "",
            avatarUrl: data.profile.avatar_url || null,
            loading: false,
            authFailed: false,
          });
        } else {
          setProfileData((prev) => ({ ...prev, loading: false }));
        }
      } catch {
        if (!cancelled) {
          setProfileData((prev) => ({
            ...prev,
            loading: false,
            authFailed: true,
          }));
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  // Notifications count
  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const res = await fetch("/api/dashboard/notifications", {
          cache: "no-store",
        });
        if (!res.ok) return;

        const data = (await res.json()) as NotificationsSummaryResponse;
        if (cancelled) return;

        if (data.success && typeof data.summary?.attention === "number") {
          setAttentionCount(data.summary.attention);
        }
      } catch {}
    }

    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard shortcut for search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        setProfileOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Click outside to close profile dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return readyDashboardNavigationItems.slice(0, 6);
    }
    return readyDashboardNavigationItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [query]);

  function navigate(href?: string) {
    if (!href) return;
    setSearchOpen(false);
    setQuery("");
    router.push(href);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = query.trim().toLowerCase();
    if (clean.startsWith("ai") || clean.includes("operator")) {
      navigate("/dashboard#j10-ai");
      return;
    }
    const firstResult = results[0];
    if (firstResult?.href) {
      navigate(firstResult.href);
    }
  }

  async function handleSignOut() {
    setProfileOpen(false);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {}
    router.push("/login");
  }

  // Derive compact current page name for mobile header
  const mobilePageTitle = useMemo(() => {
    if (pathname === "/dashboard") return "Command Center";
    if (pathname === "/dashboard/inbox") return "Inbox";
    if (pathname === "/dashboard/crm") return "Lead Center";
    if (pathname === "/dashboard/booking") return "Booking";
    if (pathname === "/dashboard/growth") return "Growth";
    if (pathname === "/dashboard/ai-operator") return "AI Operator";
    if (pathname === "/dashboard/pay") return "Pay";
    if (pathname === "/dashboard/connections") return "Connections";
    if (pathname === "/dashboard/brand") return "Brand";
    return "J10 NEXUS";
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-[56px] shrink-0 items-center border-b border-[#242A35] bg-[#090B10]/95 px-4 backdrop-blur-md sm:px-6">
      <div className="flex w-full items-center justify-between gap-3">
        {/* Mobile Left: Menu Toggle + Page Title / J10 Mark */}
        <div className="flex items-center gap-2.5 lg:hidden">
          <button
            type="button"
            onClick={onOpenNavigation}
            aria-label="Open navigation"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#242A35] bg-[#101319] text-[#98A2B3] transition hover:bg-[#151922] hover:text-[#F5F7FA]"
          >
            <Menu size={16} />
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-[#101319] border border-[#242A35] p-0.5">
              <Image
                src="/brand/j10-logo.png"
                alt="J10 monogram"
                width={14}
                height={14}
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-xs font-semibold text-[#F5F7FA] truncate max-w-[140px]">
              {mobilePageTitle}
            </span>
          </div>
        </div>

        {/* Desktop Left: Visually Quiet Compact Search */}
        <form
          onSubmit={handleSubmit}
          className="relative hidden min-w-0 flex-1 max-w-[380px] lg:block"
        >
          <div className="flex h-8 items-center rounded-md border border-[#242A35] bg-[#101319] px-2.5 transition focus-within:border-[#4F7CFF]/50 focus-within:ring-1 focus-within:ring-[#4F7CFF]/20">
            <Search className="mr-2 shrink-0 text-[#667085]" size={14} />

            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search J10..."
              aria-label="Search J10"
              className="min-w-0 flex-1 bg-transparent text-xs text-[#F5F7FA] outline-none placeholder:text-[#667085]"
            />

            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="rounded p-0.5 text-[#667085] hover:text-[#F5F7FA]"
              >
                <X size={13} />
              </button>
            ) : (
              <span className="flex items-center gap-0.5 text-[10px] text-[#667085]">
                <Command size={10} />K
              </span>
            )}
          </div>

          {searchOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] overflow-hidden rounded-lg border border-[#242A35] bg-[#101319] p-1.5 shadow-xl z-50">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#667085]">
                <span>{query ? "Search results" : "Quick access"}</span>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="text-[#667085] hover:text-[#F5F7FA]"
                >
                  Close
                </button>
              </div>

              {results.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[#667085]">
                  No module matches “{query}”.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {results.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.href)}
                      className="group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition hover:bg-[#151922]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[#F5F7FA]">
                          {item.label}
                        </p>
                        <p className="truncate text-[10px] text-[#667085]">
                          {item.description}
                        </p>
                      </div>
                      <ChevronRight
                        size={12}
                        className="text-[#667085] group-hover:text-[#4F7CFF] transition-colors"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Right Side: Notifications + Workspace Switcher (Desktop) + User Avatar */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <Link
            href="/dashboard/notifications"
            aria-label={
              attentionCount > 0
                ? `${attentionCount} notifications need attention`
                : "Open notifications"
            }
            className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[#242A35] bg-[#101319] text-[#98A2B3] transition hover:bg-[#151922] hover:text-[#F5F7FA]"
          >
            <Bell size={15} />
            {attentionCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black">
                {Math.min(attentionCount, 99)}
              </span>
            )}
          </Link>

          {/* Multi-Tenant Workspace Switcher — Hidden on Mobile Header */}
          <div className="hidden md:block">
            <WorkspaceSwitcher />
          </div>

          {/* User Profile Avatar & Menu */}
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen((current) => !current);
                setSearchOpen(false);
              }}
              aria-expanded={profileOpen}
              aria-label="Open user profile menu"
              className="flex h-8 items-center gap-2 rounded-md border border-[#242A35] bg-[#101319] px-2 text-left transition hover:bg-[#151922]"
            >
              {profileData.avatarUrl && !avatarLoadFailed ? (
                <img
                  src={profileData.avatarUrl}
                  alt={`${profileData.displayName} avatar`}
                  width={22}
                  height={22}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarLoadFailed(true)}
                  className="h-5 w-5 rounded-full object-cover shrink-0 ring-1 ring-[#242A35]"
                />
              ) : (
                <UserCircle2
                  size={18}
                  className="text-[#98A2B3] shrink-0"
                  aria-hidden="true"
                />
              )}
              <div className="hidden sm:block">
                <span className="text-xs font-medium text-[#F5F7FA] truncate max-w-[100px] block leading-none">
                  {profileData.loading ? "..." : profileData.displayName}
                </span>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-60 rounded-lg border border-[#242A35] bg-[#101319] p-1.5 shadow-xl z-50">
                <div className="rounded-md bg-[#151922] px-3 py-2 mb-1">
                  <div className="flex items-center gap-2.5">
                    {profileData.avatarUrl && !dropdownAvatarFailed ? (
                      <img
                        src={profileData.avatarUrl}
                        alt={`${profileData.displayName} avatar`}
                        width={30}
                        height={30}
                        referrerPolicy="no-referrer"
                        onError={() => setDropdownAvatarFailed(true)}
                        className="h-7 w-7 rounded-full object-cover shrink-0 ring-1 ring-[#242A35]"
                      />
                    ) : (
                      <UserCircle2
                        size={28}
                        className="text-[#98A2B3] shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#F5F7FA] truncate">
                        {profileData.displayName}
                      </p>
                      <p className="truncate text-[10px] text-[#667085]">
                        {profileData.email || "No email"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <Link
                    href="/dashboard/settings/account"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[#98A2B3] hover:bg-[#151922] hover:text-[#F5F7FA] transition-colors"
                  >
                    <UserCircle2 size={14} />
                    <span>Account Settings</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[#98A2B3] hover:bg-[#151922] hover:text-[#F5F7FA] transition-colors"
                  >
                    <Settings size={14} />
                    <span>Workspace Settings</span>
                  </Link>

                  <Link
                    href="/dashboard/settings/billing"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[#98A2B3] hover:bg-[#151922] hover:text-[#F5F7FA] transition-colors"
                  >
                    <CreditCard size={14} />
                    <span>Billing & Subscription</span>
                  </Link>

                  <div className="my-1 border-t border-[#242A35]" />

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
