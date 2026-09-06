import { createAdminSupabaseClient } from "@/lib/auth";

export interface DatabaseProbeResult {
  reachable: boolean;
  status: "Operational" | "Degraded";
  latencyMs: number;
  label: string;
  error?: string;
}

/**
 * Executes an isolated database reachability probe using the server connection pool.
 * Does NOT claim tenant RLS verification, as it uses the privileged server client.
 */
export async function probeDatabaseReachability(timeoutMs = 2000): Promise<DatabaseProbeResult> {
  const startTime = Date.now();
  let timer: NodeJS.Timeout | null = null;

  try {
    const supabase = createAdminSupabaseClient();
    const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timeout: true }), timeoutMs);
    });

    const probePromise = supabase
      .from("workspaces")
      .select("id")
      .limit(1)
      .then((res) => ({ timeout: false as const, ...res }));

    const result = await Promise.race([probePromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;

    if (result.timeout) {
      return {
        reachable: false,
        status: "Degraded",
        latencyMs,
        label: "Database reachable through server connection",
        error: "Database probe timed out",
      };
    }

    if (result.error) {
      return {
        reachable: false,
        status: "Degraded",
        latencyMs,
        label: "Database reachable through server connection",
        error: "Database query failed",
      };
    }

    return {
      reachable: true,
      status: "Operational",
      latencyMs,
      label: "Database reachable through server connection",
    };
  } catch {
    return {
      reachable: false,
      status: "Degraded",
      latencyMs: Date.now() - startTime,
      label: "Database reachable through server connection",
      error: "Connection failure",
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
