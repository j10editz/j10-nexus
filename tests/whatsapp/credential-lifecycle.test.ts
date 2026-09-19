import { describe, expect, it } from "vitest";
import {
  buildWhatsAppCredentialLifecycleMetadata,
  canUseWhatsAppCredential,
  getWhatsAppCredentialLifecycleState,
} from "@/lib/whatsapp/credential-lifecycle";

describe("WhatsApp credential lifecycle", () => {
  it("records issuance and finite expiration without putting credentials in metadata", () => {
    const metadata = buildWhatsAppCredentialLifecycleMetadata({
      issuedAt: "2026-09-19T12:00:00.000Z",
      expiresAt: "2026-10-19T12:00:00.000Z",
    });

    expect(metadata).toEqual({
      credential_issued_at: "2026-09-19T12:00:00.000Z",
      credential_expires_at: "2026-10-19T12:00:00.000Z",
      credential_lifecycle_state: "connected",
    });
    expect(JSON.stringify(metadata)).not.toMatch(/token|secret|access/i);
  });

  it("warns before expiry and fails closed after expiry", () => {
    const configuration = {
      credential_expires_at: "2026-10-01T12:00:00.000Z",
    };

    expect(
      getWhatsAppCredentialLifecycleState(configuration, new Date("2026-09-20T12:00:00.000Z")),
    ).toBe("expiring_soon");
    expect(
      getWhatsAppCredentialLifecycleState(configuration, new Date("2026-10-02T12:00:00.000Z")),
    ).toBe("expired");
    expect(
      canUseWhatsAppCredential(
        { ...configuration, credential_expires_at: "2026-10-02T12:00:00.000Z" },
        new Date("2026-10-03T12:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("fails closed for explicitly revoked or reconnect-required credentials", () => {
    expect(getWhatsAppCredentialLifecycleState({ credential_lifecycle_state: "revoked" })).toBe("revoked");
    expect(canUseWhatsAppCredential({ credential_lifecycle_state: "revoked" })).toBe(false);
    expect(getWhatsAppCredentialLifecycleState({ credential_lifecycle_state: "reconnect_required" })).toBe("reconnect_required");
    expect(canUseWhatsAppCredential({ credential_lifecycle_state: "reconnect_required" })).toBe(false);
  });
});
