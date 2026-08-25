import type {
  IntegrationProviderId,
} from "./integration";

export const INTEGRATION_OAUTH_TOKEN_SCHEMA_VERSION =
  "j10.integration-oauth-token.v1" as const;

export const INTEGRATION_OAUTH_TOKEN_STATUSES = [
  "missing",
  "valid",
  "refresh_required",
  "expired",
] as const;

export type IntegrationOAuthTokenStatus =
  (typeof INTEGRATION_OAUTH_TOKEN_STATUSES)[number];

export type IntegrationOAuthTokenErrorCode =
  | "INTEGRATION_OAUTH_TOKEN_MISSING"
  | "INTEGRATION_OAUTH_TOKEN_INVALID"
  | "INTEGRATION_OAUTH_TOKEN_EXPIRED"
  | "INTEGRATION_OAUTH_PROVIDER_ERROR"
  | "INTEGRATION_OAUTH_PROVIDER_MISMATCH"
  | "INTEGRATION_OAUTH_STORAGE_ERROR";

export interface IntegrationOAuthTokenSet {
  schemaVersion:
    typeof INTEGRATION_OAUTH_TOKEN_SCHEMA_VERSION;

  providerId:
    IntegrationProviderId;

  accessToken:
    string;

  refreshToken:
    string | null;

  tokenType:
    string;

  scopes:
    readonly string[];

  expiresAt:
    string | null;
}

export interface ParseIntegrationOAuthTokenResponseOptions {
  providerId:
    IntegrationProviderId;

  previousRefreshToken?:
    string | null;

  fallbackScopes?:
    readonly string[];

  now?:
    Date;
}

export interface IntegrationOAuthTokenLifecycleState {
  status:
    IntegrationOAuthTokenStatus;

  usable:
    boolean;

  refreshRequired:
    boolean;

  reauthorizationRequired:
    boolean;

  expiresInSeconds:
    number | null;
}

export interface IntegrationOAuthTokenMetadata {
  providerId:
    IntegrationProviderId;

  tokenType:
    string;

  scopes:
    readonly string[];

  expiresAt:
    string | null;

  hasAccessToken:
    boolean;

  hasRefreshToken:
    boolean;

  status:
    IntegrationOAuthTokenStatus;

  refreshRequired:
    boolean;

  reauthorizationRequired:
    boolean;
}