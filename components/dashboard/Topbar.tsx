"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
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
  Plug,
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
              workspaceRole: "Authorization unavailable",
              workspaceName: "No Active Workspace",
              authFailed: true,
            }));
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          setProfileData((prev) => ({
            ...prev,
            loading: false,
            workspaceRole: "Authorization unavailable",
            workspaceName: "No Active Workspace",
            authFailed: true,
          }));
          return;
        }

        const roleLabels: Record<string, string> = {
          owner: "Owner",
          admin: "Admin",
          manager: "Manager",
          agent: "Agent",
          viewer: "Viewer",
        };

        const resolvedRole = data.activeWorkspaceRole
          ? roleLabels[data.activeWorkspaceRole] || data.activeWorkspaceRole
          : "No Workspace";

        setProfileData({
          displayName:
            data.profile?.display_name ||
            (data.user?.email ? data.user.email.split("@")[0] : "User"),
          jobTitle: data.profile?.job_title || "",
          workspaceRole: resolvedRole,
          workspaceName: data.activeWorkspaceName || "No Active Workspace",
          platformRole: data.platformRole || null,
          email: data.user?.email || "",
          avatarUrl: data.profile?.avatar_url || null,
          loading: false,
        });
      } catch {
        if (!cancelled) {
          setProfileData((prev) => ({
            ...prev,
            loading: false,
            workspaceRole: "Authorization unavailable",
            workspaceName: "No Active Workspace",
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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        setProfileOpen(false);
        searchInputRef.current?.blur();
      }
    }

    window.addEventListener("keydown", handleKeyboard);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyboard
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationSummary() {
      try {
        const response = await fetch(
          "/api/dashboard/notifications?limit=25",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as
            NotificationsSummaryResponse;

        if (!cancelled && data.success) {
          setAttentionCount(
            Math.max(
              0,
              Number(
                data.summary?.attention ?? 0
              )
            )
          );
        }
      } catch {
        // The notification center shows its own recoverable error state.
      }
    }

    void loadNotificationSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase();

    if (!normalizedQuery) {
      return readyDashboardNavigationItems.slice(0, 6);
    }

    return readyDashboardNavigationItems
      .filter((item) =>
        `${item.label} ${item.description}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 7);
  }, [query]);

  function navigate(href: string) {
    setQuery("");
    setSearchOpen(false);
    setProfileOpen(false);
    router.push(href);

    if (href.includes("#j10-ai")) {
      window.setTimeout(() => {
        document
          .getElementById("j10-ai")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 250);
    }
  }

  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

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

  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center border-b border-[#d9b85f]/12 bg-[#090712]/78 px-4 text-white backdrop-blur-2xl sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1680px] items-center gap-3">
        <button
          type="button"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/70 transition hover:bg-white/[0.07] hover:text-white lg:hidden"
        >
          <Menu size={19} />
        </button>

        <form
          onSubmit={handleSubmit}
          className="relative min-w-0 flex-1 sm:max-w-[520px]"
        >
          <div className="flex h-11 items-center rounded-xl border border-[#d9b85f]/14 bg-[#100c1d]/80 px-3.5 transition focus-within:border-[#d9b85f]/55 focus-within:ring-2 focus-within:ring-[#7d43df]/20">
            <Search
              className="mr-3 shrink-0 text-white/35"
              size={17}
            />

            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
            placeholder="Search leads, conversations, bookings..."
              aria-label="Search J10"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
            />

            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="rounded-md p-1 text-white/30 transition hover:bg-white/5 hover:text-white"
              >
                <X size={15} />
              </button>
            ) : (
              <span className="hidden items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-1 text-xs text-white/25 sm:flex">
                <Command size={10} /> /
              </span>
            )}
          </div>

          {searchOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101115] p-2 shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                <span>
                  {query ? "Search results" : "Quick access"}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="text-white/40 transition hover:text-white"
                >
                  Close
                </button>
              </div>

              {results.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-7 text-center text-sm text-white/35">
                  No working J10 module matches “{query}”.
                </div>
              ) : (
                <div className="space-y-1">
                  {results.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.href)}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.055]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                        <Search size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white/85">
                          {item.label}
                        </p>
                        <p className="truncate text-xs text-white/40">
                          {item.description}
                        </p>
                      </div>
                      <ChevronRight
                        size={15}
                        className="text-white/20 transition group-hover:translate-x-0.5 group-hover:text-blue-400"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Primary Global Ask J10 AI Launcher (Restrained Gradient) */}
          <button
            type="button"
            onClick={() => navigate("/dashboard#j10-ai")}
            className="hidden h-10 items-center gap-2 rounded-xl border border-[#7652aa]/35 bg-[#211530] px-3.5 text-xs font-semibold text-white/85 transition hover:border-[#a77bdd]/55 hover:bg-[#2a1a3e] active:scale-[0.99] md:flex"
          >
            <Image
              src="/brand/j10-logo.png"
              alt="J10 monogram"
              width={15}
              height={15}
              className="object-contain opacity-90"
            />
            <span>Ask J10 AI</span>
          </button>

          <Link
            href="/dashboard/notifications"
            aria-label={
              attentionCount > 0
                ? `${attentionCount} notifications need attention`
                : "Open notifications"
            }
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[#111216] text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Bell size={17} />
            {attentionCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#09090B] bg-red-500 px-1 text-[9px] font-bold text-white">
                {Math.min(attentionCount, 99)}
              </span>
            )}
          </Link>

          {/* Multi-Tenant Workspace & Client Switcher */}
          <WorkspaceSwitcher />

          {/* User Profile Menu */}
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen((current) => !current);
                setSearchOpen(false);
              }}
              aria-expanded={profileOpen}
              aria-label="Open user profile menu"
              className="flex h-10 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#111216] px-2.5 text-left transition hover:bg-white/[0.06] sm:px-3"
            >
              {profileData.avatarUrl && !avatarLoadFailed ? (
                <img
                  src={profileData.avatarUrl}
                  alt={`${profileData.displayName} avatar`}
                  width={24}
                  height={24}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarLoadFailed(true)}
                  className="h-6 w-6 rounded-full object-cover shrink-0 ring-1 ring-white/10"
                />
              ) : (
                <UserCircle2
                  size={24}
                  className="text-white/80 shrink-0"
                  aria-hidden="true"
                />
              )}
              <div className="hidden sm:block">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-white truncate max-w-[120px]">
                    {profileData.loading ? "Loading..." : profileData.displayName}
                  </p>
                  {isDemo && (
                    <span className="rounded bg-cyan-500/20 border border-cyan-500/30 px-1 py-0.2 text-[9px] font-semibold text-cyan-300">
                      Demo
                    </span>
                  )}
                  {!isDemo && profileData.platformRole === "platform_founder" && (
                    <span className="rounded bg-violet-500/20 border border-violet-500/30 px-1 py-0.2 text-[9px] font-semibold text-violet-300">
                      Founder
                    </span>
                  )}
                  {!isDemo && profileData.workspaceRole === "Owner" && (
                    <span className="rounded bg-emerald-500/20 border border-emerald-500/30 px-1 py-0.2 text-[9px] font-semibold text-emerald-300">
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {profileData.loading
                    ? "Loading..."
                    : isDemo
                    ? "Sample Identity"
                    : profileData.workspaceRole === "Authorization unavailable" || profileData.workspaceRole === "No Workspace"
                    ? "No Active Workspace"
                    : profileData.jobTitle
                    ? `${profileData.jobTitle} - ${profileData.workspaceRole}`
                    : profileData.workspaceRole}
                </p>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-2xl border border-white/[0.09] bg-[#101115] p-2 shadow-2xl shadow-black/50 z-50">
                <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                  <div className="flex items-center gap-3">
                    {profileData.avatarUrl && !dropdownAvatarFailed ? (
                      <img
                        src={profileData.avatarUrl}
                        alt={`${profileData.displayName} avatar`}
                        width={36}
                        height={36}
                        referrerPolicy="no-referrer"
                        onError={() => setDropdownAvatarFailed(true)}
                        className="h-9 w-9 rounded-full object-cover shrink-0 ring-1 ring-white/10"
                      />
                    ) : (
                      <UserCircle2
                        size={36}
                        className="text-white/80 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">
                        {profileData.displayName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400 truncate">
                        {profileData.email}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={`rounded px-2 py-0.5 ${
                        isDemo
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-medium"
                          : profileData.workspaceRole === "Owner"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium"
                          : "bg-white/[0.06] text-white/70"
                      }`}
                    >
                      {isDemo
                        ? "Sample Identity"
                        : profileData.workspaceRole || (profileData.loading ? "Loading..." : "No Workspace")}
                    </span>
                    {!isDemo && profileData.platformRole === "platform_founder" && (
                      <span className="rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 font-medium">
                        Platform Founder
                      </span>
                    )}
                    {!isDemo && profileData.platformRole === "platform_admin" && (
                      <span className="rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 font-medium">
                        Platform Admin
                      </span>
                    )}
                  </div>
                </div>

                {/* Account Dropdown Options */}
                <div className="mt-1 space-y-0.5">
                  <Link
                    href="/dashboard/settings/account"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <UserCircle2 size={15} className="text-slate-400" />
                    <span>Account &amp; Profile</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <Settings size={15} className="text-slate-400" />
                    <span>Workspace Settings</span>
                  </Link>

                  <Link
                    href="/dashboard/settings/integrations"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <Plug size={15} className="text-slate-400" />
                    <span>Connections</span>
                  </Link>

                  <Link
                    href="/dashboard/finance"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <CreditCard size={15} className="text-slate-400" />
                    <span>Billing &amp; Plan</span>
                  </Link>

                  <div className="my-1 border-t border-white/[0.08]" />

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    <LogOut size={15} />
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
