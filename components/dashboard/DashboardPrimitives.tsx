"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * J10 NEXUS — Canonical Dashboard Primitives
 * Professional, calm, compact business operating system design tokens.
 *
 * Palette:
 * - Background: #090B10
 * - Primary Surface: #101319
 * - Elevated Surface: #151922
 * - Border: #242A35
 * - Primary Text: #F5F7FA
 * - Secondary Text: #98A2B3
 * - Muted Text: #667085
 * - Primary J10 Accent: #4F7CFF
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
      className={`flex flex-col gap-3 pb-4 mb-5 border-b border-[#242A35] sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7FA]">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs text-[#98A2B3] max-w-2xl leading-relaxed">
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
          <h2 className="text-sm font-semibold tracking-tight text-[#F5F7FA]">
            {title}
          </h2>
          {typeof count === "number" && (
            <span className="rounded bg-[#151922] border border-[#242A35] px-1.5 py-0.5 text-[10px] font-medium text-[#98A2B3]">
              {count}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[11px] text-[#667085] mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// 3. Compact Metric Tile
interface DashboardMetricTileProps {
  label: string;
  value: string | number;
  subtitle?: string;
  destinationLabel?: string;
  href?: string;
  semanticStatus?: "neutral" | "warning" | "error";
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
    (semanticStatus === "warning" || semanticStatus === "error") &&
    (typeof value === "number" ? value > 0 : value !== "0" && value !== "$0");

  const valueColor = isProblem
    ? semanticStatus === "warning"
      ? "text-amber-400"
      : "text-rose-400"
    : "text-[#F5F7FA]";

  const borderHighlight = isProblem
    ? semanticStatus === "warning"
      ? "hover:border-amber-500/40"
      : "hover:border-rose-500/40"
    : "hover:border-[#4F7CFF]/40";

  const content = (
    <div
      className={`group flex flex-col justify-between h-[88px] sm:h-[92px] rounded-lg border border-[#242A35] bg-[#101319] p-3.5 transition-colors duration-150 ${borderHighlight} hover:bg-[#151922] ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#667085] truncate">
          {label}
        </span>
        {isProblem && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              semanticStatus === "warning" ? "bg-amber-400" : "bg-rose-400"
            }`}
          />
        )}
      </div>

      <div className="mt-1">
        <div className={`text-2xl font-bold tracking-tight ${valueColor}`}>
          {value}
        </div>
        {destinationLabel ? (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-[#98A2B3] group-hover:text-[#F5F7FA] transition-colors">
            <span className="truncate">{destinationLabel}</span>
            <ChevronRight
              size={12}
              className="shrink-0 text-[#667085] group-hover:text-[#4F7CFF] transition-transform group-hover:translate-x-0.5"
            />
          </div>
        ) : subtitle ? (
          <div className="mt-1 text-[11px] text-[#667085] truncate">
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

// 4. Status Badge
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
    connected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    available: "bg-[#4F7CFF]/10 text-[#4F7CFF] border-[#4F7CFF]/20",
    setup_incomplete: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    degraded: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    error: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    coming_soon: "bg-white/[0.03] text-[#667085] border-white/[0.08]",
    neutral: "bg-white/[0.04] text-[#98A2B3] border-white/[0.08]",
  };

  const dotColors: Record<StatusBadgeVariant, string> = {
    connected: "bg-emerald-400",
    success: "bg-emerald-400",
    available: "bg-[#4F7CFF]",
    setup_incomplete: "bg-amber-400",
    warning: "bg-amber-400",
    degraded: "bg-rose-400",
    error: "bg-rose-400",
    coming_soon: "bg-[#667085]",
    neutral: "bg-[#98A2B3]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border ${styles[status]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[status]}`} />
      <span>{label}</span>
    </span>
  );
}

// 5. Compact Empty State (Not giant decorative cards)
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
      className={`flex items-center justify-between gap-3 rounded-lg border border-[#242A35] bg-[#101319] px-4 py-3 text-xs ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[#98A2B3]">{message}</p>
        {subtext && <p className="text-[11px] text-[#667085] mt-0.5">{subtext}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// 6. Action Row (for operational priority list)
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
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 border-b border-[#242A35] last:border-b-0 hover:bg-[#151922] transition-colors ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-[#F5F7FA]">{title}</span>
          {statusBadge}
        </div>
        {context && (
          <p className="text-[11px] text-[#667085] mt-0.5 truncate">{context}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
        {time && <span className="text-[11px] text-[#667085]">{time}</span>}
        {actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 rounded bg-[#151922] border border-[#242A35] px-2.5 py-1 text-[11px] font-medium text-[#F5F7FA] hover:border-[#4F7CFF]/50 hover:bg-[#4F7CFF]/10 hover:text-[#4F7CFF] transition-colors"
          >
            <span>{actionLabel}</span>
            <ChevronRight size={12} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 rounded bg-[#151922] border border-[#242A35] px-2.5 py-1 text-[11px] font-medium text-[#F5F7FA] hover:border-[#4F7CFF]/50 hover:bg-[#4F7CFF]/10 hover:text-[#4F7CFF] transition-colors"
          >
            <span>{actionLabel}</span>
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// 7. Surface / Card Container
interface DashboardSurfaceProps {
  children: ReactNode;
  level?: "primary" | "elevated";
  className?: string;
}

export function DashboardSurface({
  children,
  level = "primary",
  className = "",
}: DashboardSurfaceProps) {
  const bg = level === "primary" ? "bg-[#101319]" : "bg-[#151922]";
  return (
    <div
      className={`rounded-lg border border-[#242A35] ${bg} overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

// 8. Standard Button
interface DashboardButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}

export function DashboardButton({
  children,
  variant = "secondary",
  size = "md",
  onClick,
  disabled = false,
  type = "button",
  className = "",
}: DashboardButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = {
    sm: "h-8 px-2.5 text-xs",
    md: "h-9 px-3.5 text-xs",
  };
  const variants = {
    primary: "bg-[#4F7CFF] text-white hover:bg-[#3D68E6]",
    secondary: "bg-[#151922] text-[#F5F7FA] border border-[#242A35] hover:bg-[#1a202c]",
    ghost: "bg-transparent text-[#98A2B3] hover:text-[#F5F7FA] hover:bg-[#151922]",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
