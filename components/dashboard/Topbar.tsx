"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Menu,
  Search,
  Settings,
  Sparkles,
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
  const searchInputRef =
    useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] =
    useState(false);
  const [profileOpen, setProfileOpen] =
    useState(false);
  const [attentionCount, setAttentionCount] =
    useState(0);

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

  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#09090B]/95 px-3 text-white backdrop-blur-xl sm:px-5 lg:px-7">
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
        <div className="flex h-11 items-center rounded-xl border border-white/[0.08] bg-[#111216] px-3.5 transition focus-within:border-blue-500/35 focus-within:ring-2 focus-within:ring-blue-500/10">
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
            placeholder="Search J10 modules and operations..."
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
            <span className="hidden items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-1 text-[10px] text-white/25 sm:flex">
              <Command size={10} /> /
            </span>
          )}
        </div>

        {searchOpen && (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101115] p-2 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">
              <span>
                {query ? "Search results" : "Quick access"}
              </span>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="text-white/30 transition hover:text-white"
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
                      <p className="truncate text-[11px] text-white/35">
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
        <button
          type="button"
          onClick={() => navigate("/dashboard#j10-ai")}
          className="hidden h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/10 transition hover:-translate-y-0.5 hover:shadow-blue-500/20 md:flex"
        >
          <Sparkles size={17} />
          Ask J10 AI
        </button>

        <Link
          href="/dashboard/notifications"
          aria-label={
            attentionCount > 0
              ? `${attentionCount} notifications need attention`
              : "Open notifications"
          }
          className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-[#111216] text-white/60 transition hover:bg-white/[0.06] hover:text-white"
        >
          <Bell size={18} />
          {attentionCount > 0 && (
            <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#09090B] bg-red-500 px-1 text-[9px] font-bold text-white">
              {Math.min(attentionCount, 99)}
            </span>
          )}
        </Link>

        {/* Multi-Tenant Workspace & Client Switcher */}
        <WorkspaceSwitcher />

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((current) => !current);
              setSearchOpen(false);
            }}
            aria-expanded={profileOpen}
            aria-label="Open workspace menu"
            className="flex h-11 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#111216] px-2.5 text-left transition hover:bg-white/[0.06] sm:px-3"
          >
            <UserCircle2
              size={27}
              className="text-white/80"
            />
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-white">
                CEO
              </p>
              <p className="text-[10px] text-white/35">
                Founder
              </p>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-2xl border border-white/[0.09] bg-[#101115] p-2 shadow-2xl shadow-black/50">
              <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                <p className="text-sm font-semibold text-white">
                  J10 Workspace
                </p>
                <p className="mt-1 text-xs text-white/35">
                  Founder operations environment
                </p>
              </div>

              <Link
                href="/dashboard/settings"
                onClick={() => setProfileOpen(false)}
                className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-white"
              >
                <Settings size={16} />
                Workspace settings
              </Link>

              <Link
                href="/dashboard/settings/integrations"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-white"
              >
                <Sparkles size={16} />
                Integration connections
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
