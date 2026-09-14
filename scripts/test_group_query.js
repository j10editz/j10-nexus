const postgres = require('postgres');
const url = 'postgresql://postgres.qtzhcnyxbjocfgimtvvm:IDESSINMEMENE@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require';
const sql = postgres(url, { ssl: 'require' });

async function test() {
  const metaA = { bot_id: "8687561980", bot_username: "j10_nexus_leads_bot", vip_group_chat_id: "-1002222222221" };
  await sql`
    UPDATE integrations 
    SET metadata = ${sql.json(metaA)}
    WHERE provider = 'telegram' AND workspace_id = 'ce593364-2aaf-47e4-a1d2-2272775747c4'
  `;

  const rows = await sql`
    SELECT id, workspace_id, metadata->>'vip_group_chat_id' as group_id
    FROM integrations 
    WHERE provider = 'telegram' AND workspace_id = 'ce593364-2aaf-47e4-a1d2-2272775747c4'
  `;
  console.log('Fixed result:', rows);
  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
