# J10 NEXUS Engineering Roadmap

## Verified checkpoints

- Day 12: Automation and workflow engine completed
- Day 13: Advanced workflow intelligence completed
- Day 14: Integration foundation completed
- Day 14 Git checkpoint: `7fa7e12`
- Day 15: Google OAuth and live integration runtime completed
- Day 15 Git checkpoint: `39d3aad`

# Day 16 — J10 Flow Production Workflow Builder

## Main objective

Turn the existing automation engine and Day 15 integration runtime into a production-ready visual workflow authoring, deployment, and operations system.

J10 Flow will use the current execution engine. It will not create a second or competing automation runtime.

## 16A — Continuity and architecture audit

- Install permanent CTO handoff documentation
- Record verified repository state
- Record current automation routes and libraries
- Document Day 16 acceptance requirements
- Identify existing technical debt
- Prevent future project continuity loss
- Establish the exact Day 16B inspection batch

Completion evidence:

- Four Day 16 documentation files exist
- Documents reference checkpoint `39d3aad`
- `git diff --check` passes
- No secrets appear in documentation

## 16B — Automation schema and implementation audit

- Read complete automation TypeScript contracts
- Read automation database access
- Read automation CRUD APIs
- Read step CRUD APIs
- Read execution APIs
- Read approval continuation
- Read readiness logic
- Inspect existing Supabase automation tables
- Inspect RLS policies and indexes
- Map stored automation steps to the execution engine
- Determine the difference between `/api/automation` and `/api/automations`
- Identify draft, publication, and versioning gaps

No migration or builder contract will be written before this audit is complete.

## 16C — Typed workflow graph contract

Create strict contracts for:

- Workflow graph
- Workflow node
- Workflow edge
- Node position
- Trigger nodes
- Action nodes
- Condition nodes
- Branch nodes
- Delay nodes
- Approval nodes
- Integration-action nodes
- Node configuration
- Validation error
- Compilation result
- Graph version

Validation must detect:

- Missing trigger
- Unsupported trigger
- Orphan nodes
- Invalid edge endpoints
- Forbidden cycles
- Missing required input
- Invalid capability
- Missing connection
- Missing scope
- Invalid branch target
- Unsafe live action

## 16D — Workflow versioning and deployment schema

Implement only the missing database capabilities discovered during 16B:

- Editable draft
- Immutable published version
- Version number
- Graph checksum
- Optimistic concurrency
- Publication metadata
- Deployment state
- Rollback support
- Workspace ownership
- RLS policies
- Supporting indexes
- Audit timestamps

Requirements:

- Draft edits cannot mutate the active version
- Published versions must remain immutable
- Stale clients cannot overwrite newer work
- Users cannot access another workspace’s workflows

## 16E — Visual workflow canvas

Implement the visual builder with:

- Drag-and-drop nodes
- Connectable handles
- Directed edges
- Pan
- Zoom
- Fit to screen
- Grid or snap alignment
- Node selection
- Node movement
- Node deletion
- Node duplication
- Undo and redo
- Keyboard shortcuts
- Persistent node positions
- Loading state
- Empty state
- Error state
- Responsive desktop layout

A workflow must be creatable without editing JSON.

## 16F — Dynamic node catalog

Build the node catalog from existing registries and runtime manifests.

Initial trigger nodes:

- Manual
- Schedule
- Integration event
- Existing CRM events
- Existing AI task events
- Supported Gmail events
- Supported Google Calendar events

Initial logic nodes:

- Condition
- Branch
- Delay
- Human approval
- Data mapping
- Template resolution

Initial action nodes:

- Existing CRM actions
- Gmail send
- Gmail reply
- Gmail label operation
- Google Calendar create event
- Google Calendar update event
- Google Calendar cancel or delete event

Future providers must be addable through manifests instead of rebuilding the canvas.

## 16G — Node configuration panel

The selected node configuration panel will support:

- Node name
- Connection selection
- Capability selection
- Required input fields
- Optional input fields
- Template variables
- Scope requirements
- Approval requirement
- Retry policy
- Timeout
- Idempotency configuration
- Validation status
- Test or preview action

Gmail configuration:

- Recipient
- Subject
- Body
- Thread or reply data
- Label information where supported

Google Calendar configuration:

- Calendar ID
- Summary
- Description
- Start time
- End time
- Time zone
- Attendees
- Reminder configuration

## 16H — Connection, scope, and readiness enforcement

Each integration node must display and enforce:

- Selected workspace connection
- Provider
- Environment
- Connection status
- Readiness status
- Enabled capability
- Granted scopes
- Missing scopes
- Credential state
- Reauthorization requirement

Publishing must be blocked when:

- No connection is selected
- Connection is disconnected
- Connection is not operational
- Capability is disabled
- OAuth scope is missing
- Credentials are unavailable
- Live environment requirements are not satisfied

## 16I — Draft, autosave, publish, and rollback

Implement the workflow lifecycle:

- New
- Draft
- Validated
- Published
- Active
- Disabled
- Superseded

Features:

- Manual save
- Debounced autosave
- Saving indicator
- Saved indicator
- Dirty-state warning
- Version-conflict detection
- Server-side validation
- Publication confirmation
- Version history
- Disable workflow
- Rollback

## 16J — Deterministic workflow compiler

Compile the visual graph into the current automation-step format.

The compiler must:

- Establish deterministic step order
- Compile edge dependencies
- Compile condition branches
- Preserve template inputs
- Attach connection IDs
- Attach capability IDs
- Attach live or sandbox mode
- Attach approval policy
- Attach retry policy
- Generate stable idempotency fingerprints
- Reject unsupported graph structures

The same graph must always produce the same compiled workflow.

## 16K — Trigger activation and deployment

Support:

- Manual execution
- Scheduled execution
- Integration-event execution
- Existing internal event triggers
- Provider subscription-backed events

Deployment must:

- Activate required schedules
- Reuse existing provider subscriptions
- Prevent duplicate subscriptions
- Disable resources safely
- Record deployment failures
- Reconcile deployed resources with the published version

## 16L — Approval and continuation interface

Expose the existing approval backend through a proper interface:

- Pending approvals
- Workflow and run identity
- Provider
- Capability
- Redacted action summary
- Intended recipient or resource
- Approval expiration
- Approve
- Reject
- Rejection reason
- Continuation result

Secrets and tokens must never appear in approval data.

## 16M — Run inspector and operations

The run inspector will display:

- Run status
- Trigger
- Published workflow version
- Step timeline
- Step inputs with redaction
- Step outputs with redaction
- Approval state
- Attempt count
- Retry eligibility
- Provider request ID
- Correlation ID
- Duration
- Failure category
- Duplicate status
- External-side-effect evidence

Operator controls:

- Retry eligible step
- Continue approved run
- Reject pending action
- Cancel run
- Open integration logs
- Filter runs
- Copy safe diagnostic ID

## 16N — Repository-native acceptance

Permanent tests must live inside the repository.

Target commands:

- `npm run test:day16`
- `npm run test:day16:sandbox`
- `npm run test:day16:live`

Test coverage:

- Graph validation
- Deterministic compilation
- Draft persistence
- Publication
- Version conflict
- Rollback
- RLS isolation
- Missing connection
- Missing capability
- Missing scope
- Approval
- Rejection
- Duplicate suppression
- Retry classification
- Secret redaction
- Trigger deployment
- Zero-cost sandbox
- Controlled Gmail action
- Controlled Calendar action
- Run-inspector evidence

Normal acceptance must not require DevTools console scripts.

## 16O — Regression and GitHub checkpoint

Final gates:

- Targeted ESLint
- Complete lint
- Production build
- Migration verification
- RLS verification
- Secret scan
- Environment-file check
- Empty-file inspection
- `git diff --check`
- Builder UI acceptance
- Sandbox acceptance
- Controlled live acceptance
- Documentation update
- Commit
- Push
- Clean working tree

Expected final confirmation:

`DAY 16 J10 FLOW PRODUCTION WORKFLOW BUILDER PASSED.`

Expected commit title:

`Complete Day 16 production workflow builder`

# Day 16 definition of done

The CEO can visually:

1. Create a workflow
2. Add and connect nodes
3. Configure trigger, logic, approval, Gmail, and Calendar nodes
4. Select connected accounts
5. Validate the workflow
6. Save a draft
7. Publish a version
8. Execute safely in the sandbox
9. Approve controlled live actions
10. Inspect each execution step
11. Retry eligible failures
12. Disable the workflow
13. Roll back a version

No raw JSON editing or permanent DevTools script is required.

# Planned next phases

## Day 17 — Product activation and WhatsApp production

Day 17 begins with a mandatory CEO usability gate. J10 NEXUS must expose its
existing capabilities through a coherent, honest, working product surface
before another invisible infrastructure phase is accepted.

### 17A — Dashboard product activation

- Shared dashboard shell across non-canvas routes
- Correct sidebar and topbar positioning
- Mobile navigation
- Central typed navigation catalog
- Working links for every operational module
- Explicit `Building` state for unfinished modules
- Global module and operation search
- Working Ask J10 AI, Notifications, Profile, Settings, and Create controls
- Real workspace Activity page
- Real runtime-derived Notifications page
- Operational Settings hub
- Product-contract tests

CEO acceptance requires:

- No silent dead navigation item
- No topbar hidden beneath the sidebar
- Existing CRM, WhatsApp, Analytics, Integrations, Settings, AI Employees,
  Workflow, and Automation surfaces are reachable from navigation
- Activity loads signed-in workspace data
- Notifications show workflow approvals, failures, active runs, and completions
- Unfinished modules are visibly labeled instead of presented as completed

### 17B — WhatsApp Business production connector

- Meta application configuration
- WhatsApp Cloud API credentials
- Webhook verification
- Incoming message normalization
- Outgoing text, media, and template messages
- Conversation persistence
- Delivery-state tracking
- Automation triggers and actions
- Health, logs, analytics, and sandbox acceptance

## Day 18 — WhatsApp AI operations

- Customer support agent
- Sales agent
- Lead capture
- Follow-up
- Booking
- Appointment reminders
- Multilingual conversations
- Voice, image, and document handling
- Human handoff
- WhatsApp group-management foundation
