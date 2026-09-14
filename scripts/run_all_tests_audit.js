const { execSync } = require("child_process");

const suites = [
  "test:regression",
  "test:workflow",
  "test:dashboard",
  "test:whatsapp",
  "test:ai",
  "test:billing",
  "test:revenue",
  "test:agency",
  "test:omnichannel",
  "test:governance",
  "test:knowledge",
  "test:marketing",
  "test:finance",
  "test:workforce",
  "test:website",
  "test:commerce",
  "test:crm",
  "test:inbox",
  "test:workspaces",
  "test:identity",
];

const results = [];

for (const suite of suites) {
  process.stdout.write(`Running ${suite}... `);
  try {
    const output = execSync(`npm run ${suite}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    results.push({ suite, status: "passed", output });
    console.log("PASS");
  } catch (err) {
    results.push({ suite, status: "failed", output: err.stdout + "\n" + err.stderr });
    console.log("FAIL");
  }
}

console.log("\n=======================================================");
console.log("             COMPLETE REPOSITORY TEST AUDIT             ");
console.log("=======================================================");
for (const r of results) {
  console.log(`- ${r.suite}: ${r.status.toUpperCase()}`);
}

const passedCount = results.filter((r) => r.status === "passed").length;
const failedCount = results.filter((r) => r.status === "failed").length;
console.log(`\nTotal Suites: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
