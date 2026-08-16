import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

type UpdateContactRequest = {
  action?: "update" | "contacted";

  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;

  type?: ContactType;
  status?: ContactStatus;

  source?: string;

  estimatedValue?: number;

  notes?: string;
};

const VALID_TYPES: ContactType[] = [
  "Lead",
  "Prospect",
  "Customer",
];

const VALID_STATUSES: ContactStatus[] = [
  "New",
  "Contacted",
  "Qualified",
  "Interested",
  "Won",
  "Lost",
];

async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
            // be available here.
          }
        },
      },
    }
  );
}

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
GET ONE CONTACT
============================================================
*/

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

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
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: contact,
      error,
    } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      error ||
      !contact
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

    return NextResponse.json({
      success: true,
      contact,
    });
  } catch (error) {
    console.error(
      "CRM contact GET error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Could not load CRM contact.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
UPDATE CONTACT
============================================================
*/

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const body =
      (await request.json()) as UpdateContactRequest;

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
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: currentContact,
      error: contactError,
    } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      contactError ||
      !currentContact
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

    const updateData: Record<
      string,
      unknown
    > = {
      updated_at:
        new Date().toISOString(),
    };

    let activityAction =
      "crm_contact_updated";

    let activityTitle =
      `${getFullName(currentContact)} updated`;

    let activityDescription =
      `${getFullName(currentContact)} CRM information was updated.`;

    /*
    ============================================================
    MARK CONTACTED
    ============================================================
    */

    if (
      body.action === "contacted"
    ) {
      updateData.status =
        "Contacted";

      updateData.last_contacted_at =
        new Date().toISOString();

      activityAction =
        "crm_contact_contacted";

      activityTitle =
        `${getFullName(currentContact)} contacted`;

      activityDescription =
        `${getFullName(currentContact)} was marked as contacted.`;
    }

    /*
    ============================================================
    NORMAL UPDATE
    ============================================================
    */

    if (
      !body.action ||
      body.action === "update"
    ) {
      if (
        typeof body.firstName ===
        "string"
      ) {
        const value =
          body.firstName.trim();

        if (!value) {
          return NextResponse.json(
            {
              success: false,
              error:
                "First name cannot be empty.",
            },
            {
              status: 400,
            }
          );
        }

        updateData.first_name =
          value;
      }

      if (
        typeof body.lastName ===
        "string"
      ) {
        updateData.last_name =
          body.lastName.trim() ||
          null;
      }

      if (
        typeof body.email ===
        "string"
      ) {
        updateData.email =
          body.email
            .trim()
            .toLowerCase() ||
          null;
      }

      if (
        typeof body.phone ===
        "string"
      ) {
        updateData.phone =
          body.phone.trim() ||
          null;
      }

      if (
        typeof body.company ===
        "string"
      ) {
        updateData.company =
          body.company.trim() ||
          null;
      }

      if (
        typeof body.jobTitle ===
        "string"
      ) {
        updateData.job_title =
          body.jobTitle.trim() ||
          null;
      }

      if (
        body.type !==
        undefined
      ) {
        if (
          !VALID_TYPES.includes(
            body.type
          )
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Invalid contact type.",
            },
            {
              status: 400,
            }
          );
        }

        updateData.type =
          body.type;
      }

      if (
        body.status !==
        undefined
      ) {
        if (
          !VALID_STATUSES.includes(
            body.status
          )
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Invalid CRM status.",
            },
            {
              status: 400,
            }
          );
        }

        updateData.status =
          body.status;

        if (
          body.status ===
          "Contacted"
        ) {
          updateData.last_contacted_at =
            new Date().toISOString();
        }

        if (
          body.status ===
          "Won"
        ) {
          updateData.type =
            "Customer";
        }
      }

      if (
        typeof body.source ===
        "string"
      ) {
        updateData.source =
          body.source.trim() ||
          "Manual";
      }

      if (
        body.estimatedValue !==
        undefined
      ) {
        if (
          typeof body.estimatedValue !==
            "number" ||
          !Number.isFinite(
            body.estimatedValue
          ) ||
          body.estimatedValue <
            0
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Estimated value must be zero or greater.",
            },
            {
              status: 400,
            }
          );
        }

        updateData.estimated_value =
          body.estimatedValue;
      }

      if (
        typeof body.notes ===
        "string"
      ) {
        updateData.notes =
          body.notes.trim() ||
          null;
      }
    }

    if (
      body.action &&
      body.action !==
        "update" &&
      body.action !==
        "contacted"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid CRM action.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: updatedContact,
      error: updateError,
    } = await supabase
      .from("crm_contacts")
      .update(updateData)
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      )
      .select("*")
      .single();

    if (
      updateError ||
      !updatedContact
    ) {
      console.error(
        "CRM update error:",
        updateError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not update CRM contact.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    ============================================================
    ACTIVITY
    ============================================================
    */

    const updatedName =
      getFullName(
        updatedContact
      );

    if (
      activityAction ===
      "crm_contact_updated"
    ) {
      activityTitle =
        `${updatedName} updated`;

      activityDescription =
        `${updatedName} CRM information was updated.`;
    }

    const {
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .insert({
        user_id:
          user.id,

        action:
          activityAction,

        entity_type:
          "crm_contact",

        entity_id:
          updatedContact.id,

        title:
          activityTitle,

        description:
          activityDescription,

        metadata: {
          contact_id:
            updatedContact.id,

          type:
            updatedContact.type,

          status:
            updatedContact.status,

          source:
            updatedContact.source,

          company:
            updatedContact.company,

          estimated_value:
            updatedContact.estimated_value,
        },
      });

    if (activityError) {
      console.error(
        "CRM update activity error:",
        activityError
      );
    }

    return NextResponse.json({
      success: true,

      message:
        body.action ===
        "contacted"
          ? "Contact marked as contacted."
          : "CRM contact updated successfully.",

      contact:
        updatedContact,
    });
  } catch (error) {
    console.error(
      "CRM PATCH API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not update the CRM contact.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
DELETE CONTACT
============================================================
*/

export async function DELETE(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

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
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: contact,
      error: contactError,
    } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      contactError ||
      !contact
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

    const {
      error: deleteError,
    } = await supabase
      .from("crm_contacts")
      .delete()
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      );

    if (deleteError) {
      console.error(
        "CRM delete error:",
        deleteError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not delete CRM contact.",
        },
        {
          status: 500,
        }
      );
    }

    const fullName =
      getFullName(contact);

    /*
    ============================================================
    ACTIVITY
    ============================================================
    */

    const {
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .insert({
        user_id:
          user.id,

        action:
          "crm_contact_deleted",

        entity_type:
          "crm_contact",

        entity_id:
          null,

        title:
          `${fullName} removed from CRM`,

        description:
          `${fullName} was deleted from the CRM workspace.`,

        metadata: {
          deleted_contact_id:
            contact.id,

          type:
            contact.type,

          status:
            contact.status,

          company:
            contact.company,

          estimated_value:
            contact.estimated_value,
        },
      });

    if (activityError) {
      console.error(
        "CRM delete activity error:",
        activityError
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "CRM contact deleted successfully.",
    });
  } catch (error) {
    console.error(
      "CRM DELETE API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not delete the CRM contact.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
HELPER
============================================================
*/

function getFullName(
  contact: {
    first_name?: string | null;
    last_name?: string | null;
  }
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