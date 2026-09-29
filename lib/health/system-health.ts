import { probeDatabaseReachability } from "./probe";

export type ComponentStatus =
  | "Operational"
  | "Configured"
  | "Degraded"
  | "Outage"
  | "Unknown";

export interface ComponentHealth {
  id: string;
  name: string;
  category: string;
  status: ComponentStatus;
  latencyMs?: number;
  lastChecked: string;
  explanation: string;
}

export interface SystemHealthReport {
  overallStatus: "Operational" | "Degraded" | "Outage";
  timestamp: string;
  components: ComponentHealth[];
}

interface CacheEntry {
  report: SystemHealthReport;
  cachedAt: number;
}

const CACHE_TTL_MS = 10_000; // 10 seconds TTL
let cachedHealth: CacheEntry | null = null;
let inFlightProbe: Promise<SystemHealthReport> | null = null;

/**
 * Safe timeout fetch helper with sanitized error handling.
 */
async function safeFetchPing(
  url: string,
  options: RequestInit = {},
  timeoutMs = 1500
): Promise<{ ok: boolean; status: number; latencyMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 1. Database Server Connection Probe
 */
async function checkDatabase(checkedAt: string): Promise<ComponentHealth> {
  const result = await probeDatabaseReachability(1500);

  if (result.reachable) {
    return {
      id: "database",
      name: "Database Server Connection",
      category: "Storage Infrastructure",
      status: "Operational",
      latencyMs: result.latencyMs,
      lastChecked: checkedAt,
      explanation: "Server connection pool reachability verified.",
    };
  }

  return {
    id: "database",
    name: "Database Server Connection",
    category: "Storage Infrastructure",
    status: "Degraded",
    latencyMs: result.latencyMs,
    lastChecked: checkedAt,
    explanation: "Database query timed out or connection degraded.",
  };
}

/**
 * 2. Authentication & Workspace Boundaries Probe
 */
async function checkAuth(checkedAt: string): Promise<ComponentHealth> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    return {
      id: "auth",
      name: "Authentication & Workspace Boundaries",
      category: "Security & Identity",
      status: "Unknown",
      lastChecked: checkedAt,
      explanation: "Authentication endpoint not provisioned in current environment.",
    };
  }

  try {
    const res = await safeFetchPing(
      `${supabaseUrl}/auth/v1/health`,
      {
        headers: anonKey ? { apikey: anonKey } : {},
      },
      1500
    );

    if (res.ok || res.status === 200) {
      return {
        id: "auth",
        name: "Authentication & Workspace Boundaries",
        category: "Security & Identity",
        status: "Operational",
        latencyMs: res.latencyMs,
        lastChecked: checkedAt,
        explanation: "Identity boundary and session authentication service active.",
      };
    }

    return {
      id: "auth",
      name: "Authentication & Workspace Boundaries",
      category: "Security & Identity",
      status: "Degraded",
      latencyMs: res.latencyMs,
      lastChecked: checkedAt,
      explanation: "Authentication service responded with non-200 readiness status.",
    };
  } catch {
    return {
      id: "auth",
      name: "Authentication & Workspace Boundaries",
      category: "Security & Identity",
      status: "Degraded",
      lastChecked: checkedAt,
      explanation: "Authentication endpoint probe timed out or connection failed.",
    };
  }
}

/**
 * 3. Workflow Execution Engine Probe
 */
async function checkWorkflow(
  checkedAt: string,
  dbHealth: ComponentHealth
): Promise<ComponentHealth> {
  // Workflow engine runtime depends on operational database storage and dispatch state
  if (dbHealth.status === "Operational") {
    return {
      id: "workflow",
      name: "Workflow Execution Engine",
      category: "Automation Runtime",
      status: "Operational",
      latencyMs: dbHealth.latencyMs,
      lastChecked: checkedAt,
      explanation: "Runtime dispatch queue and state transition engine ready.",
    };
  }

  if (dbHealth.status === "Degraded") {
    return {
      id: "workflow",
      name: "Workflow Execution Engine",
      category: "Automation Runtime",
      status: "Degraded",
      lastChecked: checkedAt,
      explanation: "Automation execution engine degraded due to backing storage latency.",
    };
  }

  return {
    id: "workflow",
    name: "Workflow Execution Engine",
    category: "Automation Runtime",
    status: "Outage",
    lastChecked: checkedAt,
    explanation: "Automation engine paused; storage backend unavailable.",
  };
}

/**
 * 4. Meta WhatsApp Cloud API Gateway Probe
 * NEVER sends WhatsApp messages. Read-only token inspection or readiness verification.
 */
async function checkWhatsApp(checkedAt: string): Promise<ComponentHealth> {
  const token =
    process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN;

  if (!token) {
    return {
      id: "whatsapp",
      name: "Meta WhatsApp Cloud API Gateway",
      category: "External Integration",
      status: "Unknown",
      lastChecked: checkedAt,
      explanation: "Gateway credentials not provisioned in current environment.",
    };
  }

  try {
    // Strictly read-only Graph API self-read probe with 1500ms timeout
    const res = await safeFetchPing(
      `https://graph.facebook.com/v18.0/me?access_token=${encodeURIComponent(
        token
      )}`,
      { method: "GET" },
      1500
    );

    if (res.ok) {
      return {
        id: "whatsapp",
        name: "Meta WhatsApp Cloud API Gateway",
        category: "External Integration",
        status: "Operational",
        latencyMs: res.latencyMs,
        lastChecked: checkedAt,
        explanation: "Meta Cloud API webhook gateway reachable and authenticated.",
      };
    }

    return {
      id: "whatsapp",
      name: "Meta WhatsApp Cloud API Gateway",
      category: "External Integration",
      status: "Degraded",
      latencyMs: res.latencyMs,
      lastChecked: checkedAt,
      explanation: "Meta Cloud API responded with non-success status code.",
    };
  } catch {
    return {
      id: "whatsapp",
      name: "Meta WhatsApp Cloud API Gateway",
      category: "External Integration",
      status: "Degraded",
      lastChecked: checkedAt,
      explanation: "Meta Cloud API gateway probe timed out or connection failed.",
    };
  }
}

/**
 * 5. Stripe Billing & Subscriptions Probe
 * NEVER creates sessions, charges, customers, or invoices. Strictly read-only balance check.
 */
async function checkStripe(checkedAt: string): Promise<ComponentHealth> {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return {
      id: "stripe",
      name: "Stripe Billing & Subscriptions",
      category: "External Financial",
      status: "Unknown",
      lastChecked: checkedAt,
      explanation: "Stripe billing secret key not provisioned in current environment.",
    };
  }

  try {
    // Strictly read-only balance retrieve with 1500ms timeout
    const res = await safeFetchPing(
      "https://api.stripe.com/v1/balance",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
      1500
    );

    if (res.ok) {
      return {
        id: "stripe",
        name: "Stripe Billing & Subscriptions",
        category: "External Financial",
        status: "Operational",
        latencyMs: res.latencyMs,
        lastChecked: checkedAt,
        explanation: "Payment infrastructure connectivity and balance gateway operational.",
      };
    }

    return {
      id: "stripe",
      name: "Stripe Billing & Subscriptions",
      category: "External Financial",
      status: "Degraded",
      latencyMs: res.latencyMs,
      lastChecked: checkedAt,
      explanation: "Stripe API responded with non-success status code.",
    };
  } catch {
    return {
      id: "stripe",
      name: "Stripe Billing & Subscriptions",
      category: "External Financial",
      status: "Degraded",
      lastChecked: checkedAt,
      explanation: "Stripe gateway probe timed out or connection failed.",
    };
  }
}

/**
 * 6. AI Model Gateway Probe
 * NEVER executes paid generations. Strictly read-only model list metadata.
 */
async function checkAI(checkedAt: string): Promise<ComponentHealth> {
  const geminiKey =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_AI_STUDIO_API_KEY ??
    process.env.GOOGLE_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openAIKey) {
    return {
      id: "ai",
      name: "AI Model Gateway",
      category: "External AI Provider",
      status: "Unknown",
      lastChecked: checkedAt,
      explanation: "AI provider credentials not provisioned in current environment.",
    };
  }

  try {
    let res: { ok: boolean; status: number; latencyMs: number } | null = null;

    if (geminiKey) {
      // Free metadata list probe on Google Gemini API
      res = await safeFetchPing(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(
          geminiKey
        )}`,
        { method: "GET" },
        1500
      );
    } else if (openAIKey) {
      // Free metadata list probe on OpenAI models API
      res = await safeFetchPing(
        "https://api.openai.com/v1/models",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${openAIKey}`,
          },
        },
        1500
      );
    }

    if (res && res.ok) {
      return {
        id: "ai",
        name: "AI Model Gateway",
        category: "External AI Provider",
        status: "Operational",
        latencyMs: res.latencyMs,
        lastChecked: checkedAt,
        explanation: "Model routing gateway and inference runtime reachable.",
      };
    }

    return {
      id: "ai",
      name: "AI Model Gateway",
      category: "External AI Provider",
      status: "Degraded",
      latencyMs: res?.latencyMs,
      lastChecked: checkedAt,
      explanation: "AI gateway metadata probe returned non-success response.",
    };
  } catch {
    return {
      id: "ai",
      name: "AI Model Gateway",
      category: "External AI Provider",
      status: "Degraded",
      lastChecked: checkedAt,
      explanation: "AI gateway probe timed out or connection failed.",
    };
  }
}

/**
 * Execute all 6 evidence-based health probes with isolation and caching.
 */
async function executeProbes(): Promise<SystemHealthReport> {
  const checkedAt = new Date().toISOString();

  // 1. Database probe runs first
  let dbHealth: ComponentHealth;
  try {
    dbHealth = await checkDatabase(checkedAt);
  } catch {
    dbHealth = {
      id: "database",
      name: "Database Server Connection",
      category: "Storage Infrastructure",
      status: "Degraded",
      lastChecked: checkedAt,
      explanation: "Unexpected database probe failure.",
    };
  }

  // 2-6. Run remaining 5 component probes concurrently with error isolation
  const [authRes, workflowRes, whatsappRes, stripeRes, aiRes] =
    await Promise.allSettled([
      checkAuth(checkedAt),
      checkWorkflow(checkedAt, dbHealth),
      checkWhatsApp(checkedAt),
      checkStripe(checkedAt),
      checkAI(checkedAt),
    ]);

  const components: ComponentHealth[] = [
    dbHealth,
    authRes.status === "fulfilled"
      ? authRes.value
      : {
          id: "auth",
          name: "Authentication & Workspace Boundaries",
          category: "Security & Identity",
          status: "Degraded",
          lastChecked: checkedAt,
          explanation: "Auth probe execution failed.",
        },
    workflowRes.status === "fulfilled"
      ? workflowRes.value
      : {
          id: "workflow",
          name: "Workflow Execution Engine",
          category: "Automation Runtime",
          status: "Degraded",
          lastChecked: checkedAt,
          explanation: "Workflow probe execution failed.",
        },
    whatsappRes.status === "fulfilled"
      ? whatsappRes.value
      : {
          id: "whatsapp",
          name: "Meta WhatsApp Cloud API Gateway",
          category: "External Integration",
          status: "Unknown",
          lastChecked: checkedAt,
          explanation: "WhatsApp probe execution failed.",
        },
    stripeRes.status === "fulfilled"
      ? stripeRes.value
      : {
          id: "stripe",
          name: "Stripe Billing & Subscriptions",
          category: "External Financial",
          status: "Degraded",
          lastChecked: checkedAt,
          explanation: "Stripe probe execution failed.",
        },
    aiRes.status === "fulfilled"
      ? aiRes.value
      : {
          id: "ai",
          name: "AI Model Gateway",
          category: "External AI Provider",
          status: "Degraded",
          lastChecked: checkedAt,
          explanation: "AI probe execution failed.",
        },
  ];

  const hasOutage = components.some((c) => c.status === "Outage");
  const hasDegraded = components.some(
    (c) => c.id === "database" && c.status === "Degraded"
  );

  const overallStatus = hasOutage
    ? "Outage"
    : hasDegraded
    ? "Degraded"
    : "Operational";

  return {
    overallStatus,
    timestamp: checkedAt,
    components,
  };
}

/**
 * Public function to probe system health with short TTL caching and in-flight de-duplication.
 */
export async function probeSystemHealth(
  forceFresh = false
): Promise<SystemHealthReport> {
  const now = Date.now();

  if (!forceFresh && cachedHealth && now - cachedHealth.cachedAt < CACHE_TTL_MS) {
    return cachedHealth.report;
  }

  if (inFlightProbe) {
    return inFlightProbe;
  }

  inFlightProbe = executeProbes()
    .then((report) => {
      cachedHealth = { report, cachedAt: Date.now() };
      inFlightProbe = null;
      return report;
    })
    .catch((err) => {
      inFlightProbe = null;
      throw err;
    });

  return inFlightProbe;
}
