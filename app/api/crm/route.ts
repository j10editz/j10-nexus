import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import {
  dispatchAutomationEvent,
} from "@/lib/automation/event-trigger-engine";

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

type CreateContactRequest = {
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
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
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
            // Cookie writes may not be
            // available in every server context.
          }
        },
      },
    }
  );
}

/*
============================================================
GET CRM CONTACTS
============================================================
*/

export async function GET(
  request: Request
) {
  try {
    const supabase =
      await getSupabase();

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

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
        "CRM contacts load error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load CRM contacts.",
        },
        {
          status: 500,
        }
      );
    }

    let contacts =
      (data ?? []) as CRMContact[];

    /*
    ============================================================
    OPTIONAL FILTERS
    ============================================================
    */

    const url =
      new URL(request.url);

    const search =
      (
        url.searchParams.get(
          "search"
        ) ?? ""
      )
        .trim()
        .toLowerCase();

    const status =
      (
        url.searchParams.get(
          "status"
        ) ?? ""
      ).trim();

    const type =
      (
        url.searchParams.get(
          "type"
        ) ?? ""
      ).trim();

    if (search) {
      contacts =
        contacts.filter(
          (contact) => {
            const searchable =
              [
                contact.first_name,
                contact.last_name,
                contact.email,
                contact.phone,
                contact.company,
                contact.job_title,
                contact.source,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchable.includes(
              search
            );
          }
        );
    }

    if (
      status &&
      VALID_STATUSES.includes(
        status as ContactStatus
      )
    ) {
      contacts =
        contacts.filter(
          (contact) =>
            contact.status ===
            status
        );
    }

    if (
      type &&
      VALID_TYPES.includes(
        type as ContactType
      )
    ) {
      contacts =
        contacts.filter(
          (contact) =>
            contact.type === type
        );
    }

    /*
    ============================================================
    CRM SUMMARY
    ============================================================
    */

    const allContacts =
      (data ?? []) as CRMContact[];

    const total =
      allContacts.length;

    const leads =
      allContacts.filter(
        (contact) =>
          contact.type === "Lead"
      ).length;

    const prospects =
      allContacts.filter(
        (contact) =>
          contact.type ===
          "Prospect"
      ).length;

    const customers =
      allContacts.filter(
        (contact) =>
          contact.type ===
          "Customer"
      ).length;

    const newContacts =
      allContacts.filter(
        (contact) =>
          contact.status ===
          "New"
      ).length;

    const qualified =
      allContacts.filter(
        (contact) =>
          contact.status ===
          "Qualified"
      ).length;

    const won =
      allContacts.filter(
        (contact) =>
          contact.status ===
          "Won"
      ).length;

    const lost =
      allContacts.filter(
        (contact) =>
          contact.status ===
          "Lost"
      ).length;

    const pipelineValue =
      allContacts
        .filter(
          (contact) =>
            contact.status !==
              "Lost" &&
            contact.status !==
              "Won"
        )
        .reduce(
          (
            totalValue,
            contact
          ) =>
            totalValue +
            Number(
              contact.estimated_value ??
                0
            ),
          0
        );

    const wonValue =
      allContacts
        .filter(
          (contact) =>
            contact.status ===
            "Won"
        )
        .reduce(
          (
            totalValue,
            contact
          ) =>
            totalValue +
            Number(
              contact.estimated_value ??
                0
            ),
          0
        );

    return NextResponse.json({
      success: true,

      contacts,

      summary: {
        total,
        leads,
        prospects,
        customers,
        new: newContacts,
        qualified,
        won,
        lost,
        pipelineValue,
        wonValue,
      },
    });
  } catch (error) {
    console.error(
      "CRM GET API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not load CRM data.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
CREATE CRM CONTACT
============================================================
*/

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as CreateContactRequest;

    const firstName =
      typeof body.firstName ===
      "string"
        ? body.firstName.trim()
        : "";

    const lastName =
      typeof body.lastName ===
      "string"
        ? body.lastName.trim()
        : "";

    const email =
      typeof body.email ===
      "string"
        ? body.email
            .trim()
            .toLowerCase()
        : "";

    const phone =
      typeof body.phone ===
      "string"
        ? body.phone.trim()
        : "";

    const company =
      typeof body.company ===
      "string"
        ? body.company.trim()
        : "";

    const jobTitle =
      typeof body.jobTitle ===
      "string"
        ? body.jobTitle.trim()
        : "";

    const notes =
      typeof body.notes ===
      "string"
        ? body.notes.trim()
        : "";

    const source =
      typeof body.source ===
        "string" &&
      body.source.trim()
        ? body.source.trim()
        : "Manual";

    const type: ContactType =
      body.type &&
      VALID_TYPES.includes(
        body.type
      )
        ? body.type
        : "Lead";

    const status: ContactStatus =
      body.status &&
      VALID_STATUSES.includes(
        body.status
      )
        ? body.status
        : "New";

    const estimatedValue =
      typeof body.estimatedValue ===
        "number" &&
      Number.isFinite(
        body.estimatedValue
      ) &&
      body.estimatedValue >= 0
        ? body.estimatedValue
        : 0;

    if (!firstName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "First name is required.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      await getSupabase();

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

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

    /*
    ============================================================
    CREATE CONTACT
    ============================================================
    */

    const {
      data: contact,
      error: createError,
    } = await supabase
      .from("crm_contacts")
      .insert({
        user_id:
          user.id,

        first_name:
          firstName,

        last_name:
          lastName || null,

        email:
          email || null,

        phone:
          phone || null,

        company:
          company || null,

        job_title:
          jobTitle || null,

        type,

        status,

        source,

        estimated_value:
          estimatedValue,

        notes:
          notes || null,

        last_contacted_at:
          null,
      })
      .select("*")
      .single();

    if (
      createError ||
      !contact
    ) {
      console.error(
        "CRM contact creation error:",
        createError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not create CRM contact.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    ============================================================
    ACTIVITY LOG
    ============================================================
    */

    const fullName =
      [
        contact.first_name,
        contact.last_name,
      ]
        .filter(Boolean)
        .join(" ");

    const {
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .insert({
        user_id:
          user.id,

        action:
          "crm_contact_created",

        entity_type:
          "crm_contact",

        entity_id:
          contact.id,

        title:
          `${fullName} added to CRM`,

        description:
          `${fullName} was added as a ${contact.type.toLowerCase()}.`,

        metadata: {
          contact_id:
            contact.id,

          type:
            contact.type,

          status:
            contact.status,

          source:
            contact.source,

          company:
            contact.company,

          estimated_value:
            contact.estimated_value,
        },
      });

    if (activityError) {
      console.error(
        "CRM activity log error:",
        activityError
      );
    }

    /*
    ============================================================
    NEW CRM CONTACT AUTOMATION EVENT
    ============================================================
    */

    const automationEvent =
      await dispatchAutomationEvent({
        supabase,

        userId:
          user.id,

        origin:
          new URL(
            request.url
          ).origin,

        cookieHeader:
          request.headers.get(
            "cookie"
          ) ?? "",

        triggerType:
          "new_crm_contact",

        payload: {
          contact: {
            id:
              contact.id,

            firstName:
              contact.first_name,

            lastName:
              contact.last_name,

            email:
              contact.email,

            phone:
              contact.phone,

            company:
              contact.company,

            jobTitle:
              contact.job_title,

            type:
              contact.type,

            status:
              contact.status,

            source:
              contact.source,

            estimatedValue:
              contact.estimated_value,

            createdAt:
              contact.created_at,
          },
        },
      });

    return NextResponse.json(
      {
        success: true,

        message:
          "CRM contact created successfully.",

        contact,

        automationEvent,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "CRM POST API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not create the CRM contact.",
      },
      {
        status: 500,
      }
    );
  }
}