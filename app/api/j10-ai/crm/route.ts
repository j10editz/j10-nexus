import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type ContactType =
  | "Lead"
  | "Prospect"
  | "Customer";

type ContactStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Interested"
  | "Won"
  | "Lost";

type CRMContact = {
  id: string;
  user_id: string;

  first_name: string;
  last_name: string | null;

  email: string | null;
  phone: string | null;

  company: string | null;
  job_title: string | null;

  type: ContactType;
  status: ContactStatus;

  source: string;

  estimated_value: number;

  notes: string | null;

  last_contacted_at:
    | string
    | null;

  created_at: string;
  updated_at: string;
};

type AnalyzeRequest = {
  contactId?: string;
};

type PriorityLevel =
  | "Hot"
  | "High"
  | "Medium"
  | "Low";

type ContactIntelligence = {
  contactId: string;

  name: string;

  company: string | null;

  type: ContactType;

  status: ContactStatus;

  estimatedValue: number;

  priorityScore: number;

  priority: PriorityLevel;

  recommendedAction: string;

  reasons: string[];

  needsFollowUp: boolean;

  daysSinceLastContact:
    | number
    | null;
};

/*
============================================================
SUPABASE
============================================================
*/

async function getSupabase() {
  const cookieStore =
    await cookies();

  return createServerClient(
    process.env
      .NEXT_PUBLIC_SUPABASE_URL!,

    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,

    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            // Cookie writes may not
            // be available in every
            // server context.
          }
        },
      },
    }
  );
}

/*
============================================================
AUTH
============================================================
*/

async function getAuthenticatedUser() {
  const supabase =
    await getSupabase();

  const {
    data: { user },
    error,
  } =
    await supabase.auth.getUser();

  return {
    supabase,
    user,
    error,
  };
}

/*
============================================================
GET CRM INTELLIGENCE
============================================================
*/

export async function GET() {
  try {
    const {
      supabase,
      user,
      error: userError,
    } =
      await getAuthenticatedUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from("crm_contacts")
      .select(
        `
        id,
        user_id,
        first_name,
        last_name,
        email,
        phone,
        company,
        job_title,
        type,
        status,
        source,
        estimated_value,
        notes,
        last_contacted_at,
        created_at,
        updated_at
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      console.error(
        "J10 CRM intelligence load error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load CRM intelligence.",
        },
        {
          status: 500,
        }
      );
    }

    const contacts =
      (data ?? []) as CRMContact[];

    const intelligence =
      contacts.map(
        analyzeContact
      );

    const activeIntelligence =
      intelligence.filter(
        (item) =>
          item.status !==
            "Won" &&
          item.status !==
            "Lost"
      );

    const prioritized =
      [...activeIntelligence].sort(
        (a, b) =>
          b.priorityScore -
          a.priorityScore
      );

    const totalPipelineValue =
      activeIntelligence.reduce(
        (
          total,
          contact
        ) =>
          total +
          Number(
            contact.estimatedValue ??
              0
          ),
        0
      );

    const requiresFollowUp =
      activeIntelligence.filter(
        (contact) =>
          contact.needsFollowUp
      );

    const hotLeads =
      activeIntelligence.filter(
        (contact) =>
          contact.priority ===
          "Hot"
      );

    const highPriorityLeads =
      activeIntelligence.filter(
        (contact) =>
          contact.priority ===
          "High"
      );

    const uncontacted =
      contacts.filter(
        (contact) =>
          contact.status ===
            "New" &&
          !contact.last_contacted_at
      );

    const wonRevenue =
      contacts
        .filter(
          (contact) =>
            contact.status ===
            "Won"
        )
        .reduce(
          (
            total,
            contact
          ) =>
            total +
            Number(
              contact.estimated_value ??
                0
            ),
          0
        );

    return NextResponse.json({
      success: true,

      engine: {
        name:
          "J10 CRM Intelligence",

        version:
          "1.0",

        mode:
          "rule_based_v1",
      },

      summary: {
        totalContacts:
          contacts.length,

        activeOpportunities:
          activeIntelligence.length,

        hotLeads:
          hotLeads.length,

        highPriorityLeads:
          highPriorityLeads.length,

        requiresFollowUp:
          requiresFollowUp.length,

        uncontactedLeads:
          uncontacted.length,

        pipelineValue:
          totalPipelineValue,

        revenueWon:
          wonRevenue,
      },

      topPriority:
        prioritized.slice(
          0,
          5
        ),

      followUpQueue:
        requiresFollowUp
          .sort(
            (a, b) =>
              b.priorityScore -
              a.priorityScore
          )
          .slice(
            0,
            10
          ),

      contacts:
        intelligence,
    });
  } catch (error) {
    console.error(
      "J10 CRM intelligence GET error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 AI could not analyze CRM data.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
ANALYZE ONE CONTACT
============================================================
*/

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as AnalyzeRequest;

    const contactId =
      typeof body.contactId ===
      "string"
        ? body.contactId.trim()
        : "";

    if (!contactId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Contact ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      supabase,
      user,
      error: userError,
    } =
      await getAuthenticatedUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq(
        "id",
        contactId
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      error ||
      !data
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CRM contact not found.",
        },
        {
          status: 404,
        }
      );
    }

    const contact =
      data as CRMContact;

    const intelligence =
      analyzeContact(
        contact
      );

    return NextResponse.json({
      success: true,

      engine: {
        name:
          "J10 CRM Intelligence",

        version:
          "1.0",

        mode:
          "rule_based_v1",
      },

      intelligence,
    });
  } catch (error) {
    console.error(
      "J10 CRM contact analysis error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 AI could not analyze this CRM contact.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
INTELLIGENCE ENGINE
============================================================
*/

function analyzeContact(
  contact: CRMContact
): ContactIntelligence {
  let score = 0;

  const reasons: string[] =
    [];

  /*
  ============================================================
  PIPELINE STAGE
  ============================================================
  */

  switch (
    contact.status
  ) {
    case "New":
      score += 20;

      reasons.push(
        "New lead has not yet progressed through the sales pipeline."
      );

      break;

    case "Contacted":
      score += 35;

      reasons.push(
        "Initial contact has already been made."
      );

      break;

    case "Qualified":
      score += 60;

      reasons.push(
        "Lead has been qualified as a potential opportunity."
      );

      break;

    case "Interested":
      score += 80;

      reasons.push(
        "Lead has demonstrated active interest."
      );

      break;

    case "Won":
      score += 100;

      reasons.push(
        "Opportunity has already been won."
      );

      break;

    case "Lost":
      score = 0;

      reasons.push(
        "Opportunity is currently marked as lost."
      );

      break;
  }

  /*
  ============================================================
  CONTACT TYPE
  ============================================================
  */

  if (
    contact.type ===
    "Lead"
  ) {
    score += 10;

    reasons.push(
      "Contact is currently classified as a lead."
    );
  }

  if (
    contact.type ===
    "Prospect"
  ) {
    score += 15;

    reasons.push(
      "Contact is already classified as a prospect."
    );
  }

  /*
  ============================================================
  DEAL VALUE
  ============================================================
  */

  const value =
    Number(
      contact.estimated_value ??
        0
    );

  if (value > 0) {
    const valueScore =
      Math.min(
        25,
        Math.round(
          value / 1000
        ) * 3
      );

    score +=
      valueScore;

    if (
      value >= 5000
    ) {
      reasons.push(
        "High estimated opportunity value."
      );
    } else {
      reasons.push(
        "Opportunity has measurable pipeline value."
      );
    }
  }

  /*
  ============================================================
  CONTACT DATA QUALITY
  ============================================================
  */

  if (contact.email) {
    score += 4;
  }

  if (contact.phone) {
    score += 4;
  }

  if (contact.company) {
    score += 2;
  }

  if (
    contact.email &&
    contact.phone
  ) {
    reasons.push(
      "Multiple contact methods are available."
    );
  }

  /*
  ============================================================
  FOLLOW-UP TIMING
  ============================================================
  */

  const daysSinceLastContact =
    calculateDaysSince(
      contact.last_contacted_at
    );

  let needsFollowUp =
    false;

  if (
    contact.status !==
      "Won" &&
    contact.status !==
      "Lost"
  ) {
    if (
      daysSinceLastContact ===
      null
    ) {
      score += 10;

      needsFollowUp =
        true;

      reasons.push(
        "No previous contact activity is recorded."
      );
    } else if (
      daysSinceLastContact >=
      7
    ) {
      score += 10;

      needsFollowUp =
        true;

      reasons.push(
        "No follow-up has been recorded for at least 7 days."
      );
    } else if (
      daysSinceLastContact >=
      3
    ) {
      score += 5;

      needsFollowUp =
        true;

      reasons.push(
        "Follow-up should be considered soon."
      );
    }
  }

  /*
  ============================================================
  FINAL SCORE
  ============================================================
  */

  score =
    Math.max(
      0,
      Math.min(
        score,
        100
      )
    );

  const priority =
    getPriorityLevel(
      score,
      contact.status
    );

  const recommendedAction =
    getRecommendedAction(
      contact,
      needsFollowUp
    );

  return {
    contactId:
      contact.id,

    name:
      getFullName(
        contact
      ),

    company:
      contact.company,

    type:
      contact.type,

    status:
      contact.status,

    estimatedValue:
      value,

    priorityScore:
      score,

    priority,

    recommendedAction,

    reasons,

    needsFollowUp,

    daysSinceLastContact,
  };
}

/*
============================================================
PRIORITY
============================================================
*/

function getPriorityLevel(
  score: number,
  status: ContactStatus
): PriorityLevel {
  if (
    status ===
      "Won" ||
    status ===
      "Lost"
  ) {
    return "Low";
  }

  if (score >= 80) {
    return "Hot";
  }

  if (score >= 60) {
    return "High";
  }

  if (score >= 35) {
    return "Medium";
  }

  return "Low";
}

/*
============================================================
NEXT ACTION
============================================================
*/

function getRecommendedAction(
  contact: CRMContact,
  needsFollowUp: boolean
) {
  switch (
    contact.status
  ) {
    case "New":
      return contact.email ||
        contact.phone
        ? "Contact this lead and begin qualification."
        : "Add contact information before outreach.";

    case "Contacted":
      return needsFollowUp
        ? "Send a follow-up and evaluate qualification."
        : "Continue monitoring the lead and prepare qualification.";

    case "Qualified":
      return "Present the offer and move the opportunity toward interest.";

    case "Interested":
      return "Prioritize this opportunity and prepare the next closing action.";

    case "Won":
      return "Begin customer onboarding and retention workflow.";

    case "Lost":
      return "Review why the opportunity was lost and decide whether future re-engagement is appropriate.";

    default:
      return "Review this CRM contact.";
  }
}

/*
============================================================
DAYS SINCE CONTACT
============================================================
*/

function calculateDaysSince(
  value: string | null
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  const difference =
    Date.now() -
    date.getTime();

  return Math.max(
    0,
    Math.floor(
      difference /
        86_400_000
    )
  );
}

/*
============================================================
FULL NAME
============================================================
*/

function getFullName(
  contact: CRMContact
) {
  return (
    [
      contact.first_name,
      contact.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "CRM Contact"
  );
}