import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import {
  getJ10AIMode,
  runJ10AI,
} from "@/lib/ai/runtime";

/*
============================================================
TYPES
============================================================
*/

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

type PriorityLevel =
  | "Hot"
  | "High"
  | "Medium"
  | "Low";

type SalesAgentAction =
  | "mark_contacted"
  | "qualify"
  | "move_interested"
  | "add_ai_note"
  | "recommend_follow_up"
  | "mark_won"
  | "mark_lost";

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

type SalesAgent = {
  id: string;

  name: string;

  role: string;

  department: string;

  status: string;

  model: string;

  tasks_completed: number;

  last_active:
    | string
    | null;
};

type SalesAgentRequest = {
  employeeId?: string;

  contactId?: string;

  action?: SalesAgentAction;

  note?: string;

  /*
  True only when the human explicitly
  approves an AI recommendation or
  confirms a human-only closing action.
  */
  humanApproved?: boolean;
};

type ContactIntelligence = {
  contactId: string;

  name: string;

  company:
    | string
    | null;

  type: ContactType;

  status: ContactStatus;

  estimatedValue: number;

  priorityScore: number;

  priority: PriorityLevel;

  needsFollowUp: boolean;

  daysSinceLastContact:
    | number
    | null;

  recommendedAction: string;

  reasons: string[];
};

type J10SalesRecommendation = {
  recommendedAction: string;

  fullText: string;

  executionMode: string;

  simulated: boolean;

  apiCalled: boolean;

  targetModel: string;

  displayModel: string;

  status: string;

  estimatedCostUSD:
    | number
    | null;

  fallback: boolean;
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
            /*
            Cookie writes may not be available
            in every server context.
            */
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
IS SALES EMPLOYEE
============================================================
*/

function isSalesEmployee(
  employee: SalesAgent
) {
  const searchable =
    `${employee.name} ${employee.role} ${employee.department}`
      .trim()
      .toLowerCase();

  return searchable.includes(
    "sales"
  );
}

/*
============================================================
FIND EXACT AI SALES AGENT
============================================================
*/

async function findSalesAgentById(
  supabase: Awaited<
    ReturnType<
      typeof getSupabase
    >
  >,

  userId: string,

  employeeId: string
) {
  const {
    data,
    error,
  } = await supabase
    .from("employees")
    .select(
      `
      id,
      name,
      role,
      department,
      status,
      model,
      tasks_completed,
      last_active
      `
    )
    .eq(
      "id",
      employeeId
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "Exact Sales Agent lookup error:",
      error
    );

    return {
      agent:
        null as SalesAgent | null,

      error,

      accessDenied:
        false,
    };
  }

  if (!data) {
    return {
      agent:
        null as SalesAgent | null,

      error:
        null,

      accessDenied:
        false,
    };
  }

  const employee =
    data as SalesAgent;

  if (
    !isSalesEmployee(
      employee
    )
  ) {
    return {
      agent:
        null as SalesAgent | null,

      error:
        null,

      accessDenied:
        true,
    };
  }

  return {
    agent:
      employee,

    error:
      null,

    accessDenied:
      false,
  };
}

/*
============================================================
GET SALES AGENT CRM WORKSPACE
============================================================
*/

export async function GET(
  request: Request
) {
  try {
    const url =
      new URL(
        request.url
      );

    const employeeId =
      url.searchParams
        .get(
          "employeeId"
        )
        ?.trim() ??
      "";

    if (!employeeId) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Employee ID is required for Sales Agent CRM access.",
        },
        {
          status:
            400,
        }
      );
    }

    /*
    ============================================================
    AUTH
    ============================================================
    */

    const {
      supabase,
      user,
      error:
        userError,
    } =
      await getAuthenticatedUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unauthorized.",
        },
        {
          status:
            401,
        }
      );
    }

    /*
    ============================================================
    EXACT SALES AGENT
    ============================================================
    */

    const {
      agent,
      error:
        agentError,
      accessDenied,
    } =
      await findSalesAgentById(
        supabase,
        user.id,
        employeeId
      );

    if (agentError) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Could not load the selected AI Sales Agent.",
        },
        {
          status:
            500,
        }
      );
    }

    if (accessDenied) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "This AI employee does not have Sales Agent CRM access.",
        },
        {
          status:
            403,
        }
      );
    }

    if (!agent) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "The selected AI Sales Agent was not found.",
        },
        {
          status:
            404,
        }
      );
    }

    /*
    ============================================================
    LOAD CRM
    ============================================================
    */

    const {
      data,
      error:
        crmError,
    } = await supabase
      .from(
        "crm_contacts"
      )
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
          ascending:
            false,
        }
      );

    if (crmError) {
      console.error(
        "Sales Agent CRM load error:",
        crmError
      );

      return NextResponse.json(
        {
          success:
            false,

          error:
            "Could not load CRM opportunities.",
        },
        {
          status:
            500,
        }
      );
    }

    const contacts =
      (data ??
        []) as CRMContact[];

    /*
    ============================================================
    ACTIVE OPPORTUNITIES
    ============================================================
    */

    const activeContacts =
      contacts.filter(
        (
          contact
        ) =>
          contact.status !==
            "Won" &&
          contact.status !==
            "Lost"
      );

    /*
    ============================================================
    INTELLIGENCE
    ============================================================
    */

    const intelligence =
      activeContacts
        .map(
          analyzeContact
        )
        .sort(
          (
            a,
            b
          ) =>
            b.priorityScore -
            a.priorityScore
        );

    const followUpQueue =
      intelligence.filter(
        (
          contact
        ) =>
          contact.needsFollowUp
      );

    /*
    ============================================================
    PIPELINE
    ============================================================
    */

    const pipelineValue =
      activeContacts.reduce(
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

    const hotLeads =
      intelligence.filter(
        (
          contact
        ) =>
          contact.priority ===
          "Hot"
      ).length;

    const highPriority =
      intelligence.filter(
        (
          contact
        ) =>
          contact.priority ===
          "High"
      ).length;

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    return NextResponse.json({
      success:
        true,

      engine: {
        name:
          "J10 AI Sales Agent CRM",

        version:
          "1.4",

        mode:
          "exact_employee_human_closing",
      },

      binding: {
        mode:
          "exact_employee",

        employeeId:
          agent.id,

        verified:
          true,
      },

      salesAgent: {
        id:
          agent.id,

        name:
          agent.name,

        role:
          agent.role,

        department:
          agent.department,

        status:
          agent.status,

        model:
          agent.model,

        tasksCompleted:
          Number(
            agent.tasks_completed ??
              0
          ),

        lastActive:
          agent.last_active,
      },

      access: {
        crmRead:
          true,

        analyze:
          true,

        markContacted:
          true,

        qualify:
          true,

        moveInterested:
          true,

        addAINote:
          true,

        /*
        AI itself cannot make
        Won / Lost decisions.
        */

        markWon:
          false,

        markLost:
          false,

        humanClosing:
          true,
      },

      summary: {
        activeOpportunities:
          intelligence.length,

        hotLeads,

        highPriority,

        followUps:
          followUpQueue.length,

        pipelineValue,
      },

      priorityQueue:
        intelligence.slice(
          0,
          10
        ),

      followUpQueue:
        followUpQueue.slice(
          0,
          10
        ),
    });
  } catch (error) {
    console.error(
      "AI Sales Agent CRM GET error:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          "J10 AI Sales Agent could not access CRM.",
      },
      {
        status:
          500,
      }
    );
  }
}

/*
============================================================
POST - CONTROLLED SALES ACTION
============================================================
*/

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as SalesAgentRequest;

    const employeeId =
      typeof body.employeeId ===
      "string"
        ? body.employeeId.trim()
        : "";

    const contactId =
      typeof body.contactId ===
      "string"
        ? body.contactId.trim()
        : "";

    const action =
      body.action;

    /*
    True only when frontend sends
    humanApproved: true.
    */

    const humanApproved =
      body.humanApproved ===
      true;

    /*
    ============================================================
    VALIDATION
    ============================================================
    */

    if (
      !employeeId ||
      !contactId ||
      !action
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Employee ID, Contact ID and action are required.",
        },
        {
          status:
            400,
        }
      );
    }

    const validActions:
      SalesAgentAction[] = [
        "mark_contacted",
        "qualify",
        "move_interested",
        "add_ai_note",
        "recommend_follow_up",
        "mark_won",
        "mark_lost",
      ];

    if (
      !validActions.includes(
        action
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unsupported Sales Agent action.",
        },
        {
          status:
            400,
        }
      );
    }

    /*
    ============================================================
    AUTH
    ============================================================
    */

    const {
      supabase,
      user,
      error:
        userError,
    } =
      await getAuthenticatedUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unauthorized.",
        },
        {
          status:
            401,
        }
      );
    }

    /*
    ============================================================
    VERIFY EXACT SALES AGENT
    ============================================================
    */

    const {
      agent,
      error:
        agentError,
      accessDenied,
    } =
      await findSalesAgentById(
        supabase,
        user.id,
        employeeId
      );

    if (agentError) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Could not verify the selected AI Sales Agent.",
        },
        {
          status:
            500,
        }
      );
    }

    if (accessDenied) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "This AI employee does not have Sales Agent CRM access.",
        },
        {
          status:
            403,
        }
      );
    }

    if (!agent) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "The selected AI Sales Agent does not exist.",
        },
        {
          status:
            404,
        }
      );
    }

    /*
    ============================================================
    EMPLOYEE MUST BE RUNNING
    ============================================================
    */

    if (
      agent.status !==
      "Running"
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "The selected AI Sales Agent must be running before it can access controlled CRM operations.",

          salesAgentStatus:
            agent.status,

          employeeId:
            agent.id,
        },
        {
          status:
            409,
        }
      );
    }

    /*
    ============================================================
    LOAD CONTACT
    ============================================================
    */

    const {
      data:
        contactData,

      error:
        contactError,
    } = await supabase
      .from(
        "crm_contacts"
      )
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
      contactError ||
      !contactData
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "CRM contact not found.",
        },
        {
          status:
            404,
        }
      );
    }

    const contact =
      contactData as CRMContact;

    const beforeIntelligence =
      analyzeContact(
        contact
      );

    /*
    ============================================================
    J10 AI RECOMMENDATION
    ============================================================
    */

    if (
      action ===
      "recommend_follow_up"
    ) {
      const j10Recommendation =
        await generateJ10SalesRecommendation(
          agent,
          contact,
          beforeIntelligence
        );

      const finalIntelligence:
        ContactIntelligence = {
        ...beforeIntelligence,

        recommendedAction:
          j10Recommendation.recommendedAction,
      };

      await recordActivity({
        supabase,

        userId:
          user.id,

        agent,

        contact,

        action:
          "ai_sales_recommendation",

        title:
          `${agent.name} reviewed ${getFullName(
            contact
          )}`,

        description:
          j10Recommendation.recommendedAction,

        metadata: {
          exact_employee_binding:
            true,

          crm_contact_id:
            contact.id,

          priority:
            finalIntelligence.priority,

          priority_score:
            finalIntelligence.priorityScore,

          estimated_value:
            contact.estimated_value,

          recommended_action:
            finalIntelligence.recommendedAction,

          intelligence_source:
            "j10_ai_runtime",

          j10_execution_mode:
            j10Recommendation.executionMode,

          j10_simulated:
            j10Recommendation.simulated,

          j10_api_called:
            j10Recommendation.apiCalled,

          j10_target_model:
            j10Recommendation.targetModel,

          j10_display_model:
            j10Recommendation.displayModel,

          j10_status:
            j10Recommendation.status,

          j10_estimated_cost_usd:
            j10Recommendation.estimatedCostUSD,

          j10_fallback:
            j10Recommendation.fallback,
        },
      });

      await incrementAgentTasks(
        supabase,
        user.id,
        agent
      );

      return NextResponse.json({
        success:
          true,

        executed:
          false,

        action,

        message:
          "J10 AI Sales recommendation prepared.",

        binding: {
          mode:
            "exact_employee",

          employeeId:
            agent.id,

          verified:
            true,
        },

        salesAgent: {
          id:
            agent.id,

          name:
            agent.name,

          status:
            agent.status,
        },

        intelligence:
          finalIntelligence,

        j10AI: {
          source:
            "j10_ai_runtime",

          executionMode:
            j10Recommendation.executionMode,

          simulated:
            j10Recommendation.simulated,

          apiCalled:
            j10Recommendation.apiCalled,

          targetModel:
            j10Recommendation.targetModel,

          displayModel:
            j10Recommendation.displayModel,

          status:
            j10Recommendation.status,

          estimatedCostUSD:
            j10Recommendation.estimatedCostUSD,

          fallback:
            j10Recommendation.fallback,

          text:
            j10Recommendation.fullText,
        },
      });
    }

    /*
    ============================================================
    CLOSED OPPORTUNITY PROTECTION
    ============================================================
    */

    if (
      contact.status ===
        "Won" ||
      contact.status ===
        "Lost"
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "This opportunity is already closed and cannot be changed.",

          status:
            contact.status,
        },
        {
          status:
            409,
        }
      );
    }

    /*
    ============================================================
    HUMAN-ONLY CLOSING SECURITY
    ============================================================

    AI may NEVER independently decide
    Won or Lost.

    Closing requires:
    - humanApproved = true
    - current CRM status = Interested
    */

    if (
      action ===
        "mark_won" ||
      action ===
        "mark_lost"
    ) {
      if (!humanApproved) {
        return NextResponse.json(
          {
            success:
              false,

            error:
              "Won and Lost decisions require explicit human approval.",

            humanApprovalRequired:
              true,
          },
          {
            status:
              403,
          }
        );
      }

      if (
        contact.status !==
        "Interested"
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error:
              "Only an Interested opportunity can be closed as Won or Lost.",

            currentStatus:
              contact.status,
          },
          {
            status:
              409,
          }
        );
      }
    }

    /*
    ============================================================
    UPDATE DATA
    ============================================================
    */

    const now =
      new Date().toISOString();

    const updateData: Record<
      string,
      unknown
    > = {
      updated_at:
        now,
    };

    let activityAction =
      "";

    let activityTitle =
      "";

    let activityDescription =
      "";

    /*
    ============================================================
    MARK CONTACTED
    ============================================================
    */

    if (
      action ===
      "mark_contacted"
    ) {
      updateData.status =
        "Contacted";

      updateData.last_contacted_at =
        now;

      activityAction =
        "ai_sales_contacted";

      activityTitle =
        `${agent.name} marked ${getFullName(
          contact
        )} as contacted`;

      activityDescription =
        `${getFullName(
          contact
        )} was moved to Contacted by ${agent.name}.`;
    }

    /*
    ============================================================
    QUALIFY
    ============================================================
    */

    if (
      action ===
      "qualify"
    ) {
      updateData.status =
        "Qualified";

      updateData.type =
        "Prospect";

      activityAction =
        "ai_sales_qualified";

      activityTitle =
        `${agent.name} qualified ${getFullName(
          contact
        )}`;

      activityDescription =
        `${getFullName(
          contact
        )} was classified as a qualified prospect by ${agent.name}.`;
    }

    /*
    ============================================================
    MOVE INTERESTED
    ============================================================
    */

    if (
      action ===
      "move_interested"
    ) {
      updateData.status =
        "Interested";

      updateData.type =
        "Prospect";

      activityAction =
        "ai_sales_interested";

      activityTitle =
        `${agent.name} advanced ${getFullName(
          contact
        )}`;

      activityDescription =
        `${getFullName(
          contact
        )} was moved to Interested by ${agent.name}.`;
    }

    /*
    ============================================================
    MARK WON
    HUMAN ONLY
    ============================================================
    */

    if (
      action ===
      "mark_won"
    ) {
      updateData.status =
        "Won";

      updateData.type =
        "Customer";

      activityAction =
        "human_sales_closed_won";

      activityTitle =
        `Human marked ${getFullName(
          contact
        )} as Won`;

      activityDescription =
        `${getFullName(
          contact
        )} was closed as Won with an opportunity value of ${formatMoney(
          Number(
            contact.estimated_value ??
              0
          )
        )}.`;
    }

    /*
    ============================================================
    MARK LOST
    HUMAN ONLY
    ============================================================
    */

    if (
      action ===
      "mark_lost"
    ) {
      updateData.status =
        "Lost";

      /*
      Lost opportunities remain prospects.
      */

      updateData.type =
        "Prospect";

      activityAction =
        "human_sales_closed_lost";

      activityTitle =
        `Human marked ${getFullName(
          contact
        )} as Lost`;

      activityDescription =
        `${getFullName(
          contact
        )} was closed as Lost.`;
    }

    /*
    ============================================================
    AI NOTE
    ============================================================
    */

    if (
      action ===
      "add_ai_note"
    ) {
      const suppliedNote =
        typeof body.note ===
        "string"
          ? body.note.trim()
          : "";

      const aiNote =
        suppliedNote ||
        generateSalesNote(
          contact,
          beforeIntelligence
        );

      const existingNotes =
        contact.notes?.trim() ??
        "";

      const timestamp =
        new Date().toLocaleString(
          "en-US",
          {
            dateStyle:
              "medium",

            timeStyle:
              "short",
          }
        );

      const formattedNote =
        `[J10 AI Sales Agent - ${timestamp}]\n${aiNote}`;

      updateData.notes =
        existingNotes
          ? `${existingNotes}\n\n${formattedNote}`
          : formattedNote;

      activityAction =
        "ai_sales_note_added";

      activityTitle =
        `${agent.name} added a CRM note for ${getFullName(
          contact
        )}`;

      activityDescription =
        aiNote;
    }

    /*
    ============================================================
    UPDATE CRM
    ============================================================
    */

    const {
      data:
        updatedData,

      error:
        updateError,
    } = await supabase
      .from(
        "crm_contacts"
      )
      .update(
        updateData
      )
      .eq(
        "id",
        contact.id
      )
      .eq(
        "user_id",
        user.id
      )
      .select("*")
      .single();

    if (
      updateError ||
      !updatedData
    ) {
      console.error(
        "AI Sales Agent CRM update error:",
        updateError
      );

      return NextResponse.json(
        {
          success:
            false,

          error:
            "J10 NEXUS could not update this CRM contact.",
        },
        {
          status:
            500,
        }
      );
    }

    const updatedContact =
      updatedData as CRMContact;

    const afterIntelligence =
      analyzeContact(
        updatedContact
      );

    /*
    ============================================================
    NORMAL ACTIVITY LOG
    ============================================================
    */

    await recordActivity({
      supabase,

      userId:
        user.id,

      agent,

      contact:
        updatedContact,

      action:
        activityAction,

      title:
        activityTitle,

      description:
        activityDescription,

      metadata: {
        exact_employee_binding:
          true,

        crm_contact_id:
          updatedContact.id,

        previous_status:
          contact.status,

        current_status:
          updatedContact.status,

        previous_type:
          contact.type,

        current_type:
          updatedContact.type,

        estimated_value:
          updatedContact.estimated_value,

        priority:
          afterIntelligence.priority,

        priority_score:
          afterIntelligence.priorityScore,

        human_closing:
          action ===
            "mark_won" ||
          action ===
            "mark_lost",
      },
    });

    /*
    ============================================================
    HUMAN APPROVAL AUDIT
    ============================================================
    */

    if (humanApproved) {
      await recordHumanApproval({
        supabase,

        userId:
          user.id,

        userEmail:
          user.email ??
          null,

        agent,

        contact:
          updatedContact,

        action,

        previousStatus:
          contact.status,

        newStatus:
          updatedContact.status,

        previousType:
          contact.type,

        newType:
          updatedContact.type,
      });
    }

    /*
    ============================================================
    EMPLOYEE TASK COUNT
    ============================================================
    */

    await incrementAgentTasks(
      supabase,
      user.id,
      agent
    );

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    const humanClosing =
      action ===
        "mark_won" ||
      action ===
        "mark_lost";

    return NextResponse.json({
      success:
        true,

      executed:
        true,

      humanApproved,

      humanClosing,

      action,

      message:
        humanClosing
          ? action ===
            "mark_won"
            ? "Opportunity successfully closed as Won."
            : "Opportunity successfully closed as Lost."
          : humanApproved
            ? "Human-approved AI Sales Agent action completed."
            : "AI Sales Agent completed the CRM action.",

      binding: {
        mode:
          "exact_employee",

        employeeId:
          agent.id,

        verified:
          true,
      },

      audit: {
        humanApproved,

        recorded:
          humanApproved,

        humanClosing,

        approvedBy:
          humanApproved
            ? user.id
            : null,

        timestamp:
          humanApproved
            ? new Date().toISOString()
            : null,
      },

      salesAgent: {
        id:
          agent.id,

        name:
          agent.name,

        status:
          agent.status,
      },

      contact:
        updatedContact,

      intelligence:
        afterIntelligence,
    });
  } catch (error) {
    console.error(
      "AI Sales Agent CRM POST error:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          "J10 AI Sales Agent could not execute the CRM action.",
      },
      {
        status:
          500,
      }
    );
  }
}

/*
============================================================
J10 AI SALES RECOMMENDATION
============================================================
*/

async function generateJ10SalesRecommendation(
  agent: SalesAgent,

  contact: CRMContact,

  intelligence:
    ContactIntelligence
): Promise<J10SalesRecommendation> {
  const fallbackAction =
    intelligence.recommendedAction;

  const input = `
OPPORTUNITY A

Name: ${getFullName(
    contact
  )}

Company: ${
    contact.company ??
    "Unknown"
  }

Job Title: ${
    contact.job_title ??
    "Unknown"
  }

Status: ${contact.status}

Type: ${contact.type}

Priority: ${intelligence.priority}

Priority Score: ${intelligence.priorityScore}

Estimated Value: ${formatMoney(
    intelligence.estimatedValue
  )}

Needs Follow-Up: ${
    intelligence.needsFollowUp
      ? "Yes"
      : "No"
  }

Days Since Last Contact: ${
    intelligence.daysSinceLastContact ===
    null
      ? "No previous contact recorded"
      : intelligence.daysSinceLastContact
  }

Email Available: ${
    contact.email
      ? "Yes"
      : "No"
  }

Phone Available: ${
    contact.phone
      ? "Yes"
      : "No"
  }

Current Rule-Based Recommendation:
${fallbackAction}

REASONS:
${intelligence.reasons
  .map(
    (
      reason,
      index
    ) =>
      `${index + 1}. ${reason}`
  )
  .join("\n")}

AI EMPLOYEE:
Name: ${agent.name}
Role: ${agent.role}
Department: ${agent.department}
`.trim();

  try {
    const result =
      await runJ10AI({
        task:
          "sales_decision",

        input,

        instructions: `
You are the J10 NEXUS AI Sales Agent.

Analyze the CRM opportunity supplied by J10 NEXUS.

Your job is to recommend the next safe sales action.

Rules:
- Do not claim an action was executed.
- Do not invent customer information.
- Respect CRM status and available evidence.
- Won and Lost decisions remain human-controlled.
- Never make the final Won or Lost decision yourself.
- Give a specific next action.
- Keep the recommendation operational and concise.

Return the recommendation in this format:

ACTION: <recommended next action>
`,

        maxOutputTokens:
          1200,
      });

    const recommendedAction =
      extractRecommendedAction(
        result.text,

        getFullName(
          contact
        ),

        fallbackAction
      );

    return {
      recommendedAction,

      fullText:
        result.text,

      executionMode:
        result.executionMode,

      simulated:
        result.simulated,

      apiCalled:
        result.apiCalled,

      targetModel:
        result.model,

      displayModel:
        result.displayModel,

      status:
        result.status,

      estimatedCostUSD:
        result.estimatedCostUSD,

      fallback:
        false,
    };
  } catch (error) {
    console.error(
      "J10 AI Sales recommendation runtime error:",
      error
    );

    return {
      recommendedAction:
        fallbackAction,

      fullText:
        fallbackAction,

      executionMode:
        "fallback",

      simulated:
        true,

      apiCalled:
        false,

      targetModel:
        "unavailable",

      displayModel:
        "J10 CRM Rules",

      status:
        "fallback",

      estimatedCostUSD:
        0,

      fallback:
        true,
    };
  }
}

/*
============================================================
EXTRACT RECOMMENDED ACTION
============================================================
*/

function extractRecommendedAction(
  text: string,

  contactName: string,

  fallback: string
) {
  const lines =
    text
      .split(
        /\r?\n/
      )
      .map(
        (
          line
        ) =>
          line.trim()
      )
      .filter(
        Boolean
      );

  const actionLine =
    lines.find(
      (
        line
      ) =>
        line
          .toUpperCase()
          .startsWith(
            "ACTION:"
          )
    );

  if (actionLine) {
    const action =
      actionLine
        .slice(
          actionLine.indexOf(
            ":"
          ) + 1
        )
        .trim();

    if (action) {
      return action;
    }
  }

  const contactPrefix =
    `${contactName}:`
      .toLowerCase();

  const contactLine =
    lines.find(
      (
        line
      ) =>
        line
          .toLowerCase()
          .startsWith(
            contactPrefix
          )
    );

  if (contactLine) {
    const action =
      contactLine
        .slice(
          contactLine.indexOf(
            ":"
          ) + 1
        )
        .trim();

    if (action) {
      return action;
    }
  }

  return fallback;
}

/*
============================================================
ANALYZE CONTACT
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
  STATUS
  ============================================================
  */

  switch (
    contact.status
  ) {
    case "New":
      score += 20;

      reasons.push(
        "This lead is new and has not progressed through the pipeline."
      );

      break;

    case "Contacted":
      score += 35;

      reasons.push(
        "Initial contact has already been recorded."
      );

      break;

    case "Qualified":
      score += 60;

      reasons.push(
        "This opportunity has been qualified."
      );

      break;

    case "Interested":
      score += 80;

      reasons.push(
        "This prospect has demonstrated active interest."
      );

      break;

    case "Won":
      score += 100;

      reasons.push(
        "This opportunity has already been won."
      );

      break;

    case "Lost":
      score = 0;

      reasons.push(
        "This opportunity is marked as lost."
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
  }

  if (
    contact.type ===
    "Prospect"
  ) {
    score += 15;

    reasons.push(
      "The contact is already classified as a prospect."
    );
  }

  /*
  ============================================================
  VALUE
  ============================================================
  */

  const estimatedValue =
    Number(
      contact.estimated_value ??
        0
    );

  if (
    estimatedValue >
    0
  ) {
    const valueScore =
      Math.min(
        25,

        Math.round(
          estimatedValue /
            1000
        ) * 3
      );

    score +=
      valueScore;

    if (
      estimatedValue >=
      5000
    ) {
      reasons.push(
        "This opportunity has significant pipeline value."
      );
    }
  }

  /*
  ============================================================
  DATA QUALITY
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
  FOLLOW-UP
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
        "No follow-up has been recorded for at least seven days."
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
  NORMALIZE
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

    estimatedValue,

    priorityScore:
      score,

    priority:
      getPriorityLevel(
        score,
        contact.status
      ),

    needsFollowUp,

    daysSinceLastContact,

    recommendedAction:
      getRecommendedAction(
        contact,
        needsFollowUp
      ),

    reasons,
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
RECOMMENDED ACTION
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
        ? "Follow up with this lead and evaluate qualification."
        : "Continue monitoring this lead and prepare qualification.";

    case "Qualified":
      return "Present the offer and move this opportunity toward interest.";

    case "Interested":
      return "Prioritize this opportunity and prepare the next human-controlled closing action.";

    case "Won":
      return "Begin customer onboarding and retention.";

    case "Lost":
      return "Review the lost opportunity before considering future re-engagement.";

    default:
      return "Review this CRM contact.";
  }
}

/*
============================================================
SALES NOTE
============================================================
*/

function generateSalesNote(
  contact: CRMContact,

  intelligence:
    ContactIntelligence
) {
  return (
    `${getFullName(
      contact
    )} is currently a ` +
    `${intelligence.priority.toLowerCase()} priority opportunity ` +
    `with a score of ${intelligence.priorityScore}/100 ` +
    `and an estimated value of ${formatMoney(
      intelligence.estimatedValue
    )}. ` +
    `Recommended next action: ${intelligence.recommendedAction}`
  );
}

/*
============================================================
ACTIVITY LOG
============================================================
*/

async function recordActivity({
  supabase,

  userId,

  agent,

  contact,

  action,

  title,

  description,

  metadata,
}: {
  supabase: Awaited<
    ReturnType<
      typeof getSupabase
    >
  >;

  userId: string;

  agent: SalesAgent;

  contact: CRMContact;

  action: string;

  title: string;

  description: string;

  metadata: Record<
    string,
    unknown
  >;
}) {
  const {
    error,
  } = await supabase
    .from(
      "activity_logs"
    )
    .insert({
      user_id:
        userId,

      entity_type:
        "ai_employee",

      entity_id:
        agent.id,

      action,

      title,

      description,

      metadata: {
        ...metadata,

        source:
          "ai_sales_agent",

        exact_employee_binding:
          true,

        sales_agent_id:
          agent.id,

        sales_agent_name:
          agent.name,

        crm_contact_id:
          contact.id,

        crm_contact_name:
          getFullName(
            contact
          ),
      },
    });

  if (error) {
    console.error(
      "AI Sales activity log error:",
      error
    );
  }
}

/*
============================================================
INCREMENT EXACT AGENT TASKS
============================================================
*/

async function incrementAgentTasks(
  supabase: Awaited<
    ReturnType<
      typeof getSupabase
    >
  >,

  userId: string,

  agent: SalesAgent
) {
  const {
    error,
  } = await supabase
    .from(
      "employees"
    )
    .update({
      tasks_completed:
        Number(
          agent.tasks_completed ??
            0
        ) + 1,

      last_active:
        "Just now",
    })
    .eq(
      "id",
      agent.id
    )
    .eq(
      "user_id",
      userId
    );

  if (error) {
    console.error(
      "Exact AI Sales Agent task update error:",
      error
    );
  }
}

/*
============================================================
HUMAN APPROVAL AUDIT
============================================================
*/

async function recordHumanApproval({
  supabase,

  userId,

  userEmail,

  agent,

  contact,

  action,

  previousStatus,

  newStatus,

  previousType,

  newType,
}: {
  supabase: Awaited<
    ReturnType<
      typeof getSupabase
    >
  >;

  userId: string;

  userEmail:
    | string
    | null;

  agent: SalesAgent;

  contact: CRMContact;

  action: SalesAgentAction;

  previousStatus:
    ContactStatus;

  newStatus:
    ContactStatus;

  previousType:
    ContactType;

  newType:
    ContactType;
}) {
  const executionMode =
    getJ10AIMode();

  const isClosing =
    action ===
      "mark_won" ||
    action ===
      "mark_lost";

  const {
    error,
  } = await supabase
    .from(
      "activity_logs"
    )
    .insert({
      user_id:
        userId,

      action:
        isClosing
          ? "human_sales_closing_audit"
          : "ai_sales_human_approved_execution",

      entity_type:
        "ai_employee",

      entity_id:
        agent.id,

      title:
        isClosing
          ? `Human approved ${getAuditActionLabel(
              action
            )} for ${getFullName(
              contact
            )}`
          : `Human approved ${getAuditActionLabel(
              action
            )} for ${getFullName(
              contact
            )}`,

      description:
        isClosing
          ? `${getFullName(
              contact
            )} was closed by a human. Status changed from ${previousStatus} to ${newStatus}.`
          : `${agent.name} executed an approved CRM action. Status changed from ${previousStatus} to ${newStatus}.`,

      metadata: {
        audit_type:
          isClosing
            ? "human_controlled_sales_closing"
            : "human_approved_ai_execution",

        approved:
          true,

        approved_by_user_id:
          userId,

        approved_by_email:
          userEmail,

        approved_at:
          new Date().toISOString(),

        exact_employee_binding:
          true,

        sales_agent_id:
          agent.id,

        sales_agent_name:
          agent.name,

        crm_contact_id:
          contact.id,

        crm_contact_name:
          getFullName(
            contact
          ),

        action,

        previous_status:
          previousStatus,

        new_status:
          newStatus,

        previous_type:
          previousType,

        new_type:
          newType,

        estimated_value:
          Number(
            contact.estimated_value ??
              0
          ),

        j10_ai_mode:
          executionMode,

        openai_api_called_for_execution:
          false,

        execution_cost_usd:
          0,

        human_controlled:
          true,

        final_closing_decision:
          isClosing,
      },
    });

  if (error) {
    console.error(
      "Human approval audit error:",
      error
    );
  }
}

/*
============================================================
AUDIT ACTION LABEL
============================================================
*/

function getAuditActionLabel(
  action: SalesAgentAction
) {
  switch (action) {
    case "mark_contacted":
      return "Mark Contacted";

    case "qualify":
      return "Qualify Lead";

    case "move_interested":
      return "Move to Interested";

    case "add_ai_note":
      return "Add AI Note";

    case "recommend_follow_up":
      return "Prepare Recommendation";

    case "mark_won":
      return "Mark Won";

    case "mark_lost":
      return "Mark Lost";
  }
}

/*
============================================================
DAYS SINCE CONTACT
============================================================
*/

function calculateDaysSince(
  value:
    | string
    | null
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(
      value
    );

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
NAME
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
      .filter(
        Boolean
      )
      .join(" ")
      .trim() ||
    "CRM Contact"
  );
}

/*
============================================================
MONEY
============================================================
*/

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",

      maximumFractionDigits:
        0,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}