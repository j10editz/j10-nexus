import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import {
  isIntegrationProviderId,
} from "@/lib/integrations/registry";

import {
  INTEGRATION_OAUTH_COOKIE_NAME,
  INTEGRATION_OAUTH_COOKIE_PATH,
  INTEGRATION_OAUTH_TRANSACTION_SCHEMA_VERSION,
  INTEGRATION_OAUTH_TRANSACTION_TTL_SECONDS,
} from "@/types/integration-oauth";

import type {
  IntegrationOAuthCookieDefinition,
  IntegrationOAuthTransaction,
  IntegrationOAuthTransactionInput,
} from "@/types/integration-oauth";

import {
  IntegrationOAuthError,
  isIntegrationOAuthError,
} from "./errors";

import {
  isValidIntegrationOAuthCodeVerifier,
  isValidIntegrationOAuthState,
  safelyCompareIntegrationOAuthValues,
} from "./pkce";

const OAUTH_STATE_ALGORITHM =
  "aes-256-gcm";

const OAUTH_STATE_IV_BYTES =
  12;

const OAUTH_STATE_AUTH_TAG_BYTES =
  16;

const OAUTH_STATE_CLOCK_SKEW_SECONDS =
  60;

const MAX_OAUTH_COOKIE_BYTES =
  4096;

const MAX_RETURN_TO_LENGTH =
  1000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BASE64_URL_PATTERN =
  /^[A-Za-z0-9_-]+$/;

const OAUTH_STATE_KEY_SALT =
  Buffer.from(
    "j10-nexus.oauth-state.salt.v1",
    "utf8",
  );

const OAUTH_STATE_KEY_CONTEXT =
  Buffer.from(
    "j10-nexus.integration.oauth-state.v1",
    "utf8",
  );

const OAUTH_STATE_ADDITIONAL_DATA =
  Buffer.from(
    INTEGRATION_OAUTH_TRANSACTION_SCHEMA_VERSION,
    "utf8",
  );

function createOAuthError(
  code:
    | "INTEGRATION_OAUTH_INVALID_TRANSACTION"
    | "INTEGRATION_OAUTH_EXPIRED_TRANSACTION"
    | "INTEGRATION_OAUTH_STATE_MISMATCH"
    | "INTEGRATION_OAUTH_INVALID_RETURN_TO"
    | "INTEGRATION_OAUTH_INVALID_PKCE",
  message: string,
  details?: Readonly<Record<string, unknown>>,
): IntegrationOAuthError {
  return new IntegrationOAuthError(
    code,
    message,
    400,
    details,
  );
}

function getIntegrationEncryptionMasterKey():
  Buffer {
  const encodedKey =
    process.env
      .J10_INTEGRATION_ENCRYPTION_KEY
      ?.trim();

  if (!encodedKey) {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_CONFIGURATION_ERROR",
      "J10 integration encryption is not configured.",
      500,
    );
  }

  let key: Buffer;

  try {
    key =
      Buffer.from(
        encodedKey,
        "base64",
      );
  }
  catch {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_CONFIGURATION_ERROR",
      "J10 integration encryption configuration is invalid.",
      500,
    );
  }

  if (
    key.length !== 32
  ) {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_CONFIGURATION_ERROR",
      "J10 integration encryption must use a 256-bit key.",
      500,
    );
  }

  return key;
}

function deriveIntegrationOAuthStateKey():
  Buffer {
  const masterKey =
    getIntegrationEncryptionMasterKey();

  return Buffer.from(
    hkdfSync(
      "sha256",
      masterKey,
      OAUTH_STATE_KEY_SALT,
      OAUTH_STATE_KEY_CONTEXT,
      32,
    ),
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

function assertUuid(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (
    typeof value !==
      "string" ||
    !UUID_PATTERN.test(
      value,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction is invalid.",
      {
        field:
          fieldName,
      },
    );
  }
}

export function normalizeIntegrationOAuthReturnTo(
  value?: string,
): string {
  const returnTo =
    value?.trim() ||
    "/dashboard/settings/integrations";

  if (
    returnTo.length >
      MAX_RETURN_TO_LENGTH ||
    !returnTo.startsWith(
      "/",
    ) ||
    returnTo.startsWith(
      "//",
    ) ||
    returnTo.includes(
      "\\",
    ) ||
    /[\u0000-\u001f\u007f]/.test(
      returnTo,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_RETURN_TO",
      "The OAuth return destination must be an internal J10 path.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl =
      new URL(
        returnTo,
        "https://j10.local",
      );
  }
  catch {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_RETURN_TO",
      "The OAuth return destination is invalid.",
    );
  }

  if (
    parsedUrl.origin !==
    "https://j10.local"
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_RETURN_TO",
      "The OAuth return destination must remain inside J10.",
    );
  }

  return [
    parsedUrl.pathname,
    parsedUrl.search,
    parsedUrl.hash,
  ].join(
    "",
  );
}

function validateOAuthTransaction(
  value: unknown,
  nowSeconds: number,
): IntegrationOAuthTransaction {
  if (
    !isRecord(
      value,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction is invalid.",
    );
  }

  if (
    value.schemaVersion !==
    INTEGRATION_OAUTH_TRANSACTION_SCHEMA_VERSION
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction schema is unsupported.",
    );
  }

  assertUuid(
    value.userId,
    "userId",
  );

  assertUuid(
    value.connectionId,
    "connectionId",
  );

  if (
    typeof value.providerId !==
      "string" ||
    !isIntegrationProviderId(
      value.providerId,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth provider is invalid.",
    );
  }

  if (
    typeof value.state !==
      "string" ||
    !isValidIntegrationOAuthState(
      value.state,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth state is invalid.",
    );
  }

  if (
    typeof value.codeVerifier !==
      "string" ||
    !isValidIntegrationOAuthCodeVerifier(
      value.codeVerifier,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_PKCE",
      "The OAuth PKCE verifier is invalid.",
    );
  }

  if (
    typeof value.returnTo !==
      "string"
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_RETURN_TO",
      "The OAuth return destination is invalid.",
    );
  }

  const returnTo =
    normalizeIntegrationOAuthReturnTo(
      value.returnTo,
    );

  if (
    typeof value.issuedAt !==
      "number" ||
    !Number.isInteger(
      value.issuedAt,
    ) ||
    typeof value.expiresAt !==
      "number" ||
    !Number.isInteger(
      value.expiresAt,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction timing is invalid.",
    );
  }

  const transactionLifetime =
    value.expiresAt -
    value.issuedAt;

  if (
    value.issuedAt <= 0 ||
    value.expiresAt <=
      value.issuedAt ||
    transactionLifetime >
      INTEGRATION_OAUTH_TRANSACTION_TTL_SECONDS +
        OAUTH_STATE_CLOCK_SKEW_SECONDS ||
    value.issuedAt >
      nowSeconds +
        OAUTH_STATE_CLOCK_SKEW_SECONDS
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction timing is invalid.",
    );
  }

  if (
    value.expiresAt <=
    nowSeconds
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_EXPIRED_TRANSACTION",
      "The OAuth authorization attempt expired. Start the connection again.",
    );
  }

  return {
    schemaVersion:
      INTEGRATION_OAUTH_TRANSACTION_SCHEMA_VERSION,
    userId:
      value.userId,
    connectionId:
      value.connectionId,
    providerId:
      value.providerId,
    state:
      value.state,
    codeVerifier:
      value.codeVerifier,
    returnTo,
    issuedAt:
      value.issuedAt,
    expiresAt:
      value.expiresAt,
  };
}

export function createIntegrationOAuthTransaction(
  input: IntegrationOAuthTransactionInput,
): IntegrationOAuthTransaction {
  assertUuid(
    input.userId,
    "userId",
  );

  assertUuid(
    input.connectionId,
    "connectionId",
  );

  if (
    !isValidIntegrationOAuthState(
      input.state,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The generated OAuth state is invalid.",
    );
  }

  if (
    !isValidIntegrationOAuthCodeVerifier(
      input.codeVerifier,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_PKCE",
      "The generated OAuth PKCE verifier is invalid.",
    );
  }

  const issuedAt =
    Math.floor(
      Date.now() /
      1000,
    );

  return {
    schemaVersion:
      INTEGRATION_OAUTH_TRANSACTION_SCHEMA_VERSION,
    userId:
      input.userId,
    connectionId:
      input.connectionId,
    providerId:
      input.providerId,
    state:
      input.state,
    codeVerifier:
      input.codeVerifier,
    returnTo:
      normalizeIntegrationOAuthReturnTo(
        input.returnTo,
      ),
    issuedAt,
    expiresAt:
      issuedAt +
      INTEGRATION_OAUTH_TRANSACTION_TTL_SECONDS,
  };
}

export function sealIntegrationOAuthTransaction(
  transaction: IntegrationOAuthTransaction,
): string {
  const nowSeconds =
    Math.floor(
      Date.now() /
      1000,
    );

  const validatedTransaction =
    validateOAuthTransaction(
      transaction,
      nowSeconds,
    );

  const key =
    deriveIntegrationOAuthStateKey();

  const initializationVector =
    randomBytes(
      OAUTH_STATE_IV_BYTES,
    );

  const cipher =
    createCipheriv(
      OAUTH_STATE_ALGORITHM,
      key,
      initializationVector,
    );

  cipher.setAAD(
    OAUTH_STATE_ADDITIONAL_DATA,
  );

  const encryptedPayload =
    Buffer.concat(
      [
        cipher.update(
          JSON.stringify(
            validatedTransaction,
          ),
          "utf8",
        ),
        cipher.final(),
      ],
    );

  const authenticationTag =
    cipher.getAuthTag();

  const sealedValue =
    [
      initializationVector.toString(
        "base64url",
      ),
      authenticationTag.toString(
        "base64url",
      ),
      encryptedPayload.toString(
        "base64url",
      ),
    ].join(
      ".",
    );

  if (
    Buffer.byteLength(
      sealedValue,
      "utf8",
    ) >=
    MAX_OAUTH_COOKIE_BYTES
  ) {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction exceeds the secure cookie limit.",
      500,
    );
  }

  return sealedValue;
}

export function openIntegrationOAuthTransaction(
  sealedValue: string,
): IntegrationOAuthTransaction {
  if (
    !sealedValue ||
    Buffer.byteLength(
      sealedValue,
      "utf8",
    ) >=
      MAX_OAUTH_COOKIE_BYTES
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction cookie is invalid.",
    );
  }

  try {
    const parts =
      sealedValue.split(
        ".",
      );

    if (
      parts.length !== 3 ||
      parts.some(
        (part) =>
          !part ||
          !BASE64_URL_PATTERN.test(
            part,
          ),
      )
    ) {
      throw createOAuthError(
        "INTEGRATION_OAUTH_INVALID_TRANSACTION",
        "The OAuth transaction cookie is malformed.",
      );
    }

    const [
      encodedInitializationVector,
      encodedAuthenticationTag,
      encodedPayload,
    ] =
      parts;

    const initializationVector =
      Buffer.from(
        encodedInitializationVector,
        "base64url",
      );

    const authenticationTag =
      Buffer.from(
        encodedAuthenticationTag,
        "base64url",
      );

    const encryptedPayload =
      Buffer.from(
        encodedPayload,
        "base64url",
      );

    if (
      initializationVector.length !==
        OAUTH_STATE_IV_BYTES ||
      authenticationTag.length !==
        OAUTH_STATE_AUTH_TAG_BYTES ||
      encryptedPayload.length === 0
    ) {
      throw createOAuthError(
        "INTEGRATION_OAUTH_INVALID_TRANSACTION",
        "The OAuth transaction cookie is malformed.",
      );
    }

    const key =
      deriveIntegrationOAuthStateKey();

    const decipher =
      createDecipheriv(
        OAUTH_STATE_ALGORITHM,
        key,
        initializationVector,
      );

    decipher.setAAD(
      OAUTH_STATE_ADDITIONAL_DATA,
    );

    decipher.setAuthTag(
      authenticationTag,
    );

    const decryptedPayload =
      Buffer.concat(
        [
          decipher.update(
            encryptedPayload,
          ),
          decipher.final(),
        ],
      ).toString(
        "utf8",
      );

    const parsedPayload: unknown =
      JSON.parse(
        decryptedPayload,
      );

    return validateOAuthTransaction(
      parsedPayload,
      Math.floor(
        Date.now() /
        1000,
      ),
    );
  }
  catch (
    error
  ) {
    if (
      isIntegrationOAuthError(
        error,
      )
    ) {
      throw error;
    }

    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction could not be authenticated.",
    );
  }
}

export function assertIntegrationOAuthState(
  receivedState: string | null,
  transaction: IntegrationOAuthTransaction,
): void {
  if (
    !receivedState ||
    !isValidIntegrationOAuthState(
      receivedState,
    ) ||
    !safelyCompareIntegrationOAuthValues(
      receivedState,
      transaction.state,
    )
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_STATE_MISMATCH",
      "The OAuth security state did not match. Start the connection again.",
    );
  }
}

export function createIntegrationOAuthTransactionCookie(
  sealedValue: string,
): IntegrationOAuthCookieDefinition {
  if (
    !sealedValue ||
    Buffer.byteLength(
      sealedValue,
      "utf8",
    ) >=
      MAX_OAUTH_COOKIE_BYTES
  ) {
    throw createOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "The OAuth transaction cookie is invalid.",
    );
  }

  return {
    name:
      INTEGRATION_OAUTH_COOKIE_NAME,
    value:
      sealedValue,
    httpOnly:
      true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite:
      "lax",
    path:
      INTEGRATION_OAUTH_COOKIE_PATH,
    maxAge:
      INTEGRATION_OAUTH_TRANSACTION_TTL_SECONDS,
  };
}

export function createClearedIntegrationOAuthTransactionCookie():
  IntegrationOAuthCookieDefinition {
  return {
    name:
      INTEGRATION_OAUTH_COOKIE_NAME,
    value:
      "",
    httpOnly:
      true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite:
      "lax",
    path:
      INTEGRATION_OAUTH_COOKIE_PATH,
    maxAge:
      0,
  };
}