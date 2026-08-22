import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  IntegrationProviderId,
} from "../../types/integration";

import {
  getIntegrationConnectionById,
} from "./database";

import {
  getIntegrationProvider,
} from "./registry";

const ENCRYPTION_ALGORITHM =
  "aes-256-gcm" as const;

const INITIALIZATION_VECTOR_LENGTH =
  12;

const AUTHENTICATION_TAG_LENGTH =
  16;

type CredentialValues =
  Readonly<Record<string, string>>;

interface StoredCredentialPayload {
  providerId:
    IntegrationProviderId;

  values:
    Record<string, string>;

  encryptedAt:
    string;
}

interface CredentialEnvelopeRow {
  credential_id:
    string;

  integration_id:
    string;

  provider:
    string;

  encrypted_payload:
    string;

  initialization_vector:
    string;

  authentication_tag:
    string;

  algorithm:
    string;

  key_version:
    number;

  rotated_at:
    string | null;

  last_used_at:
    string | null;
}

export interface StoreIntegrationCredentialsInput {
  connectionId:
    string;

  values:
    CredentialValues;
}

export interface DecryptedIntegrationCredentials {
  connectionId:
    string;

  providerId:
    IntegrationProviderId;

  values:
    CredentialValues;

  keyVersion:
    number;

  encryptedAt:
    string;

  rotatedAt:
    string | null;

  lastUsedAt:
    string | null;
}

interface EncryptedCredentialEnvelope {
  encryptedPayload:
    string;

  initializationVector:
    string;

  authenticationTag:
    string;

  algorithm:
    typeof ENCRYPTION_ALGORITHM;

  keyVersion:
    number;
}

export class IntegrationCredentialError extends Error {
  readonly code:
    string;

  readonly details:
    unknown;

  constructor(
    message:
      string,

    code =
      "INTEGRATION_CREDENTIAL_ERROR",

    details?:
      unknown,
  ) {
    super(message);

    this.name =
      "IntegrationCredentialError";

    this.code =
      code;

    this.details =
      details;
  }
}

function createCredentialError(
  message:
    string,

  error:
    unknown,
): IntegrationCredentialError {
  const possibleError =
    error as {
      code?:
        string;

      message?:
        string;

      details?:
        unknown;
    } | null;

  return new IntegrationCredentialError(
    message,

    possibleError?.code ??
      "INTEGRATION_CREDENTIAL_ERROR",

    possibleError?.details ??
      possibleError?.message ??
      error,
  );
}

function getEncryptionKey():
  Buffer {
  const encodedKey =
    process.env
      .J10_INTEGRATION_ENCRYPTION_KEY
      ?.trim();

  if (!encodedKey) {
    throw new IntegrationCredentialError(
      "J10 integration encryption key is not configured.",

      "INTEGRATION_ENCRYPTION_KEY_MISSING",
    );
  }

  const key =
    Buffer.from(
      encodedKey,
      "base64",
    );

  if (key.length !== 32) {
    throw new IntegrationCredentialError(
      "J10 integration encryption key must contain exactly 32 bytes.",

      "INTEGRATION_ENCRYPTION_KEY_INVALID",
    );
  }

  return key;
}

function getEncryptionKeyVersion():
  number {
  const rawVersion =
    process.env
      .J10_INTEGRATION_ENCRYPTION_KEY_VERSION
      ?.trim() ??
    "1";

  const keyVersion =
    Number.parseInt(
      rawVersion,
      10,
    );

  if (
    !Number.isInteger(
      keyVersion,
    ) ||
    keyVersion < 1
  ) {
    throw new IntegrationCredentialError(
      "J10 integration encryption key version is invalid.",

      "INTEGRATION_ENCRYPTION_KEY_VERSION_INVALID",
    );
  }

  return keyVersion;
}

function createAdditionalAuthenticatedData(
  providerId:
    IntegrationProviderId,

  keyVersion:
    number,
): Buffer {
  return Buffer.from(
    `j10-nexus:integration:${providerId}:v${keyVersion}`,

    "utf8",
  );
}

function validateCredentialValues(
  providerId:
    IntegrationProviderId,

  values:
    CredentialValues,
): void {
  const provider =
    getIntegrationProvider(
      providerId,
    );

  const entries =
    Object.entries(
      values,
    );

  for (
    const [key, value]
    of entries
  ) {
    if (
      typeof value !==
        "string" ||
      !key.trim()
    ) {
      throw new IntegrationCredentialError(
        "Integration credential values must use non-empty keys and string values.",

        "INVALID_INTEGRATION_CREDENTIAL_VALUES",
      );
    }
  }

  if (
    provider.auth.type ===
    "oauth2"
  ) {
    const allowedOAuthFields =
      new Set([
        "access_token",
        "refresh_token",
        "expires_at",
        "token_type",
        "scope",
      ]);

    const invalidField =
      entries.find(
        ([key]) =>
          !allowedOAuthFields.has(
            key,
          ),
      );

    if (invalidField) {
      throw new IntegrationCredentialError(
        `Unsupported OAuth credential field: ${invalidField[0]}`,

        "UNSUPPORTED_OAUTH_CREDENTIAL_FIELD",
      );
    }

    if (
      !values.access_token
        ?.trim()
    ) {
      throw new IntegrationCredentialError(
        "OAuth access token is required.",

        "OAUTH_ACCESS_TOKEN_REQUIRED",
      );
    }

    return;
  }

  const credentialFields =
    provider.auth
      .setupFields
      .filter(
        (field) =>
          field.storage ===
          "credential_vault",
      );

  const allowedFields =
    new Set(
      credentialFields.map(
        (field) =>
          field.key,
      ),
    );

  const unsupportedField =
    entries.find(
      ([key]) =>
        !allowedFields.has(
          key,
        ),
    );

  if (unsupportedField) {
    throw new IntegrationCredentialError(
      `Unsupported credential field for ${provider.name}: ${unsupportedField[0]}`,

      "UNSUPPORTED_INTEGRATION_CREDENTIAL_FIELD",
    );
  }

  const missingRequiredField =
    credentialFields.find(
      (field) =>
        field.required &&
        !values[field.key]
          ?.trim(),
    );

  if (missingRequiredField) {
    throw new IntegrationCredentialError(
      `${missingRequiredField.label} is required.`,

      "REQUIRED_INTEGRATION_CREDENTIAL_MISSING",
    );
  }
}

function encryptCredentialValues(
  providerId:
    IntegrationProviderId,

  values:
    CredentialValues,
): EncryptedCredentialEnvelope {
  validateCredentialValues(
    providerId,
    values,
  );

  const encryptionKey =
    getEncryptionKey();

  const keyVersion =
    getEncryptionKeyVersion();

  const initializationVector =
    randomBytes(
      INITIALIZATION_VECTOR_LENGTH,
    );

  const additionalAuthenticatedData =
    createAdditionalAuthenticatedData(
      providerId,
      keyVersion,
    );

  const storedPayload:
    StoredCredentialPayload = {
      providerId,

      values: {
        ...values,
      },

      encryptedAt:
        new Date()
          .toISOString(),
    };

  const cipher =
    createCipheriv(
      ENCRYPTION_ALGORITHM,
      encryptionKey,
      initializationVector,
      {
        authTagLength:
          AUTHENTICATION_TAG_LENGTH,
      },
    );

  cipher.setAAD(
    additionalAuthenticatedData,
  );

  const encryptedPayload =
    Buffer.concat([
      cipher.update(
        JSON.stringify(
          storedPayload,
        ),
        "utf8",
      ),

      cipher.final(),
    ]);

  const authenticationTag =
    cipher.getAuthTag();

  return {
    encryptedPayload:
      encryptedPayload
        .toString(
          "base64",
        ),

    initializationVector:
      initializationVector
        .toString(
          "base64",
        ),

    authenticationTag:
      authenticationTag
        .toString(
          "base64",
        ),

    algorithm:
      ENCRYPTION_ALGORITHM,

    keyVersion,
  };
}

function decryptCredentialEnvelope(
  providerId:
    IntegrationProviderId,

  envelope:
    CredentialEnvelopeRow,
): StoredCredentialPayload {
  if (
    envelope.algorithm !==
    ENCRYPTION_ALGORITHM
  ) {
    throw new IntegrationCredentialError(
      "Unsupported stored credential encryption algorithm.",

      "UNSUPPORTED_STORED_CREDENTIAL_ALGORITHM",
    );
  }

  const encryptionKey =
    getEncryptionKey();

  const initializationVector =
    Buffer.from(
      envelope
        .initialization_vector,
      "base64",
    );

  const authenticationTag =
    Buffer.from(
      envelope
        .authentication_tag,
      "base64",
    );

  if (
    initializationVector.length !==
    INITIALIZATION_VECTOR_LENGTH
  ) {
    throw new IntegrationCredentialError(
      "Stored credential initialization vector is invalid.",

      "INVALID_CREDENTIAL_INITIALIZATION_VECTOR",
    );
  }

  if (
    authenticationTag.length !==
    AUTHENTICATION_TAG_LENGTH
  ) {
    throw new IntegrationCredentialError(
      "Stored credential authentication tag is invalid.",

      "INVALID_CREDENTIAL_AUTHENTICATION_TAG",
    );
  }

  const decipher =
    createDecipheriv(
      ENCRYPTION_ALGORITHM,
      encryptionKey,
      initializationVector,
      {
        authTagLength:
          AUTHENTICATION_TAG_LENGTH,
      },
    );

  decipher.setAAD(
    createAdditionalAuthenticatedData(
      providerId,
      envelope.key_version,
    ),
  );

  decipher.setAuthTag(
    authenticationTag,
  );

  try {
    const decryptedPayload =
      Buffer.concat([
        decipher.update(
          Buffer.from(
            envelope
              .encrypted_payload,
            "base64",
          ),
        ),

        decipher.final(),
      ]).toString(
        "utf8",
      );

    const parsedPayload =
      JSON.parse(
        decryptedPayload,
      ) as Partial<
        StoredCredentialPayload
      >;

    if (
      parsedPayload.providerId !==
        providerId ||
      !parsedPayload.values ||
      typeof parsedPayload.values !==
        "object" ||
      Array.isArray(
        parsedPayload.values,
      ) ||
      typeof parsedPayload.encryptedAt !==
        "string"
    ) {
      throw new Error(
        "Credential payload validation failed.",
      );
    }

    const values:
      Record<string, string> = {};

    for (
      const [key, value]
      of Object.entries(
        parsedPayload.values,
      )
    ) {
      if (
        typeof value !==
        "string"
      ) {
        throw new Error(
          "Credential value validation failed.",
        );
      }

      values[key] =
        value;
    }

    return {
      providerId,

      values,

      encryptedAt:
        parsedPayload.encryptedAt,
    };
  } catch {
    throw new IntegrationCredentialError(
      "Integration credentials could not be decrypted or failed authentication.",

      "INTEGRATION_CREDENTIAL_DECRYPTION_FAILED",
    );
  }
}

function normalizeEnvelopeResponse(
  data:
    unknown,
): CredentialEnvelopeRow | null {
  if (
    Array.isArray(data)
  ) {
    return (
      data[0] as
        CredentialEnvelopeRow |
        undefined
    ) ?? null;
  }

  if (
    data &&
    typeof data ===
      "object"
  ) {
    return data as
      CredentialEnvelopeRow;
  }

  return null;
}

export async function storeIntegrationCredentials(
  supabase:
    SupabaseClient,

  userId:
    string,

  input:
    StoreIntegrationCredentialsInput,
): Promise<string> {
  const connection =
    await getIntegrationConnectionById(
      supabase,
      userId,
      input.connectionId,
    );

  if (!connection) {
    throw new IntegrationCredentialError(
      "Integration connection was not found.",

      "INTEGRATION_NOT_FOUND",
    );
  }

  const envelope =
    encryptCredentialValues(
      connection.providerId,
      input.values,
    );

  const {
    data,
    error,
  } = await supabase.rpc(
    "store_integration_credential_envelope",
    {
      p_integration_id:
        connection.id,

      p_encrypted_payload:
        envelope.encryptedPayload,

      p_initialization_vector:
        envelope.initializationVector,

      p_authentication_tag:
        envelope.authenticationTag,

      p_algorithm:
        envelope.algorithm,

      p_key_version:
        envelope.keyVersion,
    },
  );

  if (error) {
    throw createCredentialError(
      "Could not securely store integration credentials.",

      error,
    );
  }

  if (
    typeof data !==
      "string"
  ) {
    throw new IntegrationCredentialError(
      "Credential storage returned an invalid reference.",

      "INVALID_CREDENTIAL_REFERENCE",
    );
  }

  return data;
}

export async function getIntegrationCredentials(
  supabase:
    SupabaseClient,

  userId:
    string,

  connectionId:
    string,
): Promise<
  DecryptedIntegrationCredentials |
  null
> {
  const connection =
    await getIntegrationConnectionById(
      supabase,
      userId,
      connectionId,
    );

  if (!connection) {
    throw new IntegrationCredentialError(
      "Integration connection was not found.",

      "INTEGRATION_NOT_FOUND",
    );
  }

  if (
    !connection
      .credentialReference
  ) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_integration_credential_envelope",
    {
      p_integration_id:
        connection.id,
    },
  );

  if (error) {
    throw createCredentialError(
      "Could not retrieve encrypted integration credentials.",

      error,
    );
  }

  const envelope =
    normalizeEnvelopeResponse(
      data,
    );

  if (!envelope) {
    return null;
  }

  if (
    envelope.provider !==
      connection.providerId &&
    !(
      connection.providerId ===
        "gmail" &&
      envelope.provider ===
        "email"
    ) &&
    !(
      connection.providerId ===
        "google-calendar" &&
      envelope.provider ===
        "google_calendar"
    ) &&
    !(
      connection.providerId ===
        "whatsapp-business" &&
      envelope.provider ===
        "whatsapp"
    )
  ) {
    throw new IntegrationCredentialError(
      "Stored credentials do not match the integration provider.",

      "INTEGRATION_CREDENTIAL_PROVIDER_MISMATCH",
    );
  }

  const decryptedPayload =
    decryptCredentialEnvelope(
      connection.providerId,
      envelope,
    );

  /*
   * Credential usage tracking must never block
   * a successful secure credential read.
   */

  await supabase.rpc(
    "mark_integration_credential_used",
    {
      p_integration_id:
        connection.id,
    },
  );

  return {
    connectionId:
      connection.id,

    providerId:
      connection.providerId,

    values:
      decryptedPayload.values,

    keyVersion:
      envelope.key_version,

    encryptedAt:
      decryptedPayload.encryptedAt,

    rotatedAt:
      envelope.rotated_at,

    lastUsedAt:
      envelope.last_used_at,
  };
}

export async function deleteIntegrationCredentials(
  supabase:
    SupabaseClient,

  userId:
    string,

  connectionId:
    string,
): Promise<boolean> {
  const connection =
    await getIntegrationConnectionById(
      supabase,
      userId,
      connectionId,
    );

  if (!connection) {
    return false;
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "delete_integration_credential",
    {
      p_integration_id:
        connection.id,
    },
  );

  if (error) {
    throw createCredentialError(
      "Could not delete integration credentials.",

      error,
    );
  }

  return data === true;
}

export function redactIntegrationCredentialValues(
  values:
    CredentialValues,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.keys(
      values,
    ).map(
      (key) => [
        key,
        "••••••••",
      ],
    ),
  );
}