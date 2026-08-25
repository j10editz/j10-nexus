import type {
  IntegrationProviderId,
} from "./integration";

export const INTEGRATION_OAUTH_CLIENT_AUTHENTICATION_METHODS = [
  "client_secret_post",
] as const;

export type IntegrationOAuthClientAuthenticationMethod =
  (typeof INTEGRATION_OAUTH_CLIENT_AUTHENTICATION_METHODS)[number];

export interface IntegrationOAuthProviderDefinition {
  providerId:
    IntegrationProviderId;

  authorizationEndpoint:
    string;

  tokenEndpoint:
    string;

  clientIdEnvironmentVariable:
    string;

  clientSecretEnvironmentVariable:
    string;

  scopes:
    readonly string[];

  clientAuthenticationMethod:
    IntegrationOAuthClientAuthenticationMethod;

  authorizationParameters?:
    Readonly<Record<string, string>>;
}

export interface IntegrationOAuthProviderRuntime {
  definition:
    IntegrationOAuthProviderDefinition;

  clientId:
    string;

  clientSecret:
    string;

  applicationOrigin:
    string;

  redirectUri:
    string;
}

export interface IntegrationOAuthAuthorizationUrlInput {
  runtime:
    IntegrationOAuthProviderRuntime;

  state:
    string;

  codeChallenge:
    string;
}

export interface IntegrationOAuthAuthorizationCodeExchangeInput {
  runtime:
    IntegrationOAuthProviderRuntime;

  authorizationCode:
    string;

  codeVerifier:
    string;
}