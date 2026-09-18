import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "..", "..");
const trackedFiles = execFileSync("git", ["ls-files"], {
  cwd: repositoryRoot,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter((file) => /^(?:\.github\/workflows\/.+\.ya?ml|(app|components|lib|scripts|supabase|tests)\/.+\.(?:[cm]?[jt]sx?|sql))$/.test(file));

const literalPatterns = [
  /postgres(?:ql)?:\/\/[^\s'"`/:]+:[^\s'"`@]+@/i,
  /\bsb_secret_[A-Za-z0-9_-]{12,}\b/,
  /\bsk_live_[A-Za-z0-9_-]{12,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{12,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_-]{12,}\b/,
  /J10_INTEGRATION_ENCRYPTION_KEY\s*\|\|\s*["']/,
  /TELEGRAM_WEBHOOK_SECRET\s*\|\|\s*["']/,
];

describe("tracked-source credential guard", () => {
  it("contains no literal database credentials or live access tokens", () => {
    const violations = trackedFiles.filter((file) => {
      const source = readFileSync(resolve(repositoryRoot, file), "utf8");
      return literalPatterns.some((pattern) => pattern.test(source));
    });

    expect(violations, "literal credentials found in tracked source").toEqual([]);
  });
});
