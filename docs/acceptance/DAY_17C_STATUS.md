# Day 17C — Controlled WhatsApp Delivery

Status: implementation complete; CEO installation and one-message acceptance pending.

## Delivered

- Strict numeric validation for the Meta Phone Number ID and WhatsApp Business Account (WABA) ID.
- Safe correction of public Meta identifiers without deleting encrypted credentials.
- Automatic enablement of the installed WhatsApp trigger and action capability set.
- A two-step live test gate using Meta's `hello_world` template.
- Five-minute, HMAC-signed operator approval bound to the signed-in user, connection, exact request fingerprint, and idempotency key.
- One-send idempotency protection through the existing integration execution claim.
- Explicit preparation, masked-recipient preview, cancel, and approve-and-send controls in WhatsApp Operations.

## CEO acceptance

1. Keep the Meta contact email unchanged.
2. In J10 Integration Command Center, replace only the saved Business Account ID with the numeric WABA ID from Meta API Setup.
3. Save, then run one health check to restore `Connected / Operational`.
4. Open WhatsApp Operations, enter the approved test destination, and choose `Prepare test`.
5. Verify the masked destination and choose `Approve and send once`.
6. Confirm the receipt is shown and exactly one `hello_world` message arrives.

No database migration is required.
