# Day 16 Acceptance Contract

## Mission

Day 16 delivers J10 Flow: a production-grade visual workflow builder and operations interface over the existing J10 NEXUS automation runtime.

Day 16 must not be declared complete from a successful build alone.

## Baseline

- Project: J10 NEXUS
- Day 16 feature: J10 Flow
- Branch: `main`
- Day 16 starting checkpoint: `39d3aad`
- Framework: Next.js 16.3.0
- Language: TypeScript
- Database and authentication: Supabase
- Local development URL: `http://localhost:3000`

## Acceptance A: Continuity documentation

The repository contains and validates:

- `docs/CTO_HANDOFF.md`
- `docs/ROADMAP.md`
- `docs/architecture/AUTOMATION_SYSTEM.md`
- `docs/acceptance/DAY_16.md`

The documents must accurately identify:

- completed Days 12 through 15;
- the current Git checkpoint;
- Day 16 scope;
- implementation rules;
- architecture boundaries;
- acceptance requirements;
- security requirements;
- unresolved audit questions.

## Acceptance B: Architecture and audit

Before schema or builder implementation:

- all current automation APIs are inspected;
- all current automation types are inspected;
- all runtime libraries are inspected;
- existing Supabase automation migrations are inspected;
- the 202 KB automation page is mapped by responsibility;
- the two zero-byte component files are investigated;
- overlapping route families are explained;
- compatibility risks are documented.

No existing execution path may be replaced without evidence and regression coverage.

## Acceptance C: Typed workflow graph

The workflow graph must provide:

- a versioned schema;
- stable workflow and node IDs;
- registered node types;
- explicit edges;
- typed configuration;
- node positions;
- connection references;
- variable mappings;
- retry and failure policies;
- publication metadata.

The server must reject:

- unknown node types;
- unsupported schema versions;
- missing triggers;
- multiple unsupported triggers;
- invalid edges;
- unreachable required nodes;
- invalid configuration;
- unsupported cycles;
- unauthorized connections;
- unavailable capabilities;
- insufficient scopes.

## Acceptance D: Persistence and RLS

The final persistence model must support:

- editable drafts;
- immutable published versions;
- current published-version selection;
- rollback;
- graph storage;
- compiled step storage;
- node-to-step traceability;
- active-run version stability.

Supabase requirements:

- primary and foreign keys;
- useful indexes;
- bounded JSON sizes;
- ownership constraints;
- row-level security;
- authenticated-user policies;
- service-role access only where required;
- no public or anonymous write access.

All migrations must start with `begin;` and end with `commit;`.

## Acceptance E: Visual workflow builder

The workflow interface must support:

- adding nodes;
- selecting nodes;
- moving nodes;
- connecting compatible ports;
- deleting nodes and edges;
- editing configuration;
- zooming and panning;
- displaying validation errors;
- saving drafts;
- publishing valid workflows;
- viewing publication state.

The UI must remain usable at desktop and supported responsive widths.

The implementation must extract maintainable components from the existing automation page instead of adding more uncontrolled responsibility to it.

## Acceptance F: Dynamic node catalog

The node catalog must be generated from registered contracts rather than duplicated UI-only definitions.

Required initial node families:

- manual trigger;
- schedule trigger;
- event trigger;
- integration trigger;
- condition;
- human approval;
- delay;
- CRM action;
- integration action;
- context or variable action where supported.

Every catalog entry must identify:

- node type;
- version;
- title;
- description;
- category;
- icon or visual identity;
- configuration contract;
- input ports;
- output ports;
- validation behavior.

## Acceptance G: Connections, scopes, and readiness

Integration nodes must:

- reference connection IDs;
- reference registered capability IDs;
- display safe connection summaries;
- validate connection ownership;
- validate environment compatibility;
- validate enabled capabilities;
- validate required OAuth scopes;
- display readiness failures before publication;
- preserve human-approval requirements.

Tokens and secrets must never be stored inside graph JSON or returned to the browser.
## Acceptance H: Drafts, publishing, and rollback

The builder must support:

- creating a draft;
- reopening a draft;
- autosaving safely;
- validating before publication;
- publishing an immutable workflow version;
- identifying the current published version;
- preserving the version used by an active run;
- reviewing version history;
- rolling back to a known version.

Publishing must fail atomically. A partial compilation must never become executable.

## Acceptance I: Deterministic compiler

The server-side compiler must:

- accept only validated graphs;
- normalize graph configuration;
- produce stable step ordering;
- map nodes to existing step types;
- preserve graph-node identifiers;
- attach capability and connection references;
- attach approval requirements;
- attach retry and failure policies;
- produce no provider calls;
- create no external side effects.

The same graph and schema version must produce an equivalent compiled result.

## Acceptance J: Runtime compatibility

Published workflows must execute through the existing runtime and preserve:

- manual execution;
- scheduled execution;
- event-triggered execution;
- conditions and branches;
- workflow context;
- CRM actions;
- integration actions;
- approval pauses;
- approval continuation;
- execution locks;
- retries;
- failure policies;
- idempotency;
- operational logs.

Day 12 through Day 15 behavior must remain functional.

## Acceptance K: Human approval interface

Approval-required nodes must:

- pause before the protected side effect;
- display the pending action;
- show safe, redacted context;
- allow approve or reject;
- record the authenticated decision;
- prevent duplicate decisions;
- continue only after approval;
- remain auditable through the run inspector.

Rejection must not send a provider request.

## Acceptance L: Run inspector and operations

The operations interface must display:

- workflow version;
- run status;
- trigger information;
- ordered run steps;
- current node;
- completed nodes;
- blocked nodes;
- approval state;
- retry attempts;
- failure information;
- provider request metadata;
- timestamps;
- safe correlation identifiers.

The graph should visually identify the node associated with each run step.

Credentials, raw authorization headers, and unrestricted provider payloads must remain hidden.

## Acceptance M: Repository-native verification

Permanent verification must live inside the repository.

Day 16 should add suitable commands or test files for:

- graph schema validation;
- invalid-edge rejection;
- missing-trigger rejection;
- deterministic compilation;
- draft and published-version isolation;
- rollback;
- connection ownership denial;
- capability denial;
- missing-scope denial;
- approval pause and continuation;
- rejection without side effects;
- duplicate execution suppression;
- retry behavior;
- safe error serialization;
- credential redaction.

Browser-console scripts may assist manual debugging but cannot be the only permanent acceptance method.

## Acceptance N: Zero-cost sandbox

The Day 16 sandbox must verify the workflow-builder contracts with:

- zero paid provider calls;
- zero external side effects;
- zero persistent operational writes when isolation requires none;
- zero paid AI requests;
- zero credential exposure;
- zero estimated cost.

Existing Day 15N acceptance must continue to report:

- 8 of 8 checks passed;
- 0 provider calls;
- 0 external side effects;
- 0 database writes;
- 0 AI requests;
- `$0.00` estimated cost.

## Acceptance O: Controlled live acceptance and checkpoint

After sandbox acceptance, controlled live tests must verify:

- one human-approved Gmail action;
- one human-approved Google Calendar action;
- correct connection and capability routing;
- correct OAuth scope enforcement;
- capability denial before a provider call;
- approval rejection before a provider call;
- duplicate execution suppression;
- safe retry or rate-limit simulation;
- successful operational logging;
- no secret exposure.

The final engineering checkpoint requires:

1. Targeted tests pass.
2. Full repository tests pass.
3. ESLint reports zero errors.
4. Production build passes.
5. `git diff --check` passes.
6. No environment or credential file is tracked.
7. Suspicious empty and backup files are reviewed.
8. Supabase migrations are validated.
9. Working-tree changes match Day 16 scope.
10. The checkpoint is committed and pushed to `origin/main`.
11. The working tree is clean after the push.

## Final success contract

Day 16 is complete only when the repository, Supabase schema, visual interface, sandbox, controlled live acceptance, and GitHub checkpoint all agree.

Expected final acceptance message:

`DAY 16 J10 FLOW PRODUCTION WORKFLOW BUILDER PASSED.`

Expected checkpoint title:

`Complete Day 16 production workflow builder`

## Current implementation record

The scoped implementation and verification record is maintained in
`docs/acceptance/DAY_16_STATUS.md`.
