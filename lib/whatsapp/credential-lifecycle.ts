export const WHATSAPP_CREDENTIAL_EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000;

export type WhatsAppCredentialLifecycleState =
  | "connected"
  | "expiring_soon"
  | "expired"
  | "revoked"
  | "reconnect_required";

export type WhatsAppCredentialLifecycleMetadata = {
  readonly credential_issued_at: string;
  readonly credential_expires_at: string | null;
  readonly credential_lifecycle_state: WhatsAppCredentialLifecycleState;
};

type LifecycleConfiguration = Readonly<Record<string, unknown>>;

function validIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * Resolves the public, non-secret lifecycle state. A missing expiration is
 * intentionally shown as connected: Meta did not report a finite expiry and
 * J10 must not invent one. Explicit revocation/reconnect states always win.
 */
export function getWhatsAppCredentialLifecycleState(
  configuration: LifecycleConfiguration,
  now = new Date(),
): WhatsAppCredentialLifecycleState {
  const recorded = configuration.credential_lifecycle_state;
  if (recorded === "revoked" || recorded === "reconnect_required") return recorded;

  const expiresAt = validIsoTimestamp(configuration.credential_expires_at);
  if (!expiresAt) return "connected";

  const expiryMs = Date.parse(expiresAt);
  const nowMs = now.getTime();
  if (expiryMs <= nowMs) return "expired";
  if (expiryMs - nowMs <= WHATSAPP_CREDENTIAL_EXPIRY_WARNING_MS) return "expiring_soon";
  return "connected";
}

export function buildWhatsAppCredentialLifecycleMetadata(input: {
  issuedAt: string;
  expiresAt?: string | null;
}): WhatsAppCredentialLifecycleMetadata {
  const issuedAt = validIsoTimestamp(input.issuedAt) ?? new Date().toISOString();
  const expiresAt = validIsoTimestamp(input.expiresAt);

  return {
    credential_issued_at: issuedAt,
    credential_expires_at: expiresAt,
    credential_lifecycle_state: getWhatsAppCredentialLifecycleState(
      { credential_expires_at: expiresAt },
      new Date(issuedAt),
    ),
  };
}

export function canUseWhatsAppCredential(
  configuration: LifecycleConfiguration,
  now = new Date(),
): boolean {
  const state = getWhatsAppCredentialLifecycleState(configuration, now);
  return state !== "expired" && state !== "revoked" && state !== "reconnect_required";
}
