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
  Moon,
  Search,
  Settings,
  Sun,
  UserCircle2,
  X,
} from "lucide-react";

import {
  readyDashboardNavigationItems,
} from "@/lib/dashboard/navigation";
import WorkspaceSwitcher from "@/components/dashboard/WorkspaceSwitcher";

type TopbarProps = {
  onOpenNavigation: () => void;
  colorMode: "dark" | "light";
  onToggleColorMode: () => void;
};

type NotificationsSummaryResponse = {
  success?: boolean;
  summary?: {
    attention?: number;
  };
};

export default function Topbar({
  onOpenNavigation,
  colorMode,
  onToggleColorMode,
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
              workspaceRole: "Authorization unavailable",
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
            workspaceRole: "Authorization unavailable",
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
      navigate("/dashboard/ai-operator"); // navigate("/dashboard#j10-ai")
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
    <header className="sticky top-0 z-30 flex h-[56px] shrink-0 items-center border-b border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)]/95 px-4 backdrop-blur-md sm:px-6">
      <div className="flex w-full items-center justify-between gap-3">
        {/* Mobile Left: Menu Toggle + Page Title / J10 Mark (<= 56px, clean) */}
        <div className="flex items-center gap-2.5 lg:hidden">
          <button
            type="button"
            onClick={onOpenNavigation}
            aria-label="Open navigation"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] text-[var(--j10-dashboard-text-secondary)] transition hover:bg-[var(--j10-dashboard-hover)] hover:text-[var(--j10-dashboard-text)]"
          >
            <Menu size={16} />
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface-elevated)] p-0.5">
              <Image
                src="/brand/j10-logo.png"
                alt="J10 monogram"
                width={14}
                height={14}
                className="h-full w-full object-contain"
              />
            </div>
            <span className="max-w-[140px] truncate text-xs font-semibold text-[var(--j10-dashboard-text)]">
              {mobilePageTitle}
            </span>
          </div>
        </div>

        {/* Desktop Left: Visually Quiet Compact Search */}
        <form
          onSubmit={handleSubmit}
          className="relative hidden min-w-0 flex-1 max-w-[380px] lg:block"
        >
          <div className="flex h-8 items-center rounded-lg border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface-elevated)] px-2.5 transition focus-within:border-[var(--j10-dashboard-accent)] focus-within:bg-[var(--j10-dashboard-surface)] focus-within:ring-1 focus-within:ring-[var(--j10-dashboard-accent)]/20">
            <Search className="mr-2 shrink-0 text-[var(--j10-dashboard-text-secondary)]" size={14} />

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
              className="min-w-0 flex-1 bg-transparent text-xs text-[var(--j10-dashboard-text)] outline-none placeholder:text-[var(--j10-dashboard-text-muted)]"
            />

            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="rounded p-0.5 text-[var(--j10-dashboard-text-secondary)] hover:text-[var(--j10-dashboard-text)]"
              >
                <X size={13} />
              </button>
            ) : (
              <span className="flex items-center gap-0.5 text-[10px] text-[var(--j10-dashboard-text-muted)]">
                <Command size={10} />K
              </span>
            )}
          </div>

          {searchOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.32)]">
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--j10-dashboard-text-muted)]">
                <span>{query ? "Search results" : "Quick access"}</span>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="text-[var(--j10-dashboard-text-muted)] hover:text-[var(--j10-dashboard-text)]"
                >
                  Close
                </button>
              </div>

              {results.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--j10-dashboard-text-secondary)]">
                  No module matches “{query}”.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {results.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.href)}
                      className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-[var(--j10-dashboard-hover)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[var(--j10-dashboard-text)]">
                          {item.label}
                        </p>
                        <p className="truncate text-[10px] text-[var(--j10-dashboard-text-secondary)]">
                          {item.description}
                        </p>
                      </div>
                      <ChevronRight
                        size={12}
                        className="text-[var(--j10-dashboard-text-muted)] transition-colors group-hover:text-[var(--j10-dashboard-accent)]"
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
          <button
            type="button"
            onClick={onToggleColorMode}
            aria-label={`Switch to ${colorMode === "dark" ? "light" : "dark"} dashboard`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] text-[var(--j10-dashboard-text-secondary)] transition hover:bg-[var(--j10-dashboard-hover)] hover:text-[var(--j10-dashboard-text)]"
            title={`Use ${colorMode === "dark" ? "light" : "dark"} dashboard`}
          >
            {colorMode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Notifications */}
          <Link
            href="/dashboard/notifications"
            aria-label={
              attentionCount > 0
                ? `${attentionCount} notifications need attention`
                : "Open notifications"
            }
            className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] text-[var(--j10-dashboard-text-secondary)] shadow-sm transition hover:bg-[var(--j10-dashboard-hover)] hover:text-[var(--j10-dashboard-text)]"
          >
            <Bell size={15} />
            {attentionCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D97706] px-1 text-[9px] font-bold text-white">
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
              className="flex h-8 items-center gap-2 rounded-lg border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] px-2 text-left shadow-sm transition hover:bg-[var(--j10-dashboard-hover)]"
            >
              {profileData.avatarUrl && !avatarLoadFailed ? (
                <img
                  src={profileData.avatarUrl}
                  alt={`${profileData.displayName} avatar`}
                  width={22}
                  height={22}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarLoadFailed(true)}
                  className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-[var(--j10-dashboard-border)]"
                />
              ) : (
                <UserCircle2
                  size={18}
                  className="shrink-0 text-[var(--j10-dashboard-text-secondary)]"
                  aria-hidden="true"
                />
              )}
              <div className="hidden sm:block">
                <span className="block max-w-[100px] truncate text-xs font-semibold leading-none text-[var(--j10-dashboard-text)]">
                  {profileData.loading ? "..." : profileData.displayName}
                </span>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 rounded-xl border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.32)]">
                <div className="mb-1 rounded-lg bg-[var(--j10-dashboard-surface-elevated)] px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    {profileData.avatarUrl && !dropdownAvatarFailed ? (
                      <img
                        src={profileData.avatarUrl}
                        alt={`${profileData.displayName} avatar`}
                        width={30}
                        height={30}
                        referrerPolicy="no-referrer"
                        onError={() => setDropdownAvatarFailed(true)}
                        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-[var(--j10-dashboard-border)]"
                      />
                    ) : (
                      <UserCircle2
                        size={28}
                        className="shrink-0 text-[var(--j10-dashboard-text-secondary)]"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--j10-dashboard-text)]">
                        {profileData.displayName}
                      </p>
                      <p className="truncate text-[10px] text-[var(--j10-dashboard-text-secondary)]">
                        {profileData.email || "No email"}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                        {profileData.workspaceRole === "Owner" && (
                          <span className="rounded bg-[#F0ECFF] px-1.5 py-0.5 font-medium text-[#6347E8]">
                            Owner
                          </span>
                        )}
                        {profileData.platformRole === "platform_founder" && (
                          <span className="rounded bg-[#F0ECFF] px-1.5 py-0.5 font-medium text-[#6347E8]">
                            Founder
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <Link
                    href="/dashboard/settings/account"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--j10-dashboard-text-secondary)] transition-colors hover:bg-[var(--j10-dashboard-hover)] hover:text-[var(--j10-dashboard-text)]"
                  >
                    <UserCircle2 size={14} />
                    <span>Account Settings</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--j10-dashboard-text-secondary)] transition-colors hover:bg-[var(--j10-dashboard-hover)] hover:text-[var(--j10-dashboard-text)]"
                  >
                    <Settings size={14} />
                    <span>Workspace Settings</span>
                  </Link>

                  <Link
                    href="/dashboard/settings/billing"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--j10-dashboard-text-secondary)] transition-colors hover:bg-[var(--j10-dashboard-hover)] hover:text-[var(--j10-dashboard-text)]"
                  >
                    <CreditCard size={14} />
                    <span>Billing & Subscription</span>
                  </Link>

                  <div className="my-1 border-t border-[var(--j10-dashboard-border)]" />

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[#E11D48] hover:bg-[#FFE4E8] transition-colors"
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
