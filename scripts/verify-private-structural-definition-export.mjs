#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const index = process.argv.indexOf("--input");
const file = index < 0 ? undefined : process.argv[index + 1];
if (!file) throw new Error("USAGE: --input <private-definition-export.sql>");
const text = readFileSync(file, "utf8");
if (!text.trim()) throw new Error("STRUCTURAL_DEFINITION_EXPORT_EMPTY");
if (/\b(?:cron\.schedule|cron\.unschedule|net\.http_post)\b/i.test(text)) {
  throw new Error("STRUCTURAL_DEFINITION_EXPORT_OPERATIONAL_CALL");
}
if (/(?:https?:\/\/[^\s/:@]+:[^\s@]+@|\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,})\b)/i.test(text)) {
  throw new Error("STRUCTURAL_DEFINITION_EXPORT_SECRET_LIKE_MATERIAL");
}
console.log(`STRUCTURAL_DEFINITION_EXPORT_VERIFIED sha256=${createHash("sha256").update(text).digest("hex")}`);
