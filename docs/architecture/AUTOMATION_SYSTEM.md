# J10 NEXUS Automation Architecture

## Purpose

J10 Flow is the visual authoring and operations layer for the canonical J10
automation runtime. Draft graphs compile into the same server-side workflow
model used by scheduled, manual, CRM, and integration-event triggers.

## Core boundaries

- The editor owns draft graph state and validation feedback.
- The compiler converts a typed graph into runtime-compatible steps.
- Published workflow versions are immutable.
- Runtime execution operates only on a stored published snapshot.
- Integration actions pass through capability, credential, and approval gates.
- External events are normalized before trigger matching.

## Workflow lifecycle

1. A user edits a typed workflow graph.
2. Contract validation checks topology, configuration, and capabilities.
3. The compiler produces deterministic runtime steps.
4. Publishing stores an immutable version and atomically activates it.
5. A trigger creates a run from the active graph snapshot.
6. The runtime records step outcomes, approvals, retries, and failures.
7. Operators inspect run history and can publish or restore another version.

## Integration event pipeline

1. A provider sends a signed webhook to a stable endpoint.
2. J10 verifies the signature and resolves the owning connection.
3. The provider adapter emits a canonical integration event.
4. Idempotency prevents duplicate processing.
5. Published workflows are matched by provider and event type.
6. Matching workflows execute through the canonical runtime.

## Safety controls

- Workspace-scoped authorization and row-level security
- Encrypted credentials and explicit key versioning
- Redaction of sensitive values from logs and failures
- Human approval for consequential live actions
- Idempotency keys for external side effects
- Immutable execution and webhook evidence
- Deterministic graph validation before publication

## Verification

The repository includes focused suites for workflow contracts, runtime routing,
dashboard behavior, integration adapters, WhatsApp delivery, and inbound
webhook processing. `npm test` and `npm run build` are required before release.
