import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PRODUCTION_PROJECT_REF = "qtzhcnyxbjocfgimtvvm";
export const PRODUCTION_DATABASE_HOST = "db.qtzhcnyxbjocfgimtvvm.supabase.co";
export const ADOPTION_CUTOFF = "20261013";

export function assertProductionTarget(projectRef, hostname) {
  if (projectRef !== PRODUCTION_PROJECT_REF || hostname !== PRODUCTION_DATABASE_HOST) {
    throw new Error("TARGET_MISMATCH: legacy adoption is restricted to the approved Production project.");
  }
}

export function migrationVersions(migrationsDirectory) {
  const versions = readdirSync(migrationsDirectory)
    .map((name) => name.match(/^(\d+)_.*\.sql$/)?.[1])
    .filter((version) => version && version <= ADOPTION_CUTOFF)
    .sort();

  if (versions.length !== 45 || new Set(versions).size !== versions.length) {
    throw new Error("CANONICAL_MIGRATION_SET_INVALID: expected 45 unique versions through 20261013.");
  }
  return versions;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function normalizeManifest(manifest) {
  return stable(manifest);
}

export function fingerprint(manifest) {
  return createHash("sha256").update(JSON.stringify(normalizeManifest(manifest))).digest("hex");
}

function containsSecretLikeValue(value) {
  if (typeof value === "string") {
    return /(https?:\/\/[^\s/:@]+:[^\s@]+@|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,})\b)/.test(value);
  }
  if (Array.isArray(value)) return value.some(containsSecretLikeValue);
  return value && typeof value === "object" && Object.values(value).some(containsSecretLikeValue);
}

export function buildCanonicalManifestArtifact({ canonicalSourceSha, manifest, versions }) {
  if (!/^[0-9a-f]{40}$/i.test(canonicalSourceSha)) throw new Error("CANONICAL_SOURCE_SHA_INVALID");
  if (versions.length !== 45 || versions.at(-1) !== ADOPTION_CUTOFF) throw new Error("CANONICAL_MIGRATION_RANGE_INVALID");
  const artifact = normalizeManifest({
    artifactVersion: 1,
    purpose: "disposable-supabase-canonical-schema-manifest",
    canonicalSourceSha,
    certifiedMigrationRange: { from: versions[0], through: ADOPTION_CUTOFF },
    migrationVersions: versions,
    normalizedSchemaManifest: normalizeManifest(manifest),
    normalizedSchemaFingerprint: fingerprint(manifest),
  });
  if (containsSecretLikeValue(artifact)) throw new Error("CANONICAL_MANIFEST_SECRET_LIKE_MATERIAL");
  return { ...artifact, sha256: createHash("sha256").update(JSON.stringify(artifact)).digest("hex") };
}

export function compareManifests(canonical, candidate) {
  const canonicalFingerprint = fingerprint(canonical);
  const candidateFingerprint = fingerprint(candidate);
  return {
    equal: canonicalFingerprint === candidateFingerprint,
    canonicalFingerprint,
    candidateFingerprint,
  };
}

export function parseSupabaseQueryOutput(raw) {
  const starts = [];
  for (let index = raw.indexOf("{"); index >= 0; index = raw.indexOf("{", index + 1)) starts.push(index);
  for (const start of starts.reverse()) {
    const end = raw.lastIndexOf("}");
    if (end < start) continue;
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed.rows)) return parsed;
      if (Array.isArray(parsed.data)) return { rows: parsed.data };
      if (Array.isArray(parsed.result)) return { rows: parsed.result };
      if (Object.hasOwn(parsed, "manifest")) return { rows: [parsed] };
    } catch {
      // The CLI may print setup metadata before the final JSON result envelope.
    }
  }
  const arrayStart = raw.lastIndexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd >= arrayStart) {
    try {
      const rows = JSON.parse(raw.slice(arrayStart, arrayEnd + 1));
      if (Array.isArray(rows)) return { rows };
    } catch {
      // Preserve a single fail-closed parse error below.
    }
  }
  throw new Error("SUPABASE_QUERY_OUTPUT_INVALID");
}

export function buildCertificationReport({ canonicalCommit, generatedAt, manifest, invariants, targetProjectRef }) {
  const failed = invariants.filter((invariant) => invariant.count !== 0 || invariant.status !== "pass");
  return normalizeManifest({
    reportVersion: 1,
    purpose: "legacy-production-supabase-ledger-adoption",
    targetProjectRef,
    canonicalCommit,
    certifiedMigrationRange: { from: "20260820", through: ADOPTION_CUTOFF },
    normalizedSchemaFingerprint: fingerprint(manifest),
    invariants: invariants.map(({ name, count, status }) => ({ name, count, status })),
    result: failed.length === 0 ? "pass" : "fail",
    generatedAt,
  });
}

export const schemaManifestSql = `
SELECT jsonb_build_object(
  'relations', COALESCE((SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'name', c.relname, 'kind', c.relkind, 'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity) ORDER BY n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')),'[]'::jsonb),
  'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object('table', c.relname, 'name', a.attname, 'type', pg_catalog.format_type(a.atttypid,a.atttypmod), 'notNull', a.attnotnull, 'default', pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped AND NOT (c.relname='workspace_subscriptions' AND a.attname='user_id')),'[]'::jsonb),
  'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid,true),'validated',con.convalidated) ORDER BY c.relname,con.conname) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),'[]'::jsonb),
  'indexes', COALESCE((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',i.relname,'definition',pg_get_indexdef(i.oid)) ORDER BY c.relname,i.relname) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),'[]'::jsonb),
  'types', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.typname,'kind',t.typtype,'definition',pg_catalog.format_type(t.oid,NULL)) ORDER BY t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d','c')),'[]'::jsonb),
  'functions', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),'language',l.lanname,'securityDefiner',p.prosecdef,'config',COALESCE(array_to_string(p.proconfig,','),''),'definitionHash',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public'),'[]'::jsonb),
  'triggers', COALESCE((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',tg.tgname,'definition',pg_get_triggerdef(tg.oid,true)) ORDER BY c.relname,tg.tgname) FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT tg.tgisinternal),'[]'::jsonb),
  'policies', COALESCE((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',pol.polname,'command',pol.polcmd,'roles',ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(pol.polroles) ORDER BY rolname),'using',pg_get_expr(pol.polqual,pol.polrelid),'check',pg_get_expr(pol.polwithcheck,pol.polrelid)) ORDER BY c.relname,pol.polname) FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),'[]'::jsonb),
  'grants', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind','table','object',table_name,'grantee',grantee,'privilege',privilege_type) ORDER BY table_name,grantee,privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public'),'[]'::jsonb),
  'extensions', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),'[]'::jsonb)
) AS manifest;`;

export const invariantSql = `
SELECT 'unresolved_workspace_ownership' AS name, count(*)::bigint AS count FROM public.workspaces w LEFT JOIN auth.users u ON u.id=w.owner_user_id WHERE w.owner_user_id IS NULL OR u.id IS NULL
UNION ALL SELECT 'broken_workspace_memberships', count(*)::bigint FROM public.workspace_memberships m LEFT JOIN public.workspaces w ON w.id=m.workspace_id LEFT JOIN auth.users u ON u.id=m.user_id WHERE w.id IS NULL OR u.id IS NULL
UNION ALL SELECT 'cross_workspace_integration_credentials', count(*)::bigint FROM public.integration_credentials c JOIN public.integrations i ON i.id=c.integration_id WHERE c.workspace_id IS DISTINCT FROM i.workspace_id
UNION ALL SELECT 'duplicate_provider_bindings', count(*)::bigint FROM (SELECT provider, external_account_id FROM public.integrations WHERE external_account_id IS NOT NULL GROUP BY provider, external_account_id HAVING count(*)>1) duplicates
UNION ALL SELECT 'unresolved_tenant_backfills', count(*)::bigint FROM (SELECT workspace_id FROM public.integrations UNION ALL SELECT workspace_id FROM public.integration_credentials UNION ALL SELECT workspace_id FROM public.contacts UNION ALL SELECT workspace_id FROM public.ai_tasks UNION ALL SELECT workspace_id FROM public.automation_runs UNION ALL SELECT workspace_id FROM public.inbox_messages) tenant_rows WHERE workspace_id IS NULL
UNION ALL SELECT 'invalid_integration_credentials', count(*)::bigint FROM public.integration_credentials WHERE encrypted_payload IS NULL OR initialization_vector IS NULL OR authentication_tag IS NULL OR algorithm <> 'aes-256-gcm' OR key_version < 1
UNION ALL SELECT 'duplicate_idempotency_keys', count(*)::bigint FROM (SELECT workspace_id,idempotency_key FROM public.inbox_messages WHERE idempotency_key IS NOT NULL GROUP BY workspace_id,idempotency_key HAVING count(*)>1 UNION ALL SELECT workspace_id,idempotency_key FROM public.lead_intakes GROUP BY workspace_id,idempotency_key HAVING count(*)>1 UNION ALL SELECT workspace_id,idempotency_key FROM public.integration_action_executions GROUP BY workspace_id,idempotency_key HAVING count(*)>1) duplicates
UNION ALL SELECT 'invalid_subscription_states', count(*)::bigint FROM public.workspace_subscriptions WHERE status NOT IN ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired') OR provenance NOT IN ('stripe','trial','internal_grant','none');`;

export function canonicalCommit(repoRoot) {
  return readFileSync(resolve(repoRoot, '.git', 'refs', 'heads', 'main'), 'utf8').trim();
}
