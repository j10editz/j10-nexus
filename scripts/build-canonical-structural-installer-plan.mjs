#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hydrateInstallerPlan } from "./lib/structural-reconciliation-installer.mjs";

const root = resolve(import.meta.dirname, "..");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const input = argument("--plan");
const definitions = argument("--definitions");
const output = argument("--output");
if (!input || !definitions || !output) throw new Error("USAGE: --plan <private-plan.json> --definitions <private.sql> --output <private-installer-plan.json>");

const hydrated = hydrateInstallerPlan(
  JSON.parse(readFileSync(resolve(root, input), "utf8")),
  readFileSync(resolve(root, definitions), "utf8"),
);
mkdirSync(dirname(resolve(root, output)), { recursive: true });
writeFileSync(resolve(root, output), `${JSON.stringify(hydrated, null, 2)}\n`, { mode: 0o600 });
console.log(`CANONICAL_STRUCTURAL_INSTALLER_PLAN_BUILT relations=${hydrated.relations.length} functions=${hydrated.functions.length}`);
