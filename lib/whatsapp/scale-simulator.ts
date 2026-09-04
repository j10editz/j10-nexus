export type WebhookInspectorEvent = {
  id: string;
  timestamp: string;
  method: "POST" | "GET";
  endpoint: string;
  status: 200 | 201 | 400 | 401 | 500;
  signatureStatus: "valid" | "invalid" | "unverified";
  signatureHash: string;
  latencyMs: number;
  eventType: string;
  sender: string;
  messageType: string;
  bodyPreview: string;
  rawPayload: Record<string, unknown>;
};

export type ScaleMetrics = {
  slaUptime: number; // e.g. 99.99
  avgLatencyMs: number; // e.g. 28.4
  peakThroughputMps: number; // messages per second
  currentThroughputMps: number;
  errorRate: number; // e.g. 0.00
  totalProcessedEvents: number;
  activeWorkers: number;
  healthStatus: "100% OK" | "DEGRADED" | "CRITICAL";
};

export type StressTestResult = {
  batchSize: number;
  totalDurationMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  throughputMps: number;
  successCount: number;
  failureCount: number;
  events: WebhookInspectorEvent[];
};

export const INITIAL_SCALE_METRICS: ScaleMetrics = {
  slaUptime: 99.99,
  avgLatencyMs: 24.6,
  peakThroughputMps: 450,
  currentThroughputMps: 34,
  errorRate: 0.0,
  totalProcessedEvents: 14820,
  activeWorkers: 12,
  healthStatus: "100% OK",
};

export const SAMPLE_WEBHOOK_INSPECTOR_LOGS: WebhookInspectorEvent[] = [
  {
    id: "wh_ev_901",
    timestamp: new Date(Date.now() - 1000 * 25).toISOString(),
    method: "POST",
    endpoint: "/api/webhooks/whatsapp/v26_prod",
    status: 200,
    signatureStatus: "valid",
    signatureHash: "sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    latencyMs: 18,
    eventType: "whatsapp.message.received",
    sender: "+14155552671",
    messageType: "text",
    bodyPreview: "!rules",
    rawPayload: {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_9921",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15550199", phone_number_id: "PN_ID_441" },
                contacts: [{ profile: { name: "Client Community" }, wa_id: "14155552671" }],
                messages: [{ from: "14155552671", id: "wamid.HBgLM", timestamp: "1725442000", text: { body: "!rules" }, type: "text" }],
              },
              field: "messages",
            },
          ],
        },
      ],
    },
  },
  {
    id: "wh_ev_902",
    timestamp: new Date(Date.now() - 1000 * 80).toISOString(),
    method: "POST",
    endpoint: "/api/webhooks/whatsapp/v26_prod",
    status: 200,
    signatureStatus: "valid",
    signatureHash: "sha256=8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
    latencyMs: 24,
    eventType: "whatsapp.message.received",
    sender: "+14155559812",
    messageType: "text",
    bodyPreview: "!poll Product Feedback | Excellent | Needs Improvement",
    rawPayload: {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_9921",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                messages: [
                  {
                    from: "14155559812",
                    id: "wamid.HBgLM2",
                    timestamp: "1725441950",
                    text: { body: "!poll Product Feedback | Excellent | Needs Improvement" },
                    type: "text",
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    },
  },
  {
    id: "wh_ev_903",
    timestamp: new Date(Date.now() - 1000 * 140).toISOString(),
    method: "POST",
    endpoint: "/api/webhooks/whatsapp/v26_prod",
    status: 200,
    signatureStatus: "valid",
    signatureHash: "sha256=c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2",
    latencyMs: 31,
    eventType: "whatsapp.message.received",
    sender: "+14155554444",
    messageType: "text",
    bodyPreview: "Join our trading signals: https://claim-airdrop.xyz",
    rawPayload: {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_9921",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                messages: [
                  {
                    from: "14155554444",
                    id: "wamid.HBgLM3",
                    timestamp: "1725441800",
                    text: { body: "Join our trading signals: https://claim-airdrop.xyz" },
                    type: "text",
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    },
  },
];

export function runScaleStressTest(batchSize: number = 25): StressTestResult {
  const safeSize = Math.max(5, Math.min(100, batchSize));
  const startTime = performance.now();
  const latencies: number[] = [];
  const events: WebhookInspectorEvent[] = [];

  const sampleMessages = [
    "!rules",
    "!status",
    "!announce Community sprint starting at 2 PM",
    "!poll Design Review | Option A | Option B",
    "!warn @14155550001 spamming external links",
    "!ai what are your business hours?",
    "Can someone please assist with my order refund?",
    "Check out this crypto link: https://scam.com/airdrop",
    "Great product update team!",
  ];

  for (let i = 0; i < safeSize; i++) {
    // Generate simulated latency between 12ms and 45ms
    const latency = Math.floor(12 + Math.random() * 30 + (i % 5));
    latencies.push(latency);

    const msg = sampleMessages[i % sampleMessages.length];
    const sender = `+1415555${String(1000 + i).padStart(4, "0")}`;

    events.push({
      id: `burst_${Date.now()}_${i + 1}`,
      timestamp: new Date(Date.now() - (safeSize - i) * 150).toISOString(),
      method: "POST",
      endpoint: "/api/webhooks/whatsapp/v26_prod",
      status: 200,
      signatureStatus: "valid",
      signatureHash: `sha256=${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 10)}`,
      latencyMs: latency,
      eventType: "whatsapp.message.received",
      sender,
      messageType: "text",
      bodyPreview: msg,
      rawPayload: {
        object: "whatsapp_business_account",
        entry: [
          {
            id: `WABA_BURST_${i + 1}`,
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [{ from: sender, id: `wamid.burst.${i + 1}`, text: { body: msg }, type: "text" }],
                },
                field: "messages",
              },
            ],
          },
        ],
      },
    });
  }

  const totalDurationMs = Math.round(performance.now() - startTime + latencies.reduce((a, b) => a + b, 0) / 4);
  const minLatencyMs = Math.min(...latencies);
  const maxLatencyMs = Math.max(...latencies);
  const avgLatencyMs = Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10;
  const throughputMps = Math.round((safeSize / (totalDurationMs / 1000)) * 10) / 10;

  return {
    batchSize: safeSize,
    totalDurationMs,
    minLatencyMs,
    maxLatencyMs,
    avgLatencyMs,
    throughputMps,
    successCount: safeSize,
    failureCount: 0,
    events,
  };
}
