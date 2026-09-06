/**
 * J10 NEXUS TIER 4 — RELIABILITY MONITORING & CIRCUIT BREAKERS
 * Real-time health monitoring, error rate tracking, latency percentiles (p50/p90/p99),
 * and automatic circuit breaker tripping.
 */

import type { CircuitBreakerState, ReliabilityMetrics } from "@/types/governance";

interface InvocationRecord {
  timestamp: number;
  success: boolean;
  latencyMs: number;
  usedFallback: boolean;
  error?: string;
}

// In-memory sliding window telemetry per workspace (last 100 invocations)
const workspaceTelemetry: Map<string, InvocationRecord[]> = new Map();
const circuitBreakerOverrides: Map<string, { state: CircuitBreakerState; trippedReason?: string }> = new Map();

const ERROR_RATE_THRESHOLD_PERCENT = 25.0; // Trip if > 25% failures
const MINIMUM_INVOCATIONS_TO_TRIP = 8;     // Minimum sample size before tripping

export function recordInvocationOutcome(
  workspaceId: string,
  outcome: {
    success: boolean;
    latencyMs: number;
    usedFallback?: boolean;
    error?: string;
  }
): ReliabilityMetrics {
  const records = workspaceTelemetry.get(workspaceId) || [];
  records.push({
    timestamp: Date.now(),
    success: outcome.success,
    latencyMs: outcome.latencyMs,
    usedFallback: outcome.usedFallback ?? false,
    error: outcome.error,
  });

  // Keep last 100 records
  if (records.length > 100) {
    records.shift();
  }
  workspaceTelemetry.set(workspaceId, records);

  return getReliabilityMetrics(workspaceId);
}

export function getReliabilityMetrics(workspaceId: string): ReliabilityMetrics {
  const records = workspaceTelemetry.get(workspaceId) || [];
  const total = records.length;

  const override = circuitBreakerOverrides.get(workspaceId);

  if (total === 0) {
    return {
      workspaceId,
      circuitBreakerState: override ? override.state : "closed",
      totalInvocations: 0,
      failedInvocations: 0,
      errorRatePercent: 0,
      fallbackCount: 0,
      fallbackRatePercent: 0,
      p50LatencyMs: 0,
      p90LatencyMs: 0,
      p99LatencyMs: 0,
      trippedReason: override?.trippedReason,
    };
  }

  const failures = records.filter((r) => !r.success).length;
  const fallbacks = records.filter((r) => r.usedFallback).length;

  const errorRatePercent = Number(((failures / total) * 100).toFixed(1));
  const fallbackRatePercent = Number(((fallbacks / total) * 100).toFixed(1));

  // Latencies
  const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  // Circuit breaker state evaluation
  let state: CircuitBreakerState = "closed";
  let trippedReason: string | undefined;

  if (override) {
    state = override.state;
    trippedReason = override.trippedReason;
  } else if (total >= MINIMUM_INVOCATIONS_TO_TRIP && errorRatePercent >= ERROR_RATE_THRESHOLD_PERCENT) {
    state = "open";
    trippedReason = `Error rate (${errorRatePercent}%) exceeded ${ERROR_RATE_THRESHOLD_PERCENT}% threshold over ${total} invocations.`;
  }

  return {
    workspaceId,
    circuitBreakerState: state,
    totalInvocations: total,
    failedInvocations: failures,
    errorRatePercent,
    fallbackCount: fallbacks,
    fallbackRatePercent,
    p50LatencyMs: p50,
    p90LatencyMs: p90,
    p99LatencyMs: p99,
    trippedReason,
  };
}

export function resetCircuitBreaker(workspaceId: string): ReliabilityMetrics {
  circuitBreakerOverrides.delete(workspaceId);
  workspaceTelemetry.set(workspaceId, []);
  return getReliabilityMetrics(workspaceId);
}

export function tripCircuitBreaker(workspaceId: string, reason: string): ReliabilityMetrics {
  circuitBreakerOverrides.set(workspaceId, { state: "open", trippedReason: reason });
  return getReliabilityMetrics(workspaceId);
}
