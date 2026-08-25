import type {
  IntegrationProviderId,
} from "./integration";

export const INTEGRATION_OAUTH_TRANSACTION_SCHEMA_VERSION =
  "j10.integration-oauth-transaction.v1" as const;

export const INTEGRATION_OAUTH_TRANSACTION_TTL_SECONDS =
  10 * 60;

export const INTEGRATION_OAUTH_COOKIE_NAME =
  "j10_integration_oauth_transaction";

export const INTEGRATION_OAUTH_COOKIE_PATH =
  "/api/integrations";

export type IntegrationOAuthErrorCode =
  | "INTEGRATION_OAUTH_CONFIGURATION_ERROR"
  | "INTEGRATION_OAUTH_INVALID_TRANSACTION"
  | "INTEGRATION_OAUTH_EXPIRED_TRANSACTION"
  | "INTEGRATION_OAUTH_STATE_MISMATCH"
  | "INTEGRATION_OAUTH_INVALID_RETURN_TO"
  | "INTEGRATION_OAUTH_INVALID_PKCE";

export interface IntegrationOAuthPkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

export interface IntegrationOAuthTransactionInput {
  userId: string;
  connectionId: string;
  providerId: IntegrationProviderId;
  state: string;
  codeVerifier: string;
  returnTo?: string;
}

export interface IntegrationOAuthTransaction {
  schemaVersion:
    typeof INTEGRATION_OAUTH_TRANSACTION_SCHEMA_VERSION;
  userId: string;
  connectionId: string;
  providerId: IntegrationProviderId;
  state: string;
  codeVerifier: string;
  returnTo: string;
  issuedAt: number;
  expiresAt: number;
}

export interface IntegrationOAuthCookieDefinition {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}