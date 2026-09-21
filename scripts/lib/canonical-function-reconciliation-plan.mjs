import { createHash } from "node:crypto";

// These are the exact public functions absent from the ledgerless Production
// manifest.  The list is deliberately closed: adding a new executable
// definition requires a source review and a new certification fixture.
export const REQUIRED_FUNCTION_REGPROCEDURES = Object.freeze([
  "public.prevent_automation_version_step_mutation()",
  "public.prevent_published_automation_version_mutation()",
  "public.set_automation_version_updated_at()",
  "public.set_automation_version_graph_checksum()",
  "public.mark_integration_credential_used(uuid)",
  "public.get_integration_credential_envelope(uuid)",
  "public.set_integration_updated_at()",
  "public.delete_integration_credential(uuid)",
  "public.store_integration_credential_envelope(uuid,text,text,text,text,integer)",
  "public.set_integration_credential_updated_at()",
  "public.publish_automation_version_runtime(uuid,uuid,boolean)",
  "public.save_automation_draft_graph(uuid,jsonb,text,integer)",
  "public.rollback_automation_version_runtime(uuid,uuid,boolean)",
  "public.trigger_whatsapp_ai_worker_cron(text,text)",
  "public.trigger_telegram_ai_worker_cron(text,text)",
  "public.complete_whatsapp_ai_job(uuid,uuid,text)",
  "public.consume_whatsapp_connection_session(text,uuid,uuid)",
  "public.is_workspace_member(uuid)",
  "public.is_platform_founder(uuid)",
  "public.accept_workspace_invitation(text,uuid,text)",
  "public.check_payment_checkout_mutation()",
  "public.check_last_active_owner()",
  "public.claim_whatsapp_ai_jobs(uuid,integer,integer)",
  "public.check_payment_ledger_immutability()",
  "public.fail_whatsapp_ai_job(uuid,uuid,text,boolean)",
  "public.has_workspace_role(uuid,text[])",
  "public.owns_workspace(uuid)",
  "public.activate_founders3_enrollment_atomic(uuid,text,text,text,timestamp with time zone,timestamp with time zone)",
  "public.handle_new_user_profile()",
  "public.is_platform_admin(uuid)",
  "public.provision_workspace(text,text,text,text,text,text)",
]);

// The executed definition is authoritative. These source paths make the plan
// reviewable and pin every definition to versioned repository history.
export const FUNCTION_SOURCE_MIGRATIONS = Object.freeze({
  "public.prevent_automation_version_step_mutation()": "20260826_day16c_automation_versions.sql",
  "public.prevent_published_automation_version_mutation()": "20260829_day16f_workflow_lifecycle.sql",
  "public.set_automation_version_updated_at()": "20260826_day16c_automation_versions.sql",
  "public.set_automation_version_graph_checksum()": "20260829_day16f_workflow_lifecycle.sql",
  "public.mark_integration_credential_used(uuid)": "20260820_day14b_integrations.sql",
  "public.get_integration_credential_envelope(uuid)": "20261013_integration_credential_envelope_reconciliation.sql",
  "public.set_integration_updated_at()": "20260820_day14b_integrations.sql",
  "public.delete_integration_credential(uuid)": "20260820_day14b_integrations.sql",
  "public.store_integration_credential_envelope(uuid,text,text,text,text,integer)": "20260917_tier0f_runtime_tenant_certification.sql",
  "public.set_integration_credential_updated_at()": "20260820_day14b_integrations.sql",
  "public.publish_automation_version_runtime(uuid,uuid,boolean)": "20260827_day16e_atomic_runtime_switch.sql",
  "public.save_automation_draft_graph(uuid,jsonb,text,integer)": "20260829_day16f_workflow_lifecycle.sql",
  "public.rollback_automation_version_runtime(uuid,uuid,boolean)": "20260829_day16f_workflow_lifecycle.sql",
  "public.trigger_whatsapp_ai_worker_cron(text,text)": "20261006_whatsapp_ai_cron_reconciliation.sql",
  "public.trigger_telegram_ai_worker_cron(text,text)": "20261001_telegram_cron_reconciliation.sql",
  "public.complete_whatsapp_ai_job(uuid,uuid,text)": "20261005_whatsapp_ai_durable_outbox.sql",
  "public.consume_whatsapp_connection_session(text,uuid,uuid)": "20261007_whatsapp_embedded_signup.sql",
  "public.is_workspace_member(uuid)": "20260913_remote_tenant_activation.sql",
  "public.is_platform_founder(uuid)": "20260915_identity_platform_roles_invitations.sql",
  "public.accept_workspace_invitation(text,uuid,text)": "20260916_global_tenantization_launch_integrity.sql",
  "public.check_payment_checkout_mutation()": "20260913_remote_tenant_activation.sql",
  "public.check_last_active_owner()": "20260915_identity_platform_roles_invitations.sql",
  "public.claim_whatsapp_ai_jobs(uuid,integer,integer)": "20261005_whatsapp_ai_durable_outbox.sql",
  "public.check_payment_ledger_immutability()": "20260913_remote_tenant_activation.sql",
  "public.fail_whatsapp_ai_job(uuid,uuid,text,boolean)": "20261005_whatsapp_ai_durable_outbox.sql",
  "public.has_workspace_role(uuid,text[])": "20260913_remote_tenant_activation.sql",
  "public.owns_workspace(uuid)": "20260913_remote_tenant_activation.sql",
  "public.activate_founders3_enrollment_atomic(uuid,text,text,text,timestamp with time zone,timestamp with time zone)": "20261004_founders3_strict_state_and_hash_isolation.sql",
  "public.handle_new_user_profile()": "20260915_identity_platform_roles_invitations.sql",
  "public.is_platform_admin(uuid)": "20260915_identity_platform_roles_invitations.sql",
  "public.provision_workspace(text,text,text,text,text,text)": "20260915_identity_platform_roles_invitations.sql",
});

export const FORBIDDEN_EXECUTION_TOKENS = Object.freeze([
  "cron.schedule",
  "cron.unschedule",
  "net.http_post",
  "pg_net",
]);

export const RECONCILIATION_RELATIONS = Object.freeze([
  "automation_steps", "automation_run_steps", "subscription_events_ledger",
  "crm_contacts_legacy_archive_tier0f", "employees", "integrations",
  "integration_credentials", "integration_webhook_endpoints",
  "integration_webhook_events", "integration_action_executions",
  "integration_operation_logs", "integration_provider_subscriptions",
  "integration_status_history",
]);

const SECRET_PATTERN = /(?:https?:\/\/[^\s/:@]+:[^\s@]+@|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,})\b)/i;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function classifyFunctionDefinition(definition) {
  const text = String(definition ?? "");
  return {
    containsSecretLikeMaterial: SECRET_PATTERN.test(text),
    operationalReferences: FORBIDDEN_EXECUTION_TOKENS.filter((token) => text.toLowerCase().includes(token)),
  };
}

/**
 * Public attestations never contain executable definitions.  The private CI
 * plan may contain them only when its secret scan is clean, and is retained as
 * an access-controlled Actions artifact rather than committed or published.
 */
export function publicFunctionAttestation(functions) {
  return functions.map(({ regprocedure, identity, owner, searchPath, securityDefiner, grants, definitionHash, dependencies, classification }) => ({
    regprocedure,
    identity,
    owner,
    searchPath,
    securityDefiner,
    grants,
    definitionHash,
    dependencies,
    operationalReferences: classification.operationalReferences,
  }));
}

export function validateCanonicalFunctionPlan(functions) {
  if (!Array.isArray(functions) || functions.length !== REQUIRED_FUNCTION_REGPROCEDURES.length) {
    throw new Error("CANONICAL_FUNCTION_PLAN_INCOMPLETE");
  }
  const procedures = functions.map((entry) => entry.regprocedure);
  if (new Set(procedures).size !== procedures.length || REQUIRED_FUNCTION_REGPROCEDURES.some((required) => !procedures.includes(required))) {
    throw new Error("CANONICAL_FUNCTION_PLAN_PROCEDURE_MISMATCH");
  }
  for (const entry of functions) {
    if (entry.sourceMigration !== FUNCTION_SOURCE_MIGRATIONS[entry.regprocedure]) throw new Error("CANONICAL_FUNCTION_PLAN_SOURCE_MISMATCH");
    if (typeof entry.definition !== "string" || entry.definition.length === 0 || sha256(entry.definition) !== entry.definitionHash) {
      throw new Error("CANONICAL_FUNCTION_PLAN_FINGERPRINT_INVALID");
    }
    if (entry.classification?.containsSecretLikeMaterial) throw new Error("CANONICAL_FUNCTION_PLAN_SECRET_LIKE_MATERIAL");
  }
  return true;
}

export function buildStructuralDefinitionPlan({ sourceSha, migrationVersions, manifest, functions }) {
  if (!/^[a-f0-9]{40}$/i.test(sourceSha ?? "")) throw new Error("STRUCTURAL_PLAN_SOURCE_SHA_INVALID");
  if (!Array.isArray(migrationVersions) || migrationVersions.length !== 45 || migrationVersions.at(-1) !== "20261013") {
    throw new Error("STRUCTURAL_PLAN_MIGRATION_RANGE_INVALID");
  }
  validateCanonicalFunctionPlan(functions);
  const selected = (section, key = "table") => (manifest?.[section] ?? []).filter((entry) => RECONCILIATION_RELATIONS.includes(entry[key] ?? entry.object));
  const plan = {
    sourceSha,
    migrationVersions,
    relations: selected("relations", "name"),
    columns: selected("columns"),
    constraints: selected("constraints"),
    indexes: selected("indexes"),
    triggers: selected("triggers"),
    policies: selected("policies"),
    grants: selected("grants", "object"),
    functions,
  };
  return { ...plan, fingerprint: sha256(JSON.stringify(plan)) };
}
