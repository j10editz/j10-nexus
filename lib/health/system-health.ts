import { probeDatabaseReachability } from "./probe";

export type ComponentStatus =
  | "Operational"
  | "Configured"
  | "Degraded"
  | "Outage"
  | "Unknown";

export type OverallStatus =
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
  overallStatus: OverallStatus;
  timestamp: string;
  components: ComponentHealth[];
}

export const REQUIRED_COMPONENT_IDS = [
  "database",
  "auth",
  "workflow",
  "stripe",
] as const;

export const OPTIONAL_COMPONENT_IDS = ["whatsapp", "ai"] as const;

interface CacheEntry {
  report: SystemHealthReport;
  cachedAt: number;
}

// 60-second in-memory TTL to prevent public probe abuse and API rate hammering
const CACHE_TTL_MS = 60_000;
let cachedHealth: CacheEntry | null = null;
let inFlightProbe: Promise<SystemHealthReport> | null = null;

/**
 * Safe timeout fetch helper with sanitized error handling.
 * Enforces headers-only auth so secrets never appear in query URLs or request logs.
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
 * 2. Authentication Service Probe
 * Verifies Supabase Auth reachability. Does NOT claim to continuously monitor workspace boundaries or tenant isolation.
 */
async function checkAuth(checkedAt: string): Promise<ComponentHealth> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    return {
      id: "auth",
      name: "Authentication Service",
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
        name: "Authentication Service",
        category: "Security & Identity",
        status: "Operational",
        latencyMs: res.latencyMs,
        lastChecked: checkedAt,
        explanation: "Authentication service endpoint reachable and responsive.",
      };
    }

    return {
      id: "auth",
      name: "Authentication Service",
      category: "Security & Identity",
      status: "Degraded",
      latencyMs: res.latencyMs,
      lastChecked: checkedAt,
      explanation: "Authentication service responded with non-200 readiness status.",
    };
  } catch {
    return {
      id: "auth",
      name: "Authentication Service",
      category: "Security & Identity",
      status: "Degraded",
      lastChecked: checkedAt,
      explanation: "Authentication endpoint probe timed out or connection failed.",
    };
  }
}

/**
 * 3. Workflow Execution Engine Check
 * Database connectivity alone does NOT prove workflow runtime is operational.
 * Reports 'Configured' when definitions and database dependencies exist.
 * Never claims runtime dispatch queue or state transition engine is ready based solely on DB health.
 */
async function checkWorkflow(
  checkedAt: string,
  dbHealth: ComponentHealth
): Promise<ComponentHealth> {
  // If backing storage has an outage or is degraded, workflow engine is impacted
  if (dbHealth.status === "Outage") {
    return {
      id: "workflow",
      name: "Workflow Execution Engine",
      category: "Automation Runtime",
      status: "Outage",
      lastChecked: checkedAt,
      explanation: "Automation engine paused; storage backend unavailable.",
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

  // When database dependencies are verified and engine modules are available,
  // report honestly as Configured (unless an actual non-mutating runtime probe is executed)
  try {
    // Check if node catalog and automation modules are loadable
    const { J10_FLOW_NODE_CATALOG } = await import("@/lib/automation/node-catalog");
    if (Array.isArray(J10_FLOW_NODE_CATALOG) && J10_FLOW_NODE_CATALOG.length > 0) {
      return {
        id: "workflow",
        name: "Workflow Execution Engine",
        category: "Automation Runtime",
        status: "Configured",
        latencyMs: dbHealth.latencyMs,
        lastChecked: checkedAt,
        explanation:
          "Workflow definitions and dependencies provisioned; execution runtime configured.",
      };
    }
  } catch {
    // Module or definition lookup error
  }

  return {
    id: "workflow",
    name: "Workflow Execution Engine",
    category: "Automation Runtime",
    status: "Unknown",
    lastChecked: checkedAt,
    explanation: "Workflow execution engine configuration or definitions unavailable.",
  };
}

/**
 * 4. Meta WhatsApp Cloud API Gateway Probe
 * NEVER sends messages or mutates conversations.
 * Uses Authorization header (no access_token in URL query strings).
 * Uses supported project Graph API version (v26.0).
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

  const graphVersion =
    process.env.META_WHATSAPP_GRAPH_API_VERSION?.trim() || "v26.0";

  try {
    // Strictly read-only self-inspection endpoint using Authorization header (no secret in URL)
    const res = await safeFetchPing(
      `https://graph.facebook.com/${graphVersion}/me`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
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
        explanation: "Meta API credentials authenticated and provider endpoint reachable.",
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
 * NEVER creates sessions, charges, customers, or invoices. Strictly read-only balance retrieve.
 * Uses Authorization header (no secret in URL).
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
 * Uses x-goog-api-key or Authorization headers (no API keys in URL query strings).
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
      // Free metadata list probe on Google Gemini API using header without query credentials
      res = await safeFetchPing(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
        {
          method: "GET",
          headers: {
            "x-goog-api-key": geminiKey,
          },
        },
        1500
      );
    } else if (openAIKey) {
      // Free metadata list probe on OpenAI models API using Authorization header
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
        explanation: "AI provider metadata endpoint authenticated and reachable.",
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
 * Aggregates individual component statuses into a system-wide status according to strict rules:
 * 1. Any verified required component outage produces overall 'Outage'.
 * 2. Any degraded required component produces overall 'Degraded'.
 * 3. Any degraded optional integration produces overall 'Degraded'.
 * 4. Configured and Unknown components are not silently counted as Operational.
 * 5. Overall 'Operational' requires every required component to pass its live readiness probe.
 * 6. Database health alone never determines the complete system status.
 */
export function calculateOverallStatus(components: ComponentHealth[]): OverallStatus {
  // 1. Any required component in Outage -> overall Outage
  const hasRequiredOutage = components.some(
    (c) => REQUIRED_COMPONENT_IDS.includes(c.id as any) && c.status === "Outage"
  );
  if (hasRequiredOutage) {
    return "Outage";
  }

  // 2. Any degraded component (required or configured optional integration) -> overall Degraded
  const hasAnyDegraded = components.some((c) => c.status === "Degraded");
  if (hasAnyDegraded) {
    return "Degraded";
  }

  // 3. Any optional component outage -> Degraded
  const hasOptionalOutage = components.some(
    (c) => OPTIONAL_COMPONENT_IDS.includes(c.id as any) && c.status === "Outage"
  );
  if (hasOptionalOutage) {
    return "Degraded";
  }

  // 4. Check required components for Operational status
  const requiredComponents = components.filter((c) =>
    REQUIRED_COMPONENT_IDS.includes(c.id as any)
  );

  const allRequiredOperational =
    requiredComponents.length > 0 &&
    requiredComponents.every((c) => c.status === "Operational");

  if (allRequiredOperational) {
    return "Operational";
  }

  // 5. If any required component is Configured or Unknown without degradation, overall is Configured
  const hasConfigured = components.some((c) => c.status === "Configured");
  if (hasConfigured) {
    return "Configured";
  }

  return "Unknown";
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
          name: "Authentication Service",
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

  const overallStatus = calculateOverallStatus(components);

  return {
    overallStatus,
    timestamp: checkedAt,
    components,
  };
}

/**
 * Public function to probe system health with 60s TTL caching and in-flight de-duplication.
 * Public force-refresh option is removed to prevent probe abuse.
 */
export async function probeSystemHealth(): Promise<SystemHealthReport> {
  const now = Date.now();

  if (cachedHealth && now - cachedHealth.cachedAt < CACHE_TTL_MS) {
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
