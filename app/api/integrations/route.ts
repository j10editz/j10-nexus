import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type IntegrationStatus =
  | "Connected"
  | "Disconnected"
  | "Error";

type CreateIntegrationRequest = {
  provider?: string;
  accountLabel?: string;
};

const SUPPORTED_INTEGRATIONS = [
  {
    provider: "whatsapp",
    name: "WhatsApp Business",
    category: "Messaging",
    description:
      "Connect WhatsApp Business for customer conversations, automation and AI responses.",
  },
  {
    provider: "email",
    name: "Email",
    category: "Communication",
    description:
      "Connect business email for inbox automation, responses and follow-ups.",
  },
  {
    provider: "crm",
    name: "CRM",
    category: "Sales",
    description:
      "Connect customer and lead data to J10 NEXUS workflows.",
  },
  {
    provider: "marketing",
    name: "Marketing Platform",
    category: "Marketing",
    description:
      "Connect advertising and campaign systems for marketing automation.",
  },
  {
    provider: "notifications",
    name: "Notification Service",
    category: "Communication",
    description:
      "Connect a provider for automated alerts and notifications.",
  },
  {
    provider: "google_calendar",
    name: "Google Calendar",
    category: "Productivity",
    description:
      "Connect calendars for appointments, reminders and scheduling workflows.",
  },
  {
    provider: "shopify",
    name: "Shopify",
    category: "Commerce",
    description:
      "Connect store products, customers and orders to J10 NEXUS.",
  },
  {
    provider: "stripe",
    name: "Stripe",
    category: "Payments",
    description:
      "Connect payment activity, customers and billing events.",
  },
] as const;

const VALID_PROVIDERS = new Set(
  SUPPORTED_INTEGRATIONS.map(
    (integration) =>
      integration.provider
  )
);

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
GET INTEGRATIONS
============================================================
*/

export async function GET() {
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
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: rows,
      error,
    } = await supabase
      .from("integrations")
      .select(
        `
        id,
        provider,
        status,
        account_label,
        external_account_id,
        metadata,
        connected_at,
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
          ascending: true,
        }
      );

    if (error) {
      console.error(
        "Integration list error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load integrations.",
        },
        {
          status: 500,
        }
      );
    }

    const savedIntegrations =
      rows ?? [];

    /*
     * Merge supported integrations
     * with the user's actual database state.
     */

    const integrations =
      SUPPORTED_INTEGRATIONS.map(
        (definition) => {
          const saved =
            savedIntegrations.find(
              (integration) =>
                integration.provider ===
                definition.provider
            );

          return {
            ...definition,

            id:
              saved?.id ??
              null,

            status:
              (saved?.status ??
                "Disconnected") as IntegrationStatus,

            accountLabel:
              saved?.account_label ??
              null,

            externalAccountId:
              saved?.external_account_id ??
              null,

            connectedAt:
              saved?.connected_at ??
              null,

            metadata:
              saved?.metadata ??
              {},

            registered:
              Boolean(saved),
          };
        }
      );

    const connected =
      integrations.filter(
        (integration) =>
          integration.status ===
          "Connected"
      ).length;

    const disconnected =
      integrations.filter(
        (integration) =>
          integration.status ===
          "Disconnected"
      ).length;

    const errors =
      integrations.filter(
        (integration) =>
          integration.status ===
          "Error"
      ).length;

    return NextResponse.json({
      success: true,

      integrations,

      summary: {
        total:
          integrations.length,

        connected,

        disconnected,

        errors,
      },
    });
  } catch (error) {
    console.error(
      "Integrations API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not load integrations.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
REGISTER INTEGRATION
============================================================
*/

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as CreateIntegrationRequest;

    const provider =
      typeof body.provider ===
      "string"
        ? body.provider
            .trim()
            .toLowerCase()
        : "";

    const accountLabel =
      typeof body.accountLabel ===
      "string"
        ? body.accountLabel.trim()
        : "";

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Integration provider is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !VALID_PROVIDERS.has(
        provider as
          | "whatsapp"
          | "email"
          | "crm"
          | "marketing"
          | "notifications"
          | "google_calendar"
          | "shopify"
          | "stripe"
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported integration provider.",
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
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * Check first so we never
     * accidentally overwrite an
     * already-connected integration.
     */

    const {
      data: existing,
      error:
        existingError,
    } = await supabase
      .from("integrations")
      .select("*")
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "provider",
        provider
      )
      .maybeSingle();

    if (existingError) {
      console.error(
        "Integration lookup error:",
        existingError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not check integration.",
        },
        {
          status: 500,
        }
      );
    }

    if (existing) {
      return NextResponse.json({
        success: true,

        message:
          "Integration is already registered.",

        integration:
          existing,
      });
    }

    /*
     * Registration does NOT mean
     * the provider is connected.
     *
     * Real OAuth/API connection
     * will change this later.
     */

    const {
      data: integration,
      error: createError,
    } = await supabase
      .from("integrations")
      .insert({
        user_id:
          user.id,

        provider,

        status:
          "Disconnected",

        account_label:
          accountLabel ||
          null,

        metadata: {},

        connected_at:
          null,
      })
      .select("*")
      .single();

    if (
      createError ||
      !integration
    ) {
      console.error(
        "Integration registration error:",
        createError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not register integration.",
        },
        {
          status: 500,
        }
      );
    }

    const definition =
      SUPPORTED_INTEGRATIONS.find(
        (item) =>
          item.provider ===
          provider
      );

    /*
     * Record activity.
     */

    const {
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .insert({
        user_id:
          user.id,

        action:
          "integration_registered",

        entity_type:
          "integration",

        entity_id:
          integration.id,

        title:
          `${definition?.name ?? provider} added`,

        description:
          `${definition?.name ?? provider} was added to the workspace and is awaiting connection.`,

        metadata: {
          provider,

          status:
            "Disconnected",
        },
      });

    if (activityError) {
      console.error(
        "Integration activity log error:",
        activityError
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "Integration registered successfully.",

      integration,
    });
  } catch (error) {
    console.error(
      "Integration POST error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not register the integration.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
REMOVE / DISCONNECT REGISTRY ENTRY
============================================================
*/

export async function DELETE(
  request: Request
) {
  try {
    const url =
      new URL(request.url);

    const provider =
      (
        url.searchParams.get(
          "provider"
        ) ?? ""
      )
        .trim()
        .toLowerCase();

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Integration provider is required.",
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
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: integration,
      error: lookupError,
    } = await supabase
      .from("integrations")
      .select("*")
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "provider",
        provider
      )
      .maybeSingle();

    if (lookupError) {
      console.error(
        "Integration delete lookup error:",
        lookupError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load integration.",
        },
        {
          status: 500,
        }
      );
    }

    if (!integration) {
      return NextResponse.json({
        success: true,

        message:
          "Integration is already disconnected.",
      });
    }

    const {
      error: deleteError,
    } = await supabase
      .from("integrations")
      .delete()
      .eq(
        "id",
        integration.id
      )
      .eq(
        "user_id",
        user.id
      );

    if (deleteError) {
      console.error(
        "Integration deletion error:",
        deleteError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not remove integration.",
        },
        {
          status: 500,
        }
      );
    }

    const definition =
      SUPPORTED_INTEGRATIONS.find(
        (item) =>
          item.provider ===
          provider
      );

    const {
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .insert({
        user_id:
          user.id,

        action:
          "integration_removed",

        entity_type:
          "integration",

        entity_id:
          null,

        title:
          `${definition?.name ?? provider} removed`,

        description:
          `${definition?.name ?? provider} was removed from the workspace.`,

        metadata: {
          provider,

          previous_status:
            integration.status,
        },
      });

    if (activityError) {
      console.error(
        "Integration removal activity error:",
        activityError
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "Integration removed successfully.",
    });
  } catch (error) {
    console.error(
      "Integration DELETE error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not remove the integration.",
      },
      {
        status: 500,
      }
    );
  }
}