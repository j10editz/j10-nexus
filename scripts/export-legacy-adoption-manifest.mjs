#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildCanonicalManifestArtifact, migrationVersions, parseSupabaseQueryOutput, schemaManifestSql } from "./lib/legacy-production-adoption.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex === -1 ? undefined : process.argv[outputIndex + 1];
const artifactOutputIndex = process.argv.indexOf("--artifact-output");
const artifactOutput = artifactOutputIndex === -1 ? undefined : process.argv[artifactOutputIndex + 1];
const sourceShaIndex = process.argv.indexOf("--source-sha");
const sourceSha = sourceShaIndex === -1 ? process.env.GITHUB_SHA : process.argv[sourceShaIndex + 1];

if (!output) {
  console.error("USAGE: --output <access-controlled-manifest.json>");
  process.exit(1);
}

try {
  const options = {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  };
  let raw;
  try {
    raw = execFileSync("supabase", ["db", "query", "--local", "--output", "json", schemaManifestSql], options);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    raw = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--no-install", "supabase", "db", "query", "--local", "--output", "json", schemaManifestSql], { ...options, shell: process.platform === "win32" });
  }
  const parsed = parseSupabaseQueryOutput(raw);
  const manifest = parsed.rows?.[0]?.manifest;
  if (!manifest) throw new Error("CANONICAL_MANIFEST_UNAVAILABLE");
  const absoluteOutput = resolve(repoRoot, output);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify({ manifest }, null, 2)}\n`, { mode: 0o600 });
  if (artifactOutput) {
    const versions = migrationVersions(resolve(repoRoot, "supabase", "migrations"));
    const artifact = buildCanonicalManifestArtifact({ canonicalSourceSha: sourceSha, manifest, versions });
    const absoluteArtifactOutput = resolve(repoRoot, artifactOutput);
    mkdirSync(dirname(absoluteArtifactOutput), { recursive: true });
    writeFileSync(absoluteArtifactOutput, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
    console.log(`CANONICAL_MANIFEST_ARTIFACT_EXPORTED sha256=${artifact.sha256}`);
  }
  console.log("CANONICAL_MANIFEST_EXPORTED");
} catch (error) {
  console.error(error instanceof Error ? error.message : "CANONICAL_MANIFEST_EXPORT_FAILED");
  process.exit(1);
}
