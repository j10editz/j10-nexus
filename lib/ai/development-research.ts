/*
============================================================
J10 DEVELOPMENT RESEARCH ENGINE
============================================================

Free deterministic research simulation.

IMPORTANT:

This engine does NOT browse the web.
It does NOT invent current companies, pricing,
market share or external facts.

It produces a useful research brief using only
the context supplied to the AI employee.

============================================================
*/

export function buildDevelopmentResearchResponse(
  input: string
) {
  const title =
    getSectionField(
      input,
      "Title"
    ) ||
    "Research Task";

  const instructions =
    getSectionField(
      input,
      "Instructions"
    );

  const suppliedInput =
    extractSuppliedInput(
      input
    );

  return `
J10 AI RESEARCH ASSISTANT

DEVELOPMENT RESEARCH REPORT


TASK

${title}


OBJECTIVE

${
  instructions ||
  "Analyze the supplied business context and prepare a structured research brief."
}


AVAILABLE BUSINESS CONTEXT

${
  suppliedInput ||
  "No additional business context was supplied."
}


RESEARCH STATUS

This task was completed using the J10 NEXUS
development research engine.

External web research was NOT performed.

Because J10 is currently operating in development
mode, the Research Assistant will not invent
competitor names, current pricing, market share,
product features or other external facts that
were not supplied.


COMPETITIVE RESEARCH FRAMEWORK

Evaluate each competitor across:

1. Product Positioning
   - What problem does the platform solve?
   - Who is the target customer?
   - Is it positioned as AI software,
     automation software or an AI workforce?

2. AI Workforce Capabilities
   - Can businesses create AI employees?
   - Can employees receive individual tasks?
   - Are employees connected to business systems?
   - Are permissions employee-specific?

3. Automation
   - What actions can execute automatically?
   - What requires human approval?
   - Are workflows auditable?

4. Business Intelligence
   - CRM intelligence
   - Research
   - Sales recommendations
   - Operational analysis
   - Decision support

5. Integrations
   - CRM
   - Email
   - Messaging
   - Calendar
   - Ecommerce
   - Payments
   - Business applications

6. Trust and Control
   - Human approval
   - Audit history
   - Exact employee binding
   - Permission boundaries
   - Cost visibility

7. Commercial Model
   - Pricing structure
   - Usage limits
   - AI model costs
   - Per-seat versus usage-based pricing


J10 NEXUS DIFFERENTIATION AREAS TO TEST

Based on the supplied J10 NEXUS context,
research should determine whether competitors
offer the same combination of:

- AI employees
- employee-specific task assignment
- AI workforce execution
- CRM intelligence
- human approval for sensitive actions
- permanent activity and approval history
- exact AI employee execution binding
- centralized business automation


FIVE-COMPETITOR RESEARCH MATRIX

COMPETITOR 1

Company:
To be researched

Primary Product:
To be researched

Strengths:
To be researched

Weaknesses:
To be researched

Pricing:
To be verified

J10 Opportunity:
Determine where J10 NEXUS can provide
stronger workforce control or automation.


COMPETITOR 2

Company:
To be researched

Primary Product:
To be researched

Strengths:
To be researched

Weaknesses:
To be researched

Pricing:
To be verified

J10 Opportunity:
Compare AI employee capabilities and
business-system integration.


COMPETITOR 3

Company:
To be researched

Primary Product:
To be researched

Strengths:
To be researched

Weaknesses:
To be researched

Pricing:
To be verified

J10 Opportunity:
Compare human approval, auditability
and controlled execution.


COMPETITOR 4

Company:
To be researched

Primary Product:
To be researched

Strengths:
To be researched

Weaknesses:
To be researched

Pricing:
To be verified

J10 Opportunity:
Compare task execution and workforce
management capabilities.


COMPETITOR 5

Company:
To be researched

Primary Product:
To be researched

Strengths:
To be researched

Weaknesses:
To be researched

Pricing:
To be verified

J10 Opportunity:
Determine whether J10 can differentiate
through a unified AI business operating system.


RECOMMENDED NEXT RESEARCH ACTION

When external research capability becomes available,
verify five real competitors and collect evidence for:

- current product capabilities
- current pricing
- target market
- integrations
- AI agent architecture
- human approval controls
- automation capabilities
- customer positioning

Then rank them against J10 NEXUS using the
competitive research framework above.


EXECUTION INFORMATION

Mode:
Development

OpenAI API Called:
No

External Web Research:
No

API Cost:
$0

Result Type:
Deterministic Research Brief
`.trim();
}

/*
============================================================
FIELD
============================================================
*/

function getSectionField(
  text: string,
  field: string
) {
  const escaped =
    field.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const match =
    text.match(
      new RegExp(
        `^${escaped}:\\s*\\n?([^\\n]+)`,
        "im"
      )
    );

  return (
    match?.[1]?.trim() ??
    ""
  );
}

/*
============================================================
SUPPLIED INPUT
============================================================
*/

function extractSuppliedInput(
  text: string
) {
  const match =
    text.match(
      /SUPPLIED INPUT\s*\n+([\s\S]*?)\n+\s*EXECUTION RULE/i
    );

  return (
    match?.[1]?.trim() ??
    ""
  );
}