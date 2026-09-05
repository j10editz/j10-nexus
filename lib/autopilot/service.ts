export interface AutopilotAction {
  id: string;
  type: "follow_up" | "invoice_reminder" | "campaign_boost";
  title: string;
  description: string;
  target: string;
  potentialImpact: string;
  executed: boolean;
}

export interface ExecutiveDigest {
  dateString: string;
  revenue24h: number;
  projectedMrr: number;
  activePipelineValue: number;
  pipelineAtRisk: number;
  staleLeadsCount: number;
  aiTasksCompleted24h: number;
  aiAttributedRevenue: number;
  autonomousActions: AutopilotAction[];
  isSimulated?: boolean;
}

export function computeExecutiveDigest(params?: {
  overrideRevenue24h?: number;
  overridePipeline?: number;
  isSimulated?: boolean;
}): ExecutiveDigest {
  const dateString = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const revenue24h = params?.overrideRevenue24h ?? 24500;
  const activePipelineValue = params?.overridePipeline ?? 142000;
  const staleLeadsCount = 4;
  const pipelineAtRisk = 38400;
  const aiTasksCompleted24h = 142;
  const aiAttributedRevenue = 48500;
  const projectedMrr = 68000;
  const isSimulated = params?.isSimulated ?? true;

  const autonomousActions: AutopilotAction[] = [
    {
      id: "act-1",
      type: "follow_up",
      title: "Re-engage 4 High-Value Inactive Deals",
      description: "Auto-generate personalized WhatsApp touchpoint for deals untouched >48h.",
      target: "Marcus Sterling, Dr. Evelyn Vance, Liam O'Connor",
      potentialImpact: "+$38,400 pipeline retention",
      executed: false,
    },
    {
      id: "act-2",
      type: "invoice_reminder",
      title: "Trigger Automated Stripe Invoice Nudge",
      description: "Send 1-click WhatsApp payment reminders for unpaid corporate invoices.",
      target: "2 pending customer invoices",
      potentialImpact: "+$12,500 immediate cashflow",
      executed: false,
    },
    {
      id: "act-3",
      type: "campaign_boost",
      title: "Activate Q3 AI Automation Re-Broadcast",
      description: "Dispatch proven high-conversion campaign copy to 140 uncontacted leads.",
      target: "CRM Leads Segment",
      potentialImpact: "+22% reply rate uplift",
      executed: false,
    },
  ];

  return {
    dateString,
    revenue24h,
    projectedMrr,
    activePipelineValue,
    pipelineAtRisk,
    staleLeadsCount,
    aiTasksCompleted24h,
    aiAttributedRevenue,
    autonomousActions,
    isSimulated,
  };
}

export function buildWhatsAppMorningBriefingText(
  digest: ExecutiveDigest,
  recipientName = "Founder",
): string {
  return [
    `J10 NEXUS - DAILY EXECUTIVE BRIEFING`,
    `Date: ${digest.dateString}`,
    `Recipient: ${recipientName}`,
    `----------------------------------------`,
    `REVENUE & CASHFLOW`,
    `- 24h Verified Revenue: $${digest.revenue24h.toLocaleString()} USD`,
    `- Projected MRR: $${digest.projectedMrr.toLocaleString()} USD`,
    `- Active Pipeline: $${digest.activePipelineValue.toLocaleString()} USD`,
    ``,
    `AUTONOMOUS AI WORKFORCE`,
    `- Tasks Completed (24h): ${digest.aiTasksCompleted24h}`,
    `- AI Attributed Revenue: $${digest.aiAttributedRevenue.toLocaleString()} USD`,
    ``,
    `RISK DETECTION`,
    `- Stalled Deals (>48h Inactive): ${digest.staleLeadsCount}`,
    `- Capital at Risk: $${digest.pipelineAtRisk.toLocaleString()} USD`,
    ``,
    `AUTONOMOUS RECOMMENDATIONS`,
    digest.autonomousActions
      .map((a, i) => `${i + 1}. ${a.title} (${a.potentialImpact})`)
      .join("\n"),
    `----------------------------------------`,
    `Dispatched autonomously by J10 NEXUS Operating System.`,
  ].join("\n");
}

export function buildWhatsAppBriefingDeepLink(
  phoneNumber: string,
  digest: ExecutiveDigest,
  recipientName?: string,
): string {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
  const briefingText = buildWhatsAppMorningBriefingText(digest, recipientName);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(briefingText)}`;
}
