const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CANDIDATES = [
  "J10_SCRIPT_DATABASE_URL",
  "SUPABASE_PRODUCTION_DATABASE_URL",
  "SUPABASE_POOLER_URL",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
];

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (name && value && !process.env[name]) process.env[name] = value;
  }
}

function loadProjectEnv() {
  loadEnvFile(path.resolve(__dirname, "..", "..", ".env.local"));
}

function requireDatabaseUrl(options = {}) {
  if (options.loadEnv !== false) loadProjectEnv();

  const candidates = options.candidates || DEFAULT_CANDIDATES;
  const value = candidates
    .map((name) => process.env[name]?.trim())
    .find(Boolean);

  if (!value) {
    throw new Error(
      `Database connection is not configured. Set one of: ${candidates.join(", ")}.`,
    );
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Database connection must be a valid PostgreSQL URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password
  ) {
    throw new Error("Database connection must include PostgreSQL credentials and a hostname.");
  }

  return value;
}

module.exports = { loadProjectEnv, requireDatabaseUrl };
