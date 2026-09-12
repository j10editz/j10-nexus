import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";

const [, , source, destination] = process.argv;
if (!source || !destination) {
  throw new Error("Usage: node scripts/stage-certification-migrations.mjs <source> <destination>");
}

const files = (await readdir(source, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

if (files.length === 0) throw new Error("No SQL migrations found for certification staging.");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

const mapped = new Set();
for (let index = 0; index < files.length; index += 1) {
  const original = files[index];
  const match = /^(\d{8})/.exec(original);
  if (!match) throw new Error(`Migration has no eight-digit date prefix: ${original}`);
  const version = `${match[1]}${String(index + 1).padStart(3, "0")}`;
  const staged = `${version}_${original.replace(/^\d+_/, "")}`;
  if (mapped.has(version)) throw new Error(`Duplicate staged migration version: ${version}`);
  mapped.add(version);
  await copyFile(join(source, original), join(destination, staged));
  console.log(`${original} -> ${staged}`);
}

const stagedFiles = (await readdir(destination)).filter((file) => file.endsWith(".sql"));
if (stagedFiles.length !== files.length) {
  throw new Error(`Certification migration staging omitted files (${stagedFiles.length}/${files.length}).`);
}
if (!stagedFiles.some((file) => file.endsWith("_stage1_lead_intake_foundation.sql"))) {
  throw new Error("20260925 Stage 1 migration is missing from certification staging.");
}
const final = stagedFiles.sort().at(-1);
if (!final?.endsWith("_stage1_lead_intake_foundation.sql")) {
  throw new Error(`Stage 1 migration must be last, received: ${final}`);
}
