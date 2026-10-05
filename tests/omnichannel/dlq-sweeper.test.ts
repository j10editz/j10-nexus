import { describe, it, expect, vi, beforeEach } from "vitest";
import { sweepDeadLetterQueueOnce } from "@/lib/integrations/dlq-sweeper";

describe("DLQ Sweeper Automated Background Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero counts when no retryable candidates are found", async () => {
    const mockSupabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await sweepDeadLetterQueueOnce(mockSupabase);
    expect(result.totalScanned).toBe(0);
    expect(result.replayedCount).toBe(0);
    expect(result.succeededCount).toBe(0);
  });

  it("marks candidate exhausted when attempt count reaches max attempts", async () => {
    const mockCandidate = {
      id: "evt_exhaust_test",
      user_id: "usr_1",
      provider: "shopify",
      event_type: "orders/create",
      attempt_count: 5,
      max_attempts: 5,
      retryable: true,
      next_retry_at: new Date(Date.now() - 1000).toISOString(),
    };

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });

    const mockSupabase: any = {
      from: (table: string) => {
        if (table === "integration_webhook_events") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  lte: () => ({
                    order: () => ({
                      limit: async () => ({ data: [mockCandidate], error: null }),
                    }),
                  }),
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        if (table === "integration_operation_logs") {
          return { insert: mockInsert };
        }
        return { insert: vi.fn() };
      },
    };

    const result = await sweepDeadLetterQueueOnce(mockSupabase);
    expect(result.totalScanned).toBe(1);
    expect(result.exhaustedCount).toBe(1);
    expect(result.events[0].exhausted).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
