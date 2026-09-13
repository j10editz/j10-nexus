# Stage 1: Lead Capture and Intake

## Milestone 2 public forms

- Published funnels submit through `/api/website/lead`; the route resolves the published funnel server-side and never accepts a workspace ID from a browser.
- The Funnel Studio exposes a copyable iframe snippet. The iframe uses the published funnel identity and records its source as `widget_form`; native funnel submissions record `website_form`.
- Each browser session retains a submission idempotency key for a funnel. Retries reuse it; the canonical intake RPC rejects a changed payload for the same key.
- Forms collect optional explicit marketing consent only. Referrer, page URL, campaign, and UTM parameters are stored as attribution. Honeypot, payload-limit, and rate-limit handling remain in the server route.
- The transaction-backed Stage 1 intake persists the canonical contact/identity, intake, inbox thread/message, consent, and `lead.received` outbox event.

## Verification

Milestone 2 must pass focused lead-intake tests, the serialized full suite, `npx tsc --noEmit`, `npm run build`, and `git diff --check` before it is committed. Production application is out of scope.
