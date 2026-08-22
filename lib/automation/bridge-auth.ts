import "server-only";

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  cookies,
} from "next/headers";

import {
  createServerClient,
} from "@supabase/ssr";

import {
  createClient,
} from "@supabase/supabase-js";

import type {
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

const AUTOMATION_BRIDGE_COOKIE =
  "j10_automation_bridge";

const AUTOMATION_BRIDGE_VERSION =
  1 as const;

const AUTOMATION_BRIDGE_TTL_MS =
  10 * 60 * 1000;

const AUTOMATION_BRIDGE_FUTURE_SKEW_MS =
  30 * 1000;

type AutomationBridgePayload = {
  version: typeof AUTOMATION_BRIDGE_VERSION;
  userId: string;
  automationId: string;
  eventId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export type AutomationBridgeIdentity = {
  userId: string;
  automationId: string;
  eventId: string;
  issuedAt: number;
  expiresAt: number;
};

export type AutomationRequestActor = {
  supabase: SupabaseClient;
  user: User | null;
  error: unknown;
  bridge: AutomationBridgeIdentity | null;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function requireServerSecret() {
  const source =
    process.env
      .J10_INTEGRATION_ENCRYPTION_KEY
      ?.trim();

  if (!source) {
    throw new Error(
      "J10_INTEGRATION_ENCRYPTION_KEY is required for the automation bridge.",
    );
  }

  return createHash("sha256")
    .update(
      [
        "j10-nexus",
        "day14j",
        "automation-bridge",
        source,
      ].join(":"),
      "utf8",
    )
    .digest();
}

function encodePayload(
  payload: AutomationBridgePayload,
) {
  return Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
}

function signPayload(
  encodedPayload: string,
) {
  return createHmac(
    "sha256",
    requireServerSecret(),
  )
    .update(
      encodedPayload,
      "utf8",
    )
    .digest("base64url");
}

function safeSignatureMatch(
  actual: string,
  expected: string,
) {
  try {
    const actualBuffer =
      Buffer.from(
        actual,
        "base64url",
      );

    const expectedBuffer =
      Buffer.from(
        expected,
        "base64url",
      );

    return (
      actualBuffer.length ===
        expectedBuffer.length &&
      timingSafeEqual(
        actualBuffer,
        expectedBuffer,
      )
    );
  } catch {
    return false;
  }
}

function parseCookieHeader(
  cookieHeader: string,
) {
  const values =
    new Map<string, string>();

  for (
    const segment of
      cookieHeader.split(";")
  ) {
    const separator =
      segment.indexOf("=");

    if (separator < 1) {
      continue;
    }

    const name =
      segment
        .slice(0, separator)
        .trim();

    const rawValue =
      segment
        .slice(separator + 1)
        .trim();

    if (!name) {
      continue;
    }

    try {
      values.set(
        name,
        decodeURIComponent(
          rawValue,
        ),
      );
    } catch {
      values.set(
        name,
        rawValue,
      );
    }
  }

  return values;
}

function parseBridgeToken(
  token: string,
): AutomationBridgeIdentity | null {
  const separator =
    token.lastIndexOf(".");

  if (
    separator < 1 ||
    separator ===
      token.length - 1
  ) {
    return null;
  }

  const encodedPayload =
    token.slice(
      0,
      separator,
    );

  const suppliedSignature =
    token.slice(
      separator + 1,
    );

  let expectedSignature:
    string;

  try {
    expectedSignature =
      signPayload(
        encodedPayload,
      );
  } catch {
    return null;
  }

  if (
    !safeSignatureMatch(
      suppliedSignature,
      expectedSignature,
    )
  ) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(
        Buffer.from(
          encodedPayload,
          "base64url",
        ).toString("utf8"),
      ) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const version =
    Number(parsed.version);

  const userId =
    typeof parsed.userId ===
      "string"
      ? parsed.userId.trim()
      : "";

  const automationId =
    typeof parsed.automationId ===
      "string"
      ? parsed.automationId.trim()
      : "";

  const eventId =
    typeof parsed.eventId ===
      "string"
      ? parsed.eventId.trim()
      : "";

  const issuedAt =
    Number(parsed.issuedAt);

  const expiresAt =
    Number(parsed.expiresAt);

  const nonce =
    typeof parsed.nonce ===
      "string"
      ? parsed.nonce.trim()
      : "";

  if (
    version !==
      AUTOMATION_BRIDGE_VERSION ||
    !userId ||
    !automationId ||
    !eventId ||
    !nonce ||
    !Number.isFinite(
      issuedAt,
    ) ||
    !Number.isFinite(
      expiresAt,
    )
  ) {
    return null;
  }

  const now =
    Date.now();

  if (
    issuedAt >
      now +
        AUTOMATION_BRIDGE_FUTURE_SKEW_MS ||
    expiresAt <= now ||
    expiresAt - issuedAt >
      AUTOMATION_BRIDGE_TTL_MS
  ) {
    return null;
  }

  return {
    userId,
    automationId,
    eventId,
    issuedAt,
    expiresAt,
  };
}

function createAutomationBridgeToken(
  userId: string,
  automationId: string,
  eventId: string,
) {
  const issuedAt =
    Date.now();

  const payload:
    AutomationBridgePayload = {
      version:
        AUTOMATION_BRIDGE_VERSION,

      userId:
        userId.trim(),

      automationId:
        automationId.trim(),

      eventId:
        eventId.trim(),

      issuedAt,

      expiresAt:
        issuedAt +
        AUTOMATION_BRIDGE_TTL_MS,

      nonce:
        randomUUID(),
    };

  if (
    !payload.userId ||
    !payload.automationId ||
    !payload.eventId
  ) {
    throw new Error(
      "J10 could not create an incomplete automation bridge identity.",
    );
  }

  const encodedPayload =
    encodePayload(
      payload,
    );

  const signature =
    signPayload(
      encodedPayload,
    );

  return [
    encodedPayload,
    signature,
  ].join(".");
}

export function createAutomationBridgeCookieHeader(
  userId: string,
  automationId: string,
  eventId: string,
) {
  const token =
    createAutomationBridgeToken(
      userId,
      automationId,
      eventId,
    );

  return [
    AUTOMATION_BRIDGE_COOKIE,
    encodeURIComponent(token),
  ].join("=");
}

export function readAutomationBridgeIdentity(
  request: Request,
): AutomationBridgeIdentity | null {
  const cookieHeader =
    request.headers.get(
      "cookie",
    ) ?? "";

  if (!cookieHeader) {
    return null;
  }

  const token =
    parseCookieHeader(
      cookieHeader,
    ).get(
      AUTOMATION_BRIDGE_COOKIE,
    );

  return token
    ? parseBridgeToken(
        token,
      )
    : null;
}

export function hasAutomationBridgeCookie(
  cookieHeader: string,
) {
  if (!cookieHeader) {
    return false;
  }

  const token =
    parseCookieHeader(
      cookieHeader,
    ).get(
      AUTOMATION_BRIDGE_COOKIE,
    );

  return Boolean(
    token &&
    parseBridgeToken(
      token,
    ),
  );
}

export function createAutomationBridgeServiceClient() {
  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL
      ?.trim();

  const secretKey =
    (
      process.env
        .SUPABASE_SECRET_KEY ??
      process.env
        .SUPABASE_SERVICE_ROLE_KEY
    )?.trim();

  if (
    !supabaseUrl ||
    !secretKey
  ) {
    throw new Error(
      "J10 automation bridge service credentials are not configured.",
    );
  }

  return createClient(
    supabaseUrl,
    secretKey,
    {
      auth: {
        autoRefreshToken:
          false,

        persistSession:
          false,

        detectSessionInUrl:
          false,
      },
    },
  );
}

async function createCookieUserClient() {
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
            Cookie mutation is unavailable in some
            server-side route execution contexts.
            */
          }
        },
      },
    },
  );
}

export async function resolveAutomationRequestActor(
  request: Request,
  options?: {
    expectedAutomationId?: string | null;
  },
): Promise<AutomationRequestActor> {
  const bridge =
    readAutomationBridgeIdentity(
      request,
    );

  const expectedAutomationId =
    options
      ?.expectedAutomationId
      ?.trim() ||
    null;

  if (
    bridge &&
    (
      !expectedAutomationId ||
      bridge.automationId ===
        expectedAutomationId
    )
  ) {
    try {
      const supabase =
        createAutomationBridgeServiceClient();

      const {
        data,
        error,
      } =
        await supabase.auth.admin
          .getUserById(
            bridge.userId,
          );

      return {
        supabase,
        user:
          data.user ?? null,
        error,
        bridge,
      };
    } catch (error) {
      const supabase =
        createAutomationBridgeServiceClient();

      return {
        supabase,
        user:
          null,
        error,
        bridge,
      };
    }
  }

  const supabase =
    await createCookieUserClient();

  const {
    data: {
      user,
    },
    error,
  } =
    await supabase.auth.getUser();

  return {
    supabase,
    user,
    error,
    bridge:
      null,
  };
}