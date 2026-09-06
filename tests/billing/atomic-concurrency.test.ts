import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'node:crypto';

const TEST_DB_URL = process.env.J10_TEST_DATABASE_URL;

// Gate the entire test suite on the presence of the J10_TEST_DATABASE_URL
describe.runIf(TEST_DB_URL)('PostgreSQL Concurrency Certification (Independent Connections)', () => {
  let masterSql: postgres.Sql;
  let testOwnerUserId: string;
  let testWorkspaceIdA: string;
  let testWorkspaceIdB: string;

  beforeAll(async () => {
    // 1. Master connection for setup (using postgres.js with single connection and SSL)
    masterSql = postgres(TEST_DB_URL!, { max: 1, ssl: 'require' });

    // Ensure native Supabase auth.users has founder UUID to satisfy 20260915 foreign key
    const FOUNDER_UUID = '0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa';
    await masterSql`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES (${FOUNDER_UUID}, 'founder@j10nexus.com', '{}'::jsonb)
      ON CONFLICT DO NOTHING
    `;

    // 2. Read and apply the minimal test-only billing bootstrap sequence
    const bootstrapSteps = [
      { type: 'migration', file: '20260913_remote_tenant_activation.sql' },
      { type: 'migration', file: '20260915_identity_platform_roles_invitations.sql' },
      { type: 'fixture', file: 'tests/fixtures/billing-concurrency-bootstrap.sql' },
      { type: 'migration', file: '20260918_tier0g_saas_billing.sql' },
      { type: 'migration', file: '20260922_tier4_governed_ai_agent_platform.sql' },
      { type: 'migration', file: '20260924_align_channel_metrics_and_atomic_reservations.sql' }
    ];

    for (const step of bootstrapSteps) {
      const fullPath = step.type === 'migration' 
        ? path.join(process.cwd(), 'supabase/migrations', step.file)
        : path.join(process.cwd(), step.file);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`Bootstrap file not found at ${fullPath}`);
      }
      const sqlText = fs.readFileSync(fullPath, 'utf8');
      try {
        await masterSql.unsafe(sqlText);
      } catch (err: any) {
        console.error(`\n======================================================`);
        console.error(`[BOOTSTRAP FAILURE] Step: ${step.file}`);
        console.error(`Error: ${err.message || err}`);
        if (err.detail) console.error(`Detail: ${err.detail}`);
        if (err.hint) console.error(`Hint: ${err.hint}`);
        if (err.position) console.error(`Position: ${err.position}`);
        console.error(`======================================================\n`);
        throw new Error(`Bootstrap step ${step.file} failed: ${err.message || err}`);
      }
    }

    testOwnerUserId = randomUUID();
    testWorkspaceIdA = randomUUID();
    testWorkspaceIdB = randomUUID();

    // 3. Set service_role claim for native Supabase auth.jwt() on master connection
    await masterSql`SELECT set_config('request.jwt.claims', '{"role": "service_role"}', false)`;

    // 4. Provision a test user in auth.users to satisfy owner_user_id foreign key constraint
    await masterSql`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES (${testOwnerUserId}, ${'concurrency-test-' + testOwnerUserId + '@example.com'}, '{}'::jsonb)
      ON CONFLICT DO NOTHING
    `;

    // 5. Ensure workspaces exist with valid owner and brand
    await masterSql`
      INSERT INTO public.workspaces (id, name, slug, brand_name, owner_user_id) 
      VALUES (${testWorkspaceIdA}, 'Concurrency Test Workspace A', ${'concurrency-test-a-' + testWorkspaceIdA}, 'Test Brand A', ${testOwnerUserId}),
             (${testWorkspaceIdB}, 'Concurrency Test Workspace B', ${'concurrency-test-b-' + testWorkspaceIdB}, 'Test Brand B', ${testOwnerUserId})
      ON CONFLICT DO NOTHING
    `;

    // 6. Provision test workspace subscriptions
    await masterSql`
      INSERT INTO public.workspace_subscriptions (
        workspace_id, 
        status, 
        provenance, 
        monthly_message_limit, 
        messages_used_this_period,
        current_period_start,
        current_period_end
      ) VALUES (
        ${testWorkspaceIdA}, 'active', 'internal_grant', 10, 9, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days'
      ), (
        ${testWorkspaceIdB}, 'active', 'internal_grant', 100, 0, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days'
      )
      ON CONFLICT (workspace_id) DO UPDATE SET 
        messages_used_this_period = EXCLUDED.messages_used_this_period,
        monthly_message_limit = EXCLUDED.monthly_message_limit
    `;
  });

  afterAll(async () => {
    if (masterSql) {
      try {
        // Cleanup test data safely
        if (testWorkspaceIdA && testWorkspaceIdB) {
          await masterSql`DELETE FROM public.workspace_quota_reservations WHERE workspace_id IN (${testWorkspaceIdA}, ${testWorkspaceIdB})`;
          await masterSql`DELETE FROM public.workspace_subscriptions WHERE workspace_id IN (${testWorkspaceIdA}, ${testWorkspaceIdB})`;
          await masterSql`DELETE FROM public.workspaces WHERE id IN (${testWorkspaceIdA}, ${testWorkspaceIdB})`;
        }
        if (testOwnerUserId) {
          await masterSql`DELETE FROM auth.users WHERE id = ${testOwnerUserId}`;
        }
      } catch (cleanupErr) {
        console.warn('Non-fatal cleanup warning in afterAll:', cleanupErr);
      } finally {
        await masterSql.end();
      }
    }
  });

  // Helper to create an independent connection configured for service_role authentication
  const createIndependentConnection = async () => {
    const sql = postgres(TEST_DB_URL!, {
      max: 1, // dedicated 1 connection per instance
      ssl: 'require',
      onnotice: () => {}, // suppress notices
      transform: postgres.camel // helpful for JS mapping
    });
    // Configure session-level JWT claims for native Supabase auth.jwt()
    await sql`SELECT set_config('request.jwt.claims', '{"role": "service_role"}', false)`;
    return sql;
  };

  it('A. Simultaneous Quota Reservations (Race Condition Prevention)', async () => {
    // We have exactly $1.00 (or 1 unit) of budget left (limit 10, used 9).
    const connections = await Promise.all(
      Array.from({ length: 5 }, () => createIndependentConnection())
    );

    // Diagnostic assertion: Prove these connections are distinct PostgreSQL sessions
    const pids = await Promise.all(connections.map(async (sql) => {
      const res = await sql`SELECT pg_backend_pid() AS pid`;
      return res[0].pid;
    }));
    const uniquePids = new Set(pids);
    expect(uniquePids.size).toBe(connections.length);
    console.log(`[Diagnostic] 5 independent backend PIDs confirmed:`, pids);

    const reservationIds = Array.from({ length: 5 }, () => randomUUID());

    // Fire 5 simultaneous reservations requesting 1 unit each. Only ONE should succeed.
    const results = await Promise.allSettled(
      connections.map((sql, idx) => 
        sql`SELECT * FROM public.reserve_workspace_quota_atomic(
          ${testWorkspaceIdA}, 
          'ai_tokens', 
          1, 
          ${reservationIds[idx]}
        )`
      )
    );

    // Close independent connections
    await Promise.all(connections.map(sql => sql.end()));

    let successCount = 0;
    let failCount = 0;

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        const payload = res.value[0].reserveWorkspaceQuotaAtomic;
        if (payload.success) {
          successCount++;
        } else {
          failCount++;
          // Expect failure to be quota exceeded
          expect(payload.error).toContain('Monthly message quota exceeded');
        }
      } else {
        failCount++;
      }
    });

    // Exactly one must succeed, four must fail.
    expect(successCount).toBe(1);
    expect(failCount).toBe(4);

    // Verify final state is exactly 10 used.
    const finalSub = await masterSql`SELECT messages_used_this_period FROM public.workspace_subscriptions WHERE workspace_id = ${testWorkspaceIdA}`;
    expect(finalSub[0].messages_used_this_period).toBe(10);
  });

  it('B. Duplicate Reservation IDs (Idempotency)', async () => {
    const connections = await Promise.all([
      createIndependentConnection(),
      createIndependentConnection()
    ]);
    const idempotencyReservationId = randomUUID();

    // Fire 2 exact identical requests simultaneously
    const results = await Promise.allSettled([
      connections[0]`SELECT * FROM public.reserve_workspace_quota_atomic(${testWorkspaceIdB}, 'ai_tokens', 2, ${idempotencyReservationId})`,
      connections[1]`SELECT * FROM public.reserve_workspace_quota_atomic(${testWorkspaceIdB}, 'ai_tokens', 2, ${idempotencyReservationId})`
    ]);

    await Promise.all(connections.map(sql => sql.end()));

    const payloads = results.map(r => r.status === 'fulfilled' ? r.value[0].reserveWorkspaceQuotaAtomic : null);
    
    // One should be normal success, the other should be idempotent success
    const standardSuccess = payloads.find(p => p && p.success && !p.idempotent);
    const idempotentSuccess = payloads.find(p => p && p.success && p.idempotent);

    expect(standardSuccess).toBeDefined();
    expect(idempotentSuccess).toBeDefined();
    expect(idempotentSuccess.action).toBe('already_reserved');

    // Test conflict (different payload)
    const sql3 = await createIndependentConnection();
    const conflictResult = await sql3`SELECT * FROM public.reserve_workspace_quota_atomic(${testWorkspaceIdB}, 'ai_tokens', 5, ${idempotencyReservationId})`;
    await sql3.end();

    const conflictPayload = conflictResult[0].reserveWorkspaceQuotaAtomic;
    expect(conflictPayload.success).toBe(false);
    expect(conflictPayload.error).toContain('Idempotency conflict');
  });

  it('C. Settle/Release Races', async () => {
    const reservationId = randomUUID();
    
    // 1. Create a reservation for 5 units
    const setupSql = await createIndependentConnection();
    await setupSql`SELECT * FROM public.reserve_workspace_quota_atomic(${testWorkspaceIdB}, 'ai_tokens', 5, ${reservationId})`;
    await setupSql.end();

    const connections = await Promise.all([
      createIndependentConnection(),
      createIndependentConnection()
    ]);
    
    // 2. Fire settle and release simultaneously on the exact same reservation
    const results = await Promise.allSettled([
      connections[0]`SELECT * FROM public.settle_workspace_quota_atomic(${testWorkspaceIdB}, ${reservationId}, 3)`, // settle 3
      connections[1]`SELECT * FROM public.release_workspace_quota_atomic(${testWorkspaceIdB}, ${reservationId})`    // full release
    ]);

    await Promise.all(connections.map(sql => sql.end()));

    const payloads = results.map(r => {
      if (r.status === 'fulfilled') {
         return r.value[0].settleWorkspaceQuotaAtomic || r.value[0].releaseWorkspaceQuotaAtomic;
      }
      return null;
    });

    // Only one should succeed, the other should fail because the status is no longer 'reserved'
    const successCount = payloads.filter(p => p && p.success).length;
    expect(successCount).toBe(1);

    const failure = payloads.find(p => p && p.success === false);
    expect(failure).toBeDefined();
    expect(failure.error).toContain('cannot be'); // "Reservation cannot be settled/released from status..."
  });

  it('D. Tenant Isolation (No Artificial Bottlenecks)', async () => {
    const connections = await Promise.all([
      createIndependentConnection(),
      createIndependentConnection()
    ]);
    
    // We will reserve quota for A and B simultaneously.
    // Workspace A has 0 budget left from Test A, but we'll reset it to 0 used so it can succeed.
    await masterSql`UPDATE public.workspace_subscriptions SET messages_used_this_period = 0 WHERE workspace_id = ${testWorkspaceIdA}`;

    const resIdA = randomUUID();
    const resIdB = randomUUID();

    const start = Date.now();
    
    const results = await Promise.allSettled([
      connections[0]`SELECT * FROM public.reserve_workspace_quota_atomic(${testWorkspaceIdA}, 'ai_tokens', 1, ${resIdA})`,
      connections[1]`SELECT * FROM public.reserve_workspace_quota_atomic(${testWorkspaceIdB}, 'ai_tokens', 1, ${resIdB})`
    ]);

    const duration = Date.now() - start;

    await Promise.all(connections.map(sql => sql.end()));

    const payloads = results.map(r => r.status === 'fulfilled' ? r.value[0].reserveWorkspaceQuotaAtomic : null);
    
    // Both must succeed simultaneously
    expect(payloads[0].success).toBe(true);
    expect(payloads[1].success).toBe(true);

    console.log(`[Diagnostic] Tenant Isolation concurrent reservation duration: ${duration}ms`);
  });
});
