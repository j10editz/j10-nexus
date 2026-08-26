# J10 NEXUS Automation System

## Document status

This is the Day 16 architecture baseline for J10 Flow.

The document will be finalized after the Day 16B source-code and database audit.

## Core principle

J10 Flow is a visual authoring and operations layer over the existing automation runtime.

It must not create, replace, or duplicate the current execution engine.

## Target architecture

J10 Flow follows this sequence:

1. Visual workflow builder
2. Typed workflow graph
3. Server-side graph validator
4. Deterministic workflow compiler
5. Existing automation and step records
6. Existing run, approval, continuation, retry, and scheduler runtime
7. Existing CRM and integration bridges
8. Gmail, Google Calendar, CRM, and future providers

The same validated graph and schema version must always produce the same compiled workflow.

## Existing automation APIs

### Control plane

- `app/api/automation/route.ts`
- `app/api/automation/[id]/route.ts`
- `app/api/automation/[id]/readiness/route.ts`
- `app/api/automation/[id]/runs/route.ts`

### Authoring

- `app/api/automations/route.ts`
- `app/api/automations/[id]/route.ts`
- `app/api/automations/[id]/steps/route.ts`
- `app/api/automations/[id]/steps/[stepId]/route.ts`

### Execution

- `app/api/automations/[id]/run/route.ts`
- `app/api/automations/scheduler/route.ts`
- `app/api/automation-runs/route.ts`
- `app/api/automation-runs/[runId]/continue/route.ts`
- `app/api/automation-runs/[runId]/steps/[runStepId]/approval/route.ts`

Day 16B must determine whether `/api/automation` or `/api/automations` is the canonical route family and remove no behavior without evidence.

## Existing runtime libraries

### Actions

- `lib/automation/action-engine.ts`
- `lib/automation/crm-mutation-adapter.ts`
- `lib/integrations/automation-action-bridge.ts`

### Triggers

- `lib/automation/event-trigger-engine.ts`
- `lib/automation/schedule.ts`
- `lib/integrations/automation-trigger-bridge.ts`

### Conditions and context

- `lib/automation/condition-engine.ts`
- `lib/automation/workflow-context.ts`

### Reliability and protection

- `lib/automation/execution-guardrails.ts`
- `lib/automation/execution-lock.ts`
- `lib/automation/failure-policy.ts`
- `lib/automation/bridge-auth.ts`

J10 Flow nodes must compile into records these existing modules already understand.

## Existing workflow interface

The current workflow interface is:

- `app/dashboard/automation/page.tsx`

The Day 16A audit measured this page at approximately 202 KB. It contains too many responsibilities and requires careful component extraction.

The existing readiness component is:

- `components/automation/WorkflowReadinessPanel.tsx`

## Intended UI boundaries

The production builder should separate:

- workflow toolbar;
- visual canvas;
- node catalog;
- node renderer;
- edge renderer;
- configuration panel;
- connection selector;
- validation panel;
- publication dialog;
- version history;
- approval queue;
- run inspector;
- run timeline.

These are architectural boundaries. Files will be created only after Day 16B verifies the current implementation.
## Typed workflow graph

The builder must use a versioned graph contract containing:

- graph schema version;
- workflow identity;
- trigger node;
- action nodes;
- condition nodes;
- approval nodes;
- delay and schedule nodes;
- CRM action nodes;
- integration action nodes;
- directed edges;
- node positions;
- configuration values;
- variable mappings;
- connection references;
- failure policies;
- publication metadata.

Every node requires:

- a stable node ID;
- a registered node type;
- a versioned configuration contract;
- explicit input and output ports;
- server validation rules;
- deterministic compilation behavior.

Unknown node types and unsupported versions must be rejected.

## Validation boundary

Browser validation exists only for immediate user feedback.

The server is authoritative and must validate:

- graph schema version;
- node and edge integrity;
- exactly one valid trigger;
- node reachability;
- unsupported cycles;
- required configuration;
- connection ownership;
- integration capability availability;
- OAuth scopes;
- human approval requirements;
- environment restrictions;
- retry policy;
- failure policy;
- publication readiness.

A workflow must never publish only because browser validation passed.

## Compilation boundary

The compiler must:

1. Validate the complete graph.
2. Normalize configuration.
3. Determine a stable step order.
4. Map nodes to existing automation step types.
5. Preserve graph node IDs for observability.
6. Attach connection and capability references.
7. Attach approval, retry, and failure policies.
8. Produce a compilation result without side effects.
9. Persist only after validation and compilation succeed.

The compiler must not contact external providers.

## Draft, publish, and rollback model

Day 16 must separate editable drafts from executable published versions.

Required behavior:

- draft editing does not mutate the published workflow;
- publishing creates an immutable version;
- active runs retain the version with which they started;
- rollback uses a known historical version;
- the current published version is explicitly identifiable;
- readiness failures block publication.

The exact database model will be locked after the Day 16B schema audit.

## Execution model

Published workflows continue through the existing runtime:

1. A trigger is accepted.
2. An automation run is created.
3. Compiled steps execute in order.
4. Conditions choose valid branches.
5. Approval steps pause safely.
6. Approved runs continue.
7. CRM or integration actions execute through existing bridges.
8. Retry and failure policies handle errors.
9. The run completes, fails, is rejected, or is cancelled.

## Security boundaries

The browser may:

- edit graph state;
- display validation feedback;
- request safe connection summaries;
- request publication;
- display run and approval status.

The browser must never receive:

- OAuth access tokens;
- OAuth refresh tokens;
- client secrets;
- encrypted credential payloads;
- service-role keys;
- authorization headers;
- unrestricted internal errors.

The server must enforce:

- authentication;
- user and workspace ownership;
- RLS-compatible access;
- graph validation;
- capability and scope validation;
- approval requirements;
- environment restrictions;
- idempotency;
- credential redaction;
- safe error serialization.

## Observability

Every compiled node must remain traceable through:

- workflow ID;
- workflow version ID;
- graph node ID;
- automation ID;
- automation step ID;
- run ID;
- run-step ID;
- execution ID;
- correlation ID;
- integration operation ID when applicable.

The run inspector must identify the exact node responsible for running, completed, blocked, retried, rejected, or failed work.

## Compatibility requirements

Day 16 must preserve:

- manual workflows;
- scheduled workflows;
- event-triggered workflows;
- conditions and branching;
- workflow context and variables;
- CRM mutations;
- human approvals and continuation;
- execution locking;
- retry and failure policies;
- Gmail live actions;
- Google Calendar live actions;
- integration capability and scope guards;
- integration idempotency;
- analytics and operational logs;
- the Day 15N zero-cost sandbox.

## Known repository issues

Day 16A found two zero-byte component files:

- `components/dashboard/QuickActions.tsx`
- `components/Integrations.tsx`

They must not be deleted or implemented until Day 16B checks:

- current imports;
- Git history;
- whether they are intentional placeholders;
- whether the application depends on their absence.

## Day 16B audit questions

Before implementation, Day 16B must determine:

1. Which automation API family is canonical.
2. The exact automation TypeScript contracts.
3. The exact automation and step database schemas.
4. How step ordering is persisted.
5. How conditions and variables are serialized.
6. Whether node positions already have storage.
7. How draft, active, paused, and archived states work.
8. How workflow readiness is calculated.
9. Which indexes, constraints, and RLS policies exist.
10. How run steps reference automation steps.
11. How approval state is persisted.
12. How immutable versions can be added safely.
13. Which responsibilities can leave the 202 KB page.
14. Whether the zero-byte components should remain, be restored, or be removed.

## Implementation gate

No Day 16 graph migration, compiler, or production builder implementation begins until Day 16B answers these questions using full current repository files and database evidence.