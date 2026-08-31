import "server-only";

import {
  cookies,
} from "next/headers";

import {
  NextResponse,
} from "next/server";

import {
  createServerClient,
} from "@supabase/ssr";

import type {
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

import type {
  IntegrationConnection,
  IntegrationEnvironment,
  IntegrationProviderId,
} from "../../types/integration";

import {
  IntegrationRuntimeError,
} from "../../types/integration-runtime";

import {
  IntegrationDatabaseError,
} from "./database";

import {
  IntegrationCredentialError,
} from "./credentials";

import {
  getIntegrationProvider,
  isIntegrationProviderId,
} from "./registry";

type PublicConfigurationValue =
  | string
  | number
  | boolean
  | null;

export class IntegrationApiValidationError extends Error {
  readonly code:
    string;

  constructor(
    message:
      string,

    code =
      "INTEGRATION_API_VALIDATION_ERROR",
  ) {
    super(message);

    this.name =
      "IntegrationApiValidationError";

    this.code =
      code;
  }
}

export async function createIntegrationApiClient():
  Promise<SupabaseClient> {
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
          return cookieStore
            .getAll();
        },

        setAll(
          cookiesToSet,
        ) {
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
                  options,
                );
              },
            );
          } catch {
            /*
             * Cookie mutation may be unavailable
             * in some server-only contexts.
             */
          }
        },
      },
    },
  );
}

export async function getAuthenticatedIntegrationUser(
  supabase:
    SupabaseClient,
): Promise<User | null> {
  const {
    data: {
      user,
    },

    error,
  } =
    await supabase.auth
      .getUser();

  if (
    error ||
    !user
  ) {
    return null;
  }

  return user;
}

export function parseRequestObject(
  value:
    unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw new IntegrationApiValidationError(
      "Request body must be a JSON object.",
    );
  }

  return value as
    Record<string, unknown>;
}

export function normalizeRequestedProviderId(
  value:
    unknown,
): IntegrationProviderId | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  switch (normalized) {
    case "email":
      return "gmail";

    case "google_calendar":
      return "google-calendar";

    case "whatsapp":
      return "whatsapp-business";

    default:
      return isIntegrationProviderId(
        normalized,
      )
        ? normalized
        : null;
  }
}

export function parseIntegrationEnvironment(
  value:
    unknown,
): IntegrationEnvironment {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "development";
  }

  if (
    value === "development" ||
    value === "sandbox" ||
    value === "production"
  ) {
    return value;
  }

  throw new IntegrationApiValidationError(
    "Invalid integration environment.",
    "INVALID_INTEGRATION_ENVIRONMENT",
  );
}

export function parseEnabledCapabilities(
  value:
    unknown,
): string[] {
  if (
    value === undefined ||
    value === null
  ) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new IntegrationApiValidationError(
      "Enabled capabilities must be an array.",
      "INVALID_ENABLED_CAPABILITIES",
    );
  }

  const capabilities =
    value.map(
      (item) => {
        if (
          typeof item !==
            "string" ||
          !item.trim()
        ) {
          throw new IntegrationApiValidationError(
            "Every enabled capability must be a non-empty string.",
            "INVALID_ENABLED_CAPABILITY",
          );
        }

        return item.trim();
      },
    );

  return [
    ...new Set(
      capabilities,
    ),
  ];
}

export function parsePublicConfiguration(
  value:
    unknown,
): Record<
  string,
  PublicConfigurationValue
> {
  if (
    value === undefined ||
    value === null
  ) {
    return {};
  }

  if (
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw new IntegrationApiValidationError(
      "Public configuration must be a JSON object.",
      "INVALID_PUBLIC_CONFIGURATION",
    );
  }

  const configuration:
    Record<
      string,
      PublicConfigurationValue
    > = {};

  for (
    const [key, item]
    of Object.entries(
      value as
        Record<string, unknown>,
    )
  ) {
    if (!key.trim()) {
      throw new IntegrationApiValidationError(
        "Public configuration keys cannot be empty.",
        "INVALID_PUBLIC_CONFIGURATION_KEY",
      );
    }

    if (
      typeof item !==
        "string" &&
      typeof item !==
        "number" &&
      typeof item !==
        "boolean" &&
      item !== null
    ) {
      throw new IntegrationApiValidationError(
        `Public configuration value for ${key} is invalid.`,
        "INVALID_PUBLIC_CONFIGURATION_VALUE",
      );
    }

    configuration[key] =
      item;
  }

  return configuration;
}

export function validateProviderPublicConfiguration(
  providerId:
    IntegrationProviderId,

  configuration:
    Readonly<
      Record<
        string,
        PublicConfigurationValue
      >
    >,
): void {
  const provider =
    getIntegrationProvider(
      providerId,
    );

  const allowedFields =
    new Set(
      provider.auth
        .setupFields
        .filter(
          (field) =>
            field.storage ===
            "connection",
        )
        .map(
          (field) =>
            field.key,
        ),
    );

  const unsupportedField =
    Object.keys(
      configuration,
    ).find(
      (key) =>
        !allowedFields.has(
          key,
        ),
    );

  if (unsupportedField) {
    throw new IntegrationApiValidationError(
      `Unsupported public configuration field for ${provider.name}: ${unsupportedField}`,
      "UNSUPPORTED_PUBLIC_CONFIGURATION_FIELD",
    );
  }

  const missingRequiredField =
    provider.auth.setupFields
      .filter(
        (field) =>
          field.storage === "connection" &&
          field.required,
      )
      .find((field) => {
        const value =
          configuration[field.key];

        return (
          value === undefined ||
          value === null ||
          (typeof value === "string" &&
            !value.trim())
        );
      });

  if (missingRequiredField) {
    throw new IntegrationApiValidationError(
      `${missingRequiredField.label} is required.`,
      "REQUIRED_PUBLIC_CONFIGURATION_MISSING",
    );
  }

  if (providerId === "whatsapp-business") {
    const phoneNumberId =
      configuration.phone_number_id;

    const businessAccountId =
      configuration.business_account_id;

    if (
      typeof phoneNumberId !== "string" ||
      !/^\d{5,32}$/.test(
        phoneNumberId.trim(),
      )
    ) {
      throw new IntegrationApiValidationError(
        "WhatsApp Phone Number ID must be the numeric ID from Meta API Setup.",
        "INVALID_WHATSAPP_PHONE_NUMBER_ID",
      );
    }

    if (
      typeof businessAccountId !== "string" ||
      !/^\d{5,32}$/.test(
        businessAccountId.trim(),
      )
    ) {
      throw new IntegrationApiValidationError(
        "WhatsApp Business Account ID must be the numeric WABA ID from Meta API Setup, not an email address or App ID.",
        "INVALID_WHATSAPP_BUSINESS_ACCOUNT_ID",
      );
    }

    if (
      phoneNumberId.trim() ===
      businessAccountId.trim()
    ) {
      throw new IntegrationApiValidationError(
        "Phone Number ID and WhatsApp Business Account ID must be different Meta identifiers.",
        "DUPLICATE_WHATSAPP_IDENTIFIERS",
      );
    }
  }
}

export function serializeIntegrationConnection(
  connection:
    IntegrationConnection,
) {
  return {
    id:
      connection.id,

    providerId:
      connection.providerId,

    provider:
      connection.providerId,

    name:
      connection.name,

    status:
      connection.status,

    environment:
      connection.environment,

    externalAccountId:
      connection.externalAccountId,

    externalAccountLabel:
      connection.externalAccountLabel,

    grantedScopes:
      connection.grantedScopes,

    enabledCapabilities:
      connection.enabledCapabilities,

    publicConfiguration:
      connection.publicConfiguration,

    hasCredentials:
      Boolean(
        connection
          .credentialReference,
      ),

    lastConnectedAt:
      connection.lastConnectedAt,

    lastHealthCheckAt:
      connection.lastHealthCheckAt,

    lastErrorCode:
      connection.lastErrorCode,

    lastErrorMessage:
      connection.lastErrorMessage,

    createdAt:
      connection.createdAt,

    updatedAt:
      connection.updatedAt,
  };
}

export async function writeIntegrationActivity(
  supabase:
    SupabaseClient,

  input: {
    userId:
      string;

    action:
      string;

    entityId:
      string | null;

    title:
      string;

    description:
      string;

    metadata?:
      Readonly<
        Record<string, unknown>
      >;
  },
): Promise<void> {
  const {
    error,
  } = await supabase
    .from("activity_logs")
    .insert({
      user_id:
        input.userId,

      action:
        input.action,

      entity_type:
        "integration",

      entity_id:
        input.entityId,

      title:
        input.title,

      description:
        input.description,

      metadata:
        input.metadata ??
        {},
    });

  if (error) {
    console.error(
      "Integration activity log error:",

      error,
    );
  }
}

export function integrationApiErrorResponse(
  error:
    unknown,

  fallbackMessage:
    string,
) {
  if (
    error instanceof
    SyntaxError
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          "Request body contains invalid JSON.",
      },

      {
        status:
          400,
      },
    );
  }

  if (
    error instanceof
    IntegrationApiValidationError
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          error.message,

        code:
          error.code,
      },

      {
        status:
          400,
      },
    );
  }

  if (
    error instanceof
    IntegrationDatabaseError
  ) {
    const status =
      error.code ===
      "INTEGRATION_NOT_FOUND"
        ? 404
        : error.code ===
            "INTEGRATION_ALREADY_EXISTS"
          ? 409
          : error.code ===
                "INVALID_INTEGRATION_STATUS_TRANSITION" ||
              error.code ===
                "UNSUPPORTED_INTEGRATION_CAPABILITY" ||
              error.code ===
                "UNSUPPORTED_INTEGRATION_PROVIDER"
            ? 400
            : 500;

    if (status === 500) {
      console.error(
        fallbackMessage,

        error,
      );
    }

    return NextResponse.json(
      {
        success:
          false,

        error:
          status === 500
            ? fallbackMessage
            : error.message,

        code:
          error.code,
      },

      {
        status,
      },
    );
  }

  if (
    error instanceof
    IntegrationCredentialError
  ) {
    const clientErrorCodes =
      new Set([
        "INTEGRATION_NOT_FOUND",
        "INVALID_INTEGRATION_CREDENTIAL_VALUES",
        "UNSUPPORTED_OAUTH_CREDENTIAL_FIELD",
        "OAUTH_ACCESS_TOKEN_REQUIRED",
        "UNSUPPORTED_INTEGRATION_CREDENTIAL_FIELD",
        "REQUIRED_INTEGRATION_CREDENTIAL_MISSING",
      ]);

    const status =
      error.code ===
      "INTEGRATION_NOT_FOUND"
        ? 404
        : clientErrorCodes.has(
              error.code,
            )
          ? 400
          : 500;

    if (status === 500) {
      console.error(
        fallbackMessage,

        error,
      );
    }

    return NextResponse.json(
      {
        success:
          false,

        error:
          status === 500
            ? fallbackMessage
            : error.message,

        code:
          error.code,
      },

      {
        status,
      },
    );
  }

  if (
    error instanceof
    IntegrationRuntimeError
  ) {
    const status =
      Number.isInteger(
        error.status,
      ) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;

    if (status >= 500) {
      console.error(
        fallbackMessage,

        error,
      );
    }

    return NextResponse.json(
      {
        success:
          false,

        error:
          error.message,

        code:
          error.code,

        retryable:
          error.retryable,

        retryAfterSeconds:
          error.retryAfterSeconds,
      },

      {
        status,

        headers:
          error.retryAfterSeconds !== null
            ? {
                "Retry-After":
                  String(
                    error.retryAfterSeconds,
                  ),
              }
            : undefined,
      },
    );
  }

  console.error(
    fallbackMessage,

    error,
  );

  return NextResponse.json(
    {
      success:
        false,

      error:
        fallbackMessage,
    },

    {
      status:
        500,
    },
  );
}
