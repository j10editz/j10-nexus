import { afterEach, describe, expect, it } from "vitest";

const { requireDatabaseUrl } = require("../../scripts/lib/database-url.cjs");
const candidateNames = [
  "J10_SCRIPT_DATABASE_URL",
  "SUPABASE_PRODUCTION_DATABASE_URL",
  "SUPABASE_POOLER_URL",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
];
const originalValues = new Map(candidateNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of candidateNames) {
    const original = originalValues.get(name);
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

describe("database script connection loader", () => {
  it("fails closed when no configured URL exists", () => {
    for (const name of candidateNames) delete process.env[name];

    expect(() => requireDatabaseUrl({ loadEnv: false })).toThrow(
      "Database connection is not configured",
    );
  });

  it("accepts only a complete PostgreSQL URL from the environment", () => {
    process.env.J10_SCRIPT_DATABASE_URL = "https://not-a-postgres-url.example";
    expect(() => requireDatabaseUrl({ loadEnv: false })).toThrow("PostgreSQL credentials");

    process.env.J10_SCRIPT_DATABASE_URL = [
      "postgresql://",
      "script-user",
      ":",
      "fixture-password",
      "@localhost:5432/script_test",
    ].join("");
    expect(requireDatabaseUrl({ loadEnv: false })).toContain("localhost:5432/script_test");
  });
});
