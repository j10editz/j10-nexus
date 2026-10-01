"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * J10 NEXUS — Canonical Dashboard Primitives
 * Canonical Black Emerald Palette (scoped by DashboardLayout):
 * - Main background: #070A08
 * - Primary surface: #0D120F
 * - Elevated surface: #121915
 * - Primary border: #26342B
 * - Strong border: #34483B
 * - Primary text: #F3F7F4
 * - Secondary text: #AAB7AE
 * - Muted text: #748178
 * - Primary emerald: #35C46A
 * - Emerald hover: #46D779
 *
 * Semantic:
 * - Success: #168A65 (bg #E8F8F2, border #A3E6D0)
 * - Warning: #D97706 (bg #FEF3C7, border #FDE68A)
 * - Error: #E11D48 (bg #FFE4E8, border #FECDD3)
 *
 * Elevation:
 * - Subtle shadow: 0 4px 16px rgba(49, 32, 92, 0.06)
 * - Panel radius: 10-12px (rounded-xl)
 * - Control radius: 8px (rounded-lg)
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
      className={`flex flex-col gap-3 pb-4 mb-5 border-b border-[#E2DEEA] sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#17151F]">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs text-[#6F687A] max-w-2xl leading-relaxed">
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
          <h2 className="text-sm font-semibold tracking-tight text-[#17151F]">
            {title}
          </h2>
          {typeof count === "number" && (
            <span className="rounded bg-[#F3F1F8] border border-[#E2DEEA] px-1.5 py-0.5 text-[10px] font-medium text-[#6F687A]">
              {count}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[11px] text-[#918A9D] mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// 3. Compact Metric Tile (Canonical Black Emerald)
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
      ? "text-[#D97706]"
      : semanticStatus === "error"
      ? "text-[#E11D48]"
      : "text-[#168A65]"
    : "text-[#17151F]";

  const borderHighlight = isProblem
    ? semanticStatus === "warning"
      ? "hover:border-[#D97706]"
      : semanticStatus === "error"
      ? "hover:border-[#E11D48]"
      : "hover:border-[#168A65]"
    : "hover:border-[#6347E8]";

  const content = (
    <div
      className={`group flex flex-col justify-between h-[88px] sm:h-[92px] rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-3.5 shadow-[0_4px_16px_rgba(49,32,92,0.06)] transition-all duration-150 ${borderHighlight} hover:bg-[#FFFFFF] ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#6F687A] truncate">
          {label}
        </span>
        {isProblem && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              semanticStatus === "warning"
                ? "bg-[#D97706]"
                : semanticStatus === "error"
                ? "bg-[#E11D48]"
                : "bg-[#168A65]"
            }`}
          />
        )}
      </div>

      <div className="mt-1">
        <div className={`text-2xl font-bold tracking-tight ${valueColor}`}>
          {value}
        </div>
        {destinationLabel ? (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-[#6F687A] group-hover:text-[#6347E8] transition-colors">
            <span className="truncate">{destinationLabel}</span>
            <ChevronRight
              size={12}
              className="shrink-0 text-[#918A9D] group-hover:text-[#6347E8] transition-transform group-hover:translate-x-0.5"
            />
          </div>
        ) : subtitle ? (
          <div className="mt-1 text-[11px] text-[#918A9D] truncate">
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

// 4. Status Badge (Canonical Black Emerald, restrained semantics)
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
    connected: "bg-[#E8F8F2] text-[#168A65] border-[#A3E6D0]",
    success: "bg-[#E8F8F2] text-[#168A65] border-[#A3E6D0]",
    available: "bg-[#F0ECFF] text-[#6347E8] border-[#D5CEE3]",
    setup_incomplete: "bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]",
    warning: "bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]",
    degraded: "bg-[#FFE4E8] text-[#E11D48] border-[#FECDD3]",
    error: "bg-[#FFE4E8] text-[#E11D48] border-[#FECDD3]",
    coming_soon: "bg-[#F3F1F8] text-[#6F687A] border-[#E2DEEA]",
    neutral: "bg-[#F3F1F8] text-[#6F687A] border-[#E2DEEA]",
  };

  const dotColors: Record<StatusBadgeVariant, string> = {
    connected: "bg-[#168A65]",
    success: "bg-[#168A65]",
    available: "bg-[#6347E8]",
    setup_incomplete: "bg-[#D97706]",
    warning: "bg-[#D97706]",
    degraded: "bg-[#E11D48]",
    error: "bg-[#E11D48]",
    coming_soon: "bg-[#918A9D]",
    neutral: "bg-[#6F687A]",
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
      className={`flex items-center justify-between gap-3 rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] px-4 py-3 text-xs shadow-[0_4px_16px_rgba(49,32,92,0.06)] ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[#17151F]">{message}</p>
        {subtext && <p className="text-[11px] text-[#6F687A] mt-0.5">{subtext}</p>}
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
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 border-b border-[#E2DEEA] last:border-b-0 hover:bg-[#F3F1F8] transition-colors ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-[#17151F]">{title}</span>
          {statusBadge}
        </div>
        {context && (
          <p className="text-[11px] text-[#6F687A] mt-0.5 truncate">{context}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
        {time && <span className="text-[11px] text-[#918A9D]">{time}</span>}
        {actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 rounded-lg bg-[#FFFFFF] border border-[#E2DEEA] px-2.5 py-1 text-[11px] font-medium text-[#17151F] hover:border-[#6347E8] hover:bg-[#F0ECFF] hover:text-[#6347E8] transition-colors shadow-sm"
          >
            <span>{actionLabel}</span>
            <ChevronRight size={12} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 rounded-lg bg-[#FFFFFF] border border-[#E2DEEA] px-2.5 py-1 text-[11px] font-medium text-[#17151F] hover:border-[#6347E8] hover:bg-[#F0ECFF] hover:text-[#6347E8] transition-colors shadow-sm"
          >
            <span>{actionLabel}</span>
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// 7. Surface / Card Container (Pearl Violet)
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
      ? "bg-[#FFFFFF]"
      : level === "secondary"
      ? "bg-[#F3F1F8]"
      : "bg-[#F0ECFF]";
  return (
    <div
      className={`rounded-xl border border-[#E2DEEA] ${bg} shadow-[0_4px_16px_rgba(49,32,92,0.06)] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

// 8. Standard Button (Pearl Violet)
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
    "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = {
    sm: "h-8 px-2.5 text-xs",
    md: "h-9 px-3.5 text-xs",
  };
  const variants = {
    primary: "bg-[#6347E8] text-white hover:bg-[#5136D6] active:bg-[#3E2A8A] shadow-sm",
    secondary: "bg-[#FFFFFF] text-[#17151F] border border-[#E2DEEA] hover:border-[#D5CEE3] hover:bg-[#F3F1F8] shadow-sm",
    ghost: "bg-transparent text-[#6F687A] hover:text-[#17151F] hover:bg-[#F3F1F8]",
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
