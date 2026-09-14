const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

async function test() {
  const { data, error } = await supabase.rpc('get_integration_credential_envelope', {
    p_integration_id: 'f966061f-0003-4bbe-ae2b-e565ba9fd665'
  });
  console.log('RPC result:', { hasData: !!data, rowCount: data?.length, error });
}
test().catch(e => console.error(e));
