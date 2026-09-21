import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

function redact(value) {
  return String(value ?? "")
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/(access[_-]?token|api[_-]?key|password)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]");
}

export function resolveNpxInvocation({ platform = process.platform, execPath = process.execPath, exists = existsSync } = {}) {
  if (platform !== "win32") return { command: "npx", prefix: ["--no-install", "supabase"] };
  const npxCli = resolve(dirname(execPath), "node_modules", "npm", "bin", "npx-cli.js");
  if (!exists(npxCli)) throw new Error("SUPABASE_CLI_UNAVAILABLE: Windows npm CLI shim was not found.");
  return { command: execPath, prefix: [npxCli, "--no-install", "supabase"] };
}

function invoke(command, args, options, spawn = spawnSync) {
  const result = spawn(command, args, { cwd: options.cwd, input: options.input, encoding: "utf8", shell: false, windowsHide: true });
  if (result.error?.code === "ENOENT") return undefined;
  if (result.error) throw new Error(`SUPABASE_CLI_SPAWN_FAILED: ${redact(result.error.message)}`);
  if (result.status !== 0) throw new Error(`SUPABASE_CLI_FAILED exit=${result.status}: ${redact(result.stderr).slice(0, 500)}`);
  if (!String(result.stdout ?? "").trim()) throw new Error("SUPABASE_CLI_EMPTY_OUTPUT");
  return String(result.stdout);
}

export function runSupabaseCli({ args, cwd, sql, spawn = spawnSync, platform = process.platform, execPath = process.execPath, exists = existsSync }) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new Error("SUPABASE_CLI_ARGUMENTS_INVALID");
  const input = sql === undefined ? undefined : Buffer.from(sql, "utf8");
  if (sql !== undefined && input.length === 0) throw new Error("SUPABASE_SQL_EMPTY");
  const direct = invoke("supabase", args, { cwd, input }, spawn);
  if (direct !== undefined) return direct;
  const fallback = resolveNpxInvocation({ platform, execPath, exists });
  return invoke(fallback.command, [...fallback.prefix, ...args], { cwd, input }, spawn);
}

export function runSupabaseQuery({ args, sql, ...options }) {
  return runSupabaseCli({ ...options, args, sql });
}
