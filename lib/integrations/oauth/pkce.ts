import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type {
  IntegrationOAuthPkcePair,
} from "@/types/integration-oauth";

import {
  IntegrationOAuthError,
} from "./errors";

const PKCE_CODE_VERIFIER_PATTERN =
  /^[A-Za-z0-9._~-]{43,128}$/;

const OAUTH_STATE_PATTERN =
  /^[A-Za-z0-9_-]{43,128}$/;

function createBase64UrlSecret(
  byteLength: number,
): string {
  return randomBytes(
    byteLength,
  ).toString(
    "base64url",
  );
}

export function isValidIntegrationOAuthCodeVerifier(
  value: string,
): boolean {
  return PKCE_CODE_VERIFIER_PATTERN.test(
    value,
  );
}

export function isValidIntegrationOAuthState(
  value: string,
): boolean {
  return OAUTH_STATE_PATTERN.test(
    value,
  );
}

export function createIntegrationOAuthPkcePair():
  IntegrationOAuthPkcePair {
  const codeVerifier =
    createBase64UrlSecret(
      32,
    );

  if (
    !isValidIntegrationOAuthCodeVerifier(
      codeVerifier,
    )
  ) {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_INVALID_PKCE",
      "J10 could not generate a valid OAuth PKCE verifier.",
      500,
    );
  }

  const codeChallenge =
    createHash(
      "sha256",
    )
      .update(
        codeVerifier,
        "ascii",
      )
      .digest(
        "base64url",
      );

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod:
      "S256",
  };
}

export function createIntegrationOAuthStateNonce():
  string {
  const state =
    createBase64UrlSecret(
      32,
    );

  if (
    !isValidIntegrationOAuthState(
      state,
    )
  ) {
    throw new IntegrationOAuthError(
      "INTEGRATION_OAUTH_INVALID_TRANSACTION",
      "J10 could not generate a valid OAuth state.",
      500,
    );
  }

  return state;
}

export function safelyCompareIntegrationOAuthValues(
  firstValue: string,
  secondValue: string,
): boolean {
  const firstBuffer =
    Buffer.from(
      firstValue,
      "utf8",
    );

  const secondBuffer =
    Buffer.from(
      secondValue,
      "utf8",
    );

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    firstBuffer,
    secondBuffer,
  );
}