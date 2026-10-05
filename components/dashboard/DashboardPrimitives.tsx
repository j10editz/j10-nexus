"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * J10 NEXUS — Canonical Dashboard Primitives
 * Modern Purple, Black & White Palette:
 * - Canvas Background: #08080C (Deep Cosmic Black)
 * - Primary Surface: #12111A (Dark Charcoal Glass)
 * - Secondary Surface: #171522
 * - Accent Border: rgba(168, 85, 247, 0.18) (Purple Border Subtle)
 * - Hover Border: rgba(168, 85, 247, 0.45)
 * - Primary Text: #FFFFFF (Crisp White)
 * - Secondary Text: #CBD5E1 (Light Slate)
 * - Muted Text: rgba(216, 180, 254, 0.6) (Lavender Muted)
 * - Vibrant Purple: #7C3AED (Royal Purple), #9333EA (Electric Purple), #C084FC (Bright Lilac)
 */

// 1. Page Header
interface DashboardPageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function DashboardPageHeader({
  title,
  subtitle,
  badge,
  actions,
  className = "",
}: DashboardPageHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-3 pb-4 mb-5 border-b border-purple-900/25 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white drop-shadow-sm">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs text-slate-300 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

// 2. Section Header
interface DashboardSectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  count?: number;
  className?: string;
}

export function DashboardSectionHeader({
  title,
  description,
  action,
  count,
  className = "",
}: DashboardSectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-white">
            {title}
          </h2>
          {typeof count === "number" && (
            <span className="rounded-full bg-purple-950/60 border border-purple-500/30 px-2 py-0.5 text-[10px] font-semibold text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.25)]">
              {count}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// 3. Compact Metric Tile (Modern Purple, Black & White)
interface DashboardMetricTileProps {
  label: string;
  value: string | number;
  subtitle?: string;
  destinationLabel?: string;
  href?: string;
  semanticStatus?: "neutral" | "warning" | "error" | "success";
  className?: string;
}

export function DashboardMetricTile({
  label,
  value,
  subtitle,
  destinationLabel,
  href,
  semanticStatus = "neutral",
  className = "",
}: DashboardMetricTileProps) {
  const isProblem =
    (semanticStatus === "warning" || semanticStatus === "error" || semanticStatus === "success") &&
    (typeof value === "number" ? value > 0 : value !== "0" && value !== "$0");

  const valueColor = isProblem
    ? semanticStatus === "warning"
      ? "text-amber-400"
      : semanticStatus === "error"
      ? "text-rose-400"
      : "text-emerald-400"
    : "text-white";

  const borderHighlight = isProblem
    ? semanticStatus === "warning"
      ? "hover:border-amber-400/60 hover:shadow-[0_8px_30px_rgba(245,158,11,0.15)]"
      : semanticStatus === "error"
      ? "hover:border-rose-400/60 hover:shadow-[0_8px_30px_rgba(244,63,94,0.15)]"
      : "hover:border-emerald-400/60 hover:shadow-[0_8px_30px_rgba(16,185,129,0.15)]"
    : "hover:border-purple-400/60 hover:shadow-[0_8px_30px_rgba(168,85,247,0.2)]";

  const content = (
    <div
      className={`group flex flex-col justify-between h-[88px] sm:h-[94px] rounded-xl border border-purple-500/15 bg-[#12111A]/90 p-3.5 backdrop-blur-md shadow-[0_6px_20px_rgba(0,0,0,0.4)] transition-all duration-200 hover:-translate-y-0.5 ${borderHighlight} hover:bg-[#161422] ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors truncate">
          {label}
        </span>
        {isProblem && (
          <span
            className={`h-2 w-2 rounded-full ring-2 ring-black/40 animate-pulse ${
              semanticStatus === "warning"
                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                : semanticStatus === "error"
                ? "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]"
                : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            }`}
          />
        )}
      </div>

      <div className="mt-1">
        <div className={`text-2xl font-extrabold tracking-tight ${valueColor}`}>
          {value}
        </div>
        {destinationLabel ? (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-purple-300/80 group-hover:text-purple-300 transition-colors">
            <span className="truncate">{destinationLabel}</span>
            <ChevronRight
              size={12}
              className="shrink-0 text-purple-400 group-hover:text-purple-200 transition-transform group-hover:translate-x-0.5"
            />
          </div>
        ) : subtitle ? (
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

// 4. Status Badge (Modern Purple, Black & White)
type StatusBadgeVariant =
  | "connected"
  | "available"
  | "setup_incomplete"
  | "degraded"
  | "coming_soon"
  | "success"
  | "warning"
  | "error"
  | "neutral";

interface DashboardStatusBadgeProps {
  status: StatusBadgeVariant;
  label: string;
  className?: string;
}

export function DashboardStatusBadge({
  status,
  label,
  className = "",
}: DashboardStatusBadgeProps) {
  const styles: Record<StatusBadgeVariant, string> = {
    connected: "bg-emerald-950/60 text-emerald-300 border-emerald-500/30",
    success: "bg-emerald-950/60 text-emerald-300 border-emerald-500/30",
    available: "bg-purple-950/60 text-purple-300 border-purple-500/35",
    setup_incomplete: "bg-amber-950/60 text-amber-300 border-amber-500/30",
    warning: "bg-amber-950/60 text-amber-300 border-amber-500/30",
    degraded: "bg-rose-950/60 text-rose-300 border-rose-500/30",
    error: "bg-rose-950/60 text-rose-300 border-rose-500/30",
    coming_soon: "bg-[#181624] text-slate-400 border-purple-500/15",
    neutral: "bg-[#181624] text-slate-300 border-purple-500/15",
  };

  const dotColors: Record<StatusBadgeVariant, string> = {
    connected: "bg-emerald-400",
    success: "bg-emerald-400",
    available: "bg-purple-400",
    setup_incomplete: "bg-amber-400",
    warning: "bg-amber-400",
    degraded: "bg-rose-400",
    error: "bg-rose-400",
    coming_soon: "bg-slate-400",
    neutral: "bg-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium border ${styles[status]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[status]}`} />
      <span>{label}</span>
    </span>
  );
}

// 5. Compact Empty State
interface DashboardEmptyStateProps {
  message: string;
  subtext?: string;
  action?: ReactNode;
  className?: string;
}

export function DashboardEmptyState({
  message,
  subtext,
  action,
  className = "",
}: DashboardEmptyStateProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border border-purple-500/15 bg-[#12111A]/80 px-4 py-3 text-xs shadow-[0_4px_16px_rgba(0,0,0,0.3)] ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-white">{message}</p>
        {subtext && <p className="text-[11px] text-slate-400 mt-0.5">{subtext}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// 6. Action Row (for operational priority list & activity)
interface DashboardActionRowProps {
  title: string;
  context?: string;
  statusBadge?: ReactNode;
  time?: string;
  actionLabel: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function DashboardActionRow({
  title,
  context,
  statusBadge,
  time,
  actionLabel,
  actionHref,
  onAction,
  className = "",
}: DashboardActionRowProps) {
  return (
    <div
      className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3.5 border-b border-purple-900/20 last:border-b-0 hover:bg-[#161424] transition-all duration-150 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-white group-hover:text-purple-200 transition-colors">
            {title}
          </span>
          {statusBadge}
        </div>
        {context && (
          <p className="text-[11px] text-slate-300 mt-0.5 truncate">{context}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
        {time && <span className="text-[11px] text-slate-400 font-mono">{time}</span>}
        {actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 rounded-lg bg-[#181626] border border-purple-500/25 px-2.5 py-1 text-[11px] font-medium text-purple-200 hover:border-purple-400 hover:bg-purple-950/60 hover:text-white transition-all shadow-sm group-hover:shadow-[0_0_12px_rgba(168,85,247,0.2)]"
          >
            <span>{actionLabel}</span>
            <ChevronRight size={12} className="text-purple-400 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 rounded-lg bg-[#181626] border border-purple-500/25 px-2.5 py-1 text-[11px] font-medium text-purple-200 hover:border-purple-400 hover:bg-purple-950/60 hover:text-white transition-all shadow-sm"
          >
            <span>{actionLabel}</span>
            <ChevronRight size={12} className="text-purple-400" />
          </button>
        )}
      </div>
    </div>
  );
}

// 7. Surface / Card Container (Purple, Black & White)
interface DashboardSurfaceProps {
  children: ReactNode;
  level?: "primary" | "secondary" | "subtle";
  className?: string;
}

export function DashboardSurface({
  children,
  level = "primary",
  className = "",
}: DashboardSurfaceProps) {
  const bg =
    level === "primary"
      ? "bg-[#12111A]/90"
      : level === "secondary"
      ? "bg-[#161422]/90"
      : "bg-[#1A1828]/90";
  return (
    <div
      className={`rounded-xl border border-purple-500/15 ${bg} shadow-[0_6px_24px_rgba(0,0,0,0.45)] backdrop-blur-md overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

// 8. Standard Button
interface DashboardButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  icon?: ReactNode;
}

export function DashboardButton({
  children,
  variant = "secondary",
  size = "md",
  onClick,
  disabled = false,
  type = "button",
  className = "",
  icon,
}: DashboardButtonProps) {
  const sizeStyles =
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-xs font-medium";

  const variantStyles = {
    primary:
      "bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 text-white shadow-[0_4px_16px_rgba(124,58,237,0.4)] hover:brightness-110 border border-purple-400/30",
    secondary:
      "bg-[#181626] border border-purple-500/25 text-slate-200 hover:bg-[#1E1B30] hover:text-white hover:border-purple-400/50 shadow-sm",
    ghost:
      "text-slate-300 hover:bg-purple-950/40 hover:text-white",
    danger:
      "bg-rose-950/60 border border-rose-500/30 text-rose-300 hover:bg-rose-900/60 shadow-sm",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${sizeStyles} ${variantStyles[variant]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}
