const postgres = require('postgres');
const url = 'postgresql://postgres.qtzhcnyxbjocfgimtvvm:IDESSINMEMENE@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require';
const sql = postgres(url, { ssl: 'require' });

async function test() {
  const fnDef = await sql`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc 
    WHERE proname = 'store_integration_credential_envelope'
  `;
  console.log('Function def:\n', fnDef[0]?.def);
  process.exit(0);
}
test().catch(err => {
  console.error(err);
  process.exit(1);
});
