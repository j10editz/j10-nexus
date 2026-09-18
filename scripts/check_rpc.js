const { requireDatabaseUrl } = require("./lib/database-url.cjs");
const postgres = require('postgres');
const url = requireDatabaseUrl();
const sql = postgres(url, { ssl: 'require', connect_timeout: 10 });

async function test() {
  const fnDef = await sql`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc 
    WHERE proname = 'get_integration_credential_envelope'
  `;
  console.log('Function def:\n', fnDef[0]?.def);
  process.exit(0);
}
test().catch(err => {
  console.error(err);
  process.exit(1);
});
