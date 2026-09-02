import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260829_day16f_workflow_lifecycle.sql",
);
const sql = readFileSync(migrationPath, "utf8");

const runtimeHistoryMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260829_day16g_runtime_step_history_fk.sql",
);
const runtimeHistorySql = readFileSync(runtimeHistoryMigrationPath, "utf8");

const checksumSchemaMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260829_day16h_pgcrypto_checksum_schema.sql",
);
const checksumSchemaSql = readFileSync(checksumSchemaMigrationPath, "utf8");

describe("Workflow lifecycle migration contract", () => {
  it("is transactional and provides optimistic draft revision protection", () => {
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("save_automation_draft_graph");
    expect(sql).toContain("draft_revision <> p_expected_revision");
    expect(sql).toContain("errcode = '40001'");
  });

  it("creates immutable checksummed versions and a transactional rollback copy", () => {
    expect(sql).toContain("graph_checksum");
    expect(sql).toContain("extensions.digest");
    expect(sql).toContain("prevent_published_automation_version_mutation");
    expect(sql).toContain("rollback_automation_version_runtime");
    expect(sql).toContain("rollback_of_version_id");
    expect(sql).toContain("insert into public.automation_version_steps");
    expect(sql).toContain("delete from public.automation_steps");
  });

  it("keeps mutation RPCs unavailable to anonymous users", () => {
    expect(sql).toMatch(/revoke all[\s\S]+save_automation_draft_graph[\s\S]+from anon;/);
    expect(sql).toMatch(/revoke all[\s\S]+rollback_automation_version_runtime[\s\S]+from anon;/);
    expect(sql).toMatch(/grant execute[\s\S]+save_automation_draft_graph[\s\S]+to authenticated;/);
    expect(sql).toMatch(/grant execute[\s\S]+rollback_automation_version_runtime[\s\S]+to authenticated;/);
  });
});

describe("Workflow checksum schema migration contract", () => {
  it("is transactional and resolves pgcrypto through Supabase extensions", () => {
    expect(checksumSchemaSql.trimStart().startsWith("begin;")).toBe(true);
    expect(checksumSchemaSql.trimEnd().endsWith("commit;")).toBe(true);
    expect(checksumSchemaSql).toContain(
      "create extension if not exists pgcrypto with schema extensions",
    );
    expect(checksumSchemaSql).toContain(
      "extensions.digest",
    );
    expect(checksumSchemaSql).toContain(
      "'sha256'::text",
    );
  });

  it("replaces and verifies the checksum trigger function", () => {
    expect(checksumSchemaSql).toContain(
      "create or replace function public.set_automation_version_graph_checksum()",
    );
    expect(checksumSchemaSql).toContain(
      "set search_path = pg_catalog, public, auth, extensions",
    );
    expect(checksumSchemaSql).toContain(
      "pgcrypto SHA-256 checksum verification failed",
    );
  });
});

describe("Runtime-step history migration contract", () => {
  it("is transactional and allows historical runtime step references to clear", () => {
    expect(runtimeHistorySql.trimStart().startsWith("begin;")).toBe(true);
    expect(runtimeHistorySql.trimEnd().endsWith("commit;")).toBe(true);
    expect(runtimeHistorySql).toContain(
      "alter column automation_step_id drop not null",
    );
    expect(runtimeHistorySql).toContain(
      "references public.automation_steps(id)",
    );
    expect(runtimeHistorySql).toContain("on delete set null");
  });

  it("replaces only the run-step foreign key that targets live runtime steps", () => {
    expect(runtimeHistorySql).toContain(
      "'public.automation_run_steps'::regclass",
    );
    expect(runtimeHistorySql).toContain(
      "'public.automation_steps'::regclass",
    );
    expect(runtimeHistorySql).toContain(
      "'^FOREIGN KEY \\(automation_step_id\\)'",
    );
    expect(runtimeHistorySql).toContain(
      "automation_run_steps_automation_step_id_fkey",
    );
  });
});
