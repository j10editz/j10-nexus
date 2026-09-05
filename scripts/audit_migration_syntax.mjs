import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260916_global_tenantization_launch_integrity.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

const errors = [];
const warnings = [];

// 1. Check quote and paren balance
let inSingleQuote = false;
let inDollarQuote = false;
let dollarTag = "";
let parenDepth = 0;
let lineNum = 1;

for (let i = 0; i < sql.length; i++) {
  const ch = sql[i];
  if (ch === "\n") lineNum++;

  if (!inDollarQuote && !inSingleQuote && ch === "'") {
    inSingleQuote = true;
  } else if (inSingleQuote && ch === "'") {
    if (sql[i + 1] === "'") {
      i++;
    } else {
      inSingleQuote = false;
    }
  } else if (!inSingleQuote && ch === "$") {
    const match = sql.slice(i).match(/^\$([a-zA-Z0-9_]*)\$/);
    if (match) {
      if (!inDollarQuote) {
        inDollarQuote = true;
        dollarTag = match[0];
        i += match[0].length - 1;
      } else if (sql.slice(i, i + dollarTag.length) === dollarTag) {
        inDollarQuote = false;
        i += dollarTag.length - 1;
      }
    }
  } else if (!inSingleQuote && !inDollarQuote) {
    if (ch === "(") parenDepth++;
    if (ch === ")") {
      parenDepth--;
      if (parenDepth < 0) {
        errors.push(`Extra closing parenthesis at character ${i} (approx line ${lineNum})`);
        parenDepth = 0;
      }
    }
  }
}

if (inSingleQuote) errors.push("Unclosed single quote detected.");
if (inDollarQuote) errors.push(`Unclosed dollar quote ${dollarTag} detected.`);
if (parenDepth !== 0) errors.push(`Unbalanced parentheses detected. Depth remaining: ${parenDepth}`);

// 2. Check all DROP POLICY statements
const lines = sql.split("\n");
lines.forEach((line, idx) => {
  const trimmed = line.trim();
  if (trimmed.toUpperCase().startsWith("DROP POLICY")) {
    if (!trimmed.endsWith(";")) {
      errors.push(`Line ${idx + 1}: DROP POLICY statement does not terminate with semicolon: "${trimmed}"`);
    }
    const upper = trimmed.toUpperCase();
    if (upper.includes(" FOR SELECT") || upper.includes(" FOR INSERT") || upper.includes(" FOR UPDATE") || upper.includes(" FOR DELETE") || upper.includes(" FOR ALL")) {
      errors.push(`Line ${idx + 1}: DROP POLICY statement contains invalid FOR clause: "${trimmed}"`);
    }
    if (upper.includes(" USING (") || upper.includes(" WITH CHECK (")) {
      errors.push(`Line ${idx + 1}: DROP POLICY statement contains invalid USING or WITH CHECK clause: "${trimmed}"`);
    }
  }
});

// 3. Check all CREATE POLICY statements
let inCreatePolicy = false;
let createPolicyBuffer = "";
let createPolicyStartLine = 0;

lines.forEach((line, idx) => {
  const trimmed = line.trim();
  if (trimmed.toUpperCase().startsWith("CREATE POLICY")) {
    inCreatePolicy = true;
    createPolicyBuffer = trimmed;
    createPolicyStartLine = idx + 1;
  } else if (inCreatePolicy) {
    createPolicyBuffer += " " + trimmed;
  }

  if (inCreatePolicy && trimmed.endsWith(";")) {
    inCreatePolicy = false;
    const policyUpper = createPolicyBuffer.toUpperCase();
    if (!policyUpper.includes(" ON ")) {
      errors.push(`Line ${createPolicyStartLine}: CREATE POLICY missing ON clause: "${createPolicyBuffer}"`);
    }
    if (!policyUpper.includes(" USING ") && !policyUpper.includes(" WITH CHECK ")) {
      warnings.push(`Line ${createPolicyStartLine}: CREATE POLICY lacks both USING and WITH CHECK: "${createPolicyBuffer}"`);
    }
    createPolicyBuffer = "";
  }
});

console.log("Syntax Audit Results for 20260916_global_tenantization_launch_integrity.sql:");
console.log(`Total Errors: ${errors.length}`);
console.log(`Total Warnings: ${warnings.length}`);
if (errors.length > 0) {
  console.log("\nERRORS:");
  errors.forEach((e) => console.log(` - ${e}`));
}
if (warnings.length > 0) {
  console.log("\nWARNINGS:");
  warnings.forEach((w) => console.log(` - ${w}`));
}
