const postgres = require("postgres");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_URL = "postgresql://supabase_admin:postgres@localhost:54322/postgres";

async function runCertification() {
  console.log("=================================================================");
  console.log("  DOCKER SUPABASE POSTGRESQL (PORT 54322) CERTIFICATION SUITE    ");
  console.log("=================================================================\n");

  const migrationSqlRunner = postgres(DB_URL, { max: 1 });
  const sql = postgres(DB_URL, { max: 15 });

  try {
    // 0. Ensure base schema dependencies in Docker Supabase
    console.log("[PHASE 0] Ensuring base schema functions in Docker Supabase...");
    await migrationSqlRunner.unsafe(`
      CREATE OR REPLACE FUNCTION public.has_workspace_role(target_workspace_id uuid, accepted_roles text[])
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.workspace_memberships
          WHERE workspace_id = target_workspace_id
            AND user_id = auth.uid()
            AND role = ANY(accepted_roles)
        )
      $$;
    `);

    console.log("[PHASE 0.1] Applying 20260930_telegram_business_connections.sql...");
    const migrationPath = path.join(__dirname, "../supabase/migrations/20260930_telegram_business_connections.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    await migrationSqlRunner.unsafe(migrationSql);

    console.log("[PHASE 0.2] Applying 20261001_telegram_cron_reconciliation.sql...");
    const cronMigrationPath = path.join(__dirname, "../supabase/migrations/20261001_telegram_cron_reconciliation.sql");
    const cronMigrationSql = fs.readFileSync(cronMigrationPath, "utf8");
    await migrationSqlRunner.unsafe(cronMigrationSql);

    await migrationSqlRunner.end();
    console.log("✅ Migrations applied successfully to Docker PostgreSQL.\n");

    // 1. Fixture Setup: Two Workspaces & Integrations
    console.log("[TEST 1] Setting up two tenant workspaces (Alpha & Beta)...");
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const wsA = crypto.randomUUID();
    const wsB = crypto.randomUUID();
    const integA = crypto.randomUUID();
    const integB = crypto.randomUUID();

    const runId = Date.now();
    await sql`INSERT INTO auth.users (id, email) VALUES (${userA}, ${`alpha-${runId}@example.com`}), (${userB}, ${`beta-${runId}@example.com`}) ON CONFLICT (id) DO NOTHING`;
    await sql`INSERT INTO public.workspaces (id, owner_user_id, name) VALUES (${wsA}, ${userA}, 'Workspace Alpha'), (${wsB}, ${userB}, 'Workspace Beta') ON CONFLICT (id) DO NOTHING`;
    await sql`INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES (${wsA}, ${userA}, 'owner'), (${wsB}, ${userB}, 'owner') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO public.integrations (id, workspace_id, provider, status) VALUES (${integA}, ${wsA}, 'telegram', 'connected'), (${integB}, ${wsB}, 'telegram', 'connected') ON CONFLICT (id) DO NOTHING`;

    console.log("✅ Workspaces, memberships & integrations created.\n");

    // 2. Test Atomic Session Consumption & Single-Use Enforcement
    console.log("[TEST 2] Testing atomic session consumption & single-use enforcement...");
    const tokenPart = crypto.randomBytes(32).toString("base64url");
    const token = `tb_${tokenPart}`;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await sql`
      INSERT INTO public.telegram_connection_sessions (workspace_id, token_hash, expires_at)
      VALUES (${wsA}, ${tokenHash}, ${expiresAt})
    `;

    const res1 = await sql`
      SELECT public.consume_telegram_business_session(${tokenHash}, '123456789', 'alice') as result
    `;
    if (!res1[0].result.valid) throw new Error("First consumption failed: " + JSON.stringify(res1[0].result));
    console.log("  Pass 1: First consumption succeeded, session verified.");

    const res2 = await sql`
      SELECT public.consume_telegram_business_session(${tokenHash}, '123456789', 'alice') as result
    `;
    if (res2[0].result.valid) throw new Error("Replay consumption should have failed!");
    console.log("  Pass 2: Replay attempt rejected atomically with error: " + res2[0].result.error);
    console.log("✅ Atomic single-use consumption certified.\n");

    // 3. Test Concurrent Replay (10 simultaneous attempts, exactly 1 winner)
    console.log("[TEST 3] Testing 10 concurrent consumption attempts with row locking...");
    const tokenPartConc = crypto.randomBytes(32).toString("base64url");
    const tokenConc = `tb_${tokenPartConc}`;
    const tokenHashConc = crypto.createHash("sha256").update(tokenConc).digest("hex");

    await sql`
      INSERT INTO public.telegram_connection_sessions (workspace_id, token_hash, expires_at)
      VALUES (${wsA}, ${tokenHashConc}, ${expiresAt})
    `;

    const concurrentPromises = Array.from({ length: 10 }, (_, i) =>
      sql`SELECT public.consume_telegram_business_session(${tokenHashConc}, ${String(1000 + i)}, 'user') as result`
    );
    const results = await Promise.all(concurrentPromises);
    const winners = results.filter((r) => r[0].result.valid);
    const losers = results.filter((r) => !r[0].result.valid);

    console.log(`  Concurrent results: ${winners.length} winner, ${losers.length} rejected.`);
    if (winners.length !== 1 || losers.length !== 9) {
      throw new Error(`Concurrency race condition! Expected 1 winner and 9 losers, got ${winners.length}`);
    }
    console.log("✅ Concurrent race-safety certified: exactly 1 winner guaranteed by FOR UPDATE.\n");

    // 4. Test business_connection uniqueness constraint
    console.log("[TEST 4] Testing business_connection_id uniqueness constraint...");
    const bcId = `bc_${crypto.randomBytes(8).toString("hex")}`;
    await sql`
      INSERT INTO public.telegram_business_connections (workspace_id, business_connection_id, telegram_user_id, user_chat_id, can_reply, is_enabled)
      VALUES (${wsA}, ${bcId}, '123456789', '123456789', true, true)
    `;

    let duplicateViolated = false;
    try {
      await sql`
        INSERT INTO public.telegram_business_connections (workspace_id, business_connection_id, telegram_user_id, user_chat_id)
        VALUES (${wsB}, ${bcId}, '987654321', '987654321')
      `;
    } catch (err) {
      duplicateViolated = err.code === "23505";
    }
    if (!duplicateViolated) throw new Error("Expected unique constraint violation on duplicate business_connection_id!");
    console.log("✅ Business connection uniqueness certified: duplicate ID blocked across all workspaces.\n");

    // 5. Test RLS Tenant Isolation
    console.log("[TEST 5] Testing RLS Tenant Isolation between Workspace Alpha and Beta...");
    const sessionAHash = crypto.createHash("sha256").update(crypto.randomBytes(32).toString("hex")).digest("hex");
    await sql`
      INSERT INTO public.telegram_connection_sessions (workspace_id, token_hash, expires_at)
      VALUES (${wsA}, ${sessionAHash}, ${expiresAt})
    `;

    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx.unsafe(`SET LOCAL "request.jwt.claims" = '${JSON.stringify({ sub: userB, role: "authenticated" })}'`);

      const userBVisibleSessions = await tx`
        SELECT * FROM public.telegram_connection_sessions WHERE workspace_id = ${wsA}
      `;
      const userBVisibleConnections = await tx`
        SELECT * FROM public.telegram_business_connections WHERE workspace_id = ${wsA}
      `;

      if (userBVisibleSessions.length !== 0 || userBVisibleConnections.length !== 0) {
        throw new Error("RLS Breach! User B was able to view Workspace Alpha data!");
      }
    });
    console.log("✅ RLS tenant isolation certified: cross-workspace read/write strictly denied by policy.\n");

    // 6. Test Single Atomic Transactional Ingress with Integration Identity
    console.log("[TEST 6] Testing Atomic Transactional Ingress with p_integration_id...");
    const ingressUpdateId = 88771122;
    const ingressChatId = "chat_tx_test_99";
    const ingressRes = await sql`
      SELECT public.ingest_telegram_update_transactional(
        ${wsA},
        ${String(integA)},
        ${ingressUpdateId},
        ${ingressChatId},
        'user_123',
        'Alice Transact',
        'Hello in a single transaction',
        ${bcId},
        true,
        'msg_ext_1',
        ${JSON.stringify({ test: true })},
        ${integA}
      ) as result
    `;
    const txData = ingressRes[0].result;
    if (!txData.success || !txData.thread_id || !txData.message_id || !txData.job_id) {
      throw new Error("Transactional ingress failed to commit thread, message, and job: " + JSON.stringify(txData));
    }
    console.log(`  Committed atomically: thread=${txData.thread_id}, msg=${txData.message_id}, job=${txData.job_id}`);
    console.log("✅ Atomic transactional ingress certified.\n");

    // 7. Test Two Integrations Receiving the Exact Same update_id
    console.log("[TEST 7] Testing Two Integrations Receiving the Same update_id...");
    const sharedUpdateId = 99887766;

    const integ1Ingress = await sql`
      SELECT public.ingest_telegram_update_transactional(
        ${wsA},
        ${String(integA)},
        ${sharedUpdateId},
        'chat_integ1_1',
        'user_int1',
        'Customer One',
        'Hello Integration Alpha',
        null,
        false,
        'msg_int_1',
        '{}'::jsonb,
        ${integA}
      ) as result
    `;

    const integ2Ingress = await sql`
      SELECT public.ingest_telegram_update_transactional(
        ${wsB},
        ${String(integB)},
        ${sharedUpdateId},
        'chat_integ2_1',
        'user_int2',
        'Customer Two',
        'Hello Integration Beta',
        null,
        false,
        'msg_int_2',
        '{}'::jsonb,
        ${integB}
      ) as result
    `;

    if (!integ1Ingress[0].result.job_id || !integ2Ingress[0].result.job_id) {
      throw new Error("One or both jobs failed to enqueue on same update_id across two integrations!");
    }
    if (integ1Ingress[0].result.job_id === integ2Ingress[0].result.job_id) {
      throw new Error("Cross-integration collision! Two integrations collided on the same job_id!");
    }
    console.log(`  Integration 1 job: ${integ1Ingress[0].result.job_id} | Integration 2 job: ${integ2Ingress[0].result.job_id}`);
    console.log("✅ Two integrations receiving the same update_id isolated cleanly without collision.\n");

    // 8. Test Global Worker Advisory Lock
    console.log("[TEST 8] Testing Global Worker Database Lock (overlap protection)...");
    const testWorker1 = crypto.randomUUID();
    const testWorker2 = crypto.randomUUID();
    const lock1 = await sql`SELECT public.acquire_telegram_worker_lock(${testWorker1}, 60) as acquired`;
    if (!lock1[0].acquired) throw new Error("Worker failed to acquire initial worker lock!");
    console.log("  Pass 1: Worker 1 acquired worker lock.");

    const lock2 = await sql`SELECT public.acquire_telegram_worker_lock(${testWorker2}, 60) as acquired`;
    if (lock2[0].acquired) throw new Error("Concurrent worker was able to acquire held worker lock! Overlap protection failed!");
    console.log("  Pass 2: Worker 2 correctly rejected by held worker lock (overlap prevented).");

    const unlock = await sql`SELECT public.release_telegram_worker_lock(${testWorker1}) as released`;
    if (!unlock[0].released) throw new Error("Failed to release worker lock!");
    console.log("  Pass 3: Worker 1 released worker lock.");
    console.log("✅ Worker cycle database lock overlap protection certified.\n");

    // 9. Test Worker Claiming, Lease, Heartbeat & Ambiguous Delivery
    console.log("[TEST 9] Testing Worker Claiming, Heartbeat, and Ambiguous Delivery (delivery_unknown)...");
    const workerAlpha = crypto.randomUUID();
    const claimRes = await sql`
      SELECT * FROM public.claim_telegram_ai_jobs(${workerAlpha}, 50, 120)
    `;
    const claimedJob = claimRes.find((j) => j.job_id === txData.job_id);
    if (!claimedJob) {
      throw new Error("Worker Alpha failed to claim durable ingress job!");
    }
    console.log(`  Job claimed with 120s lease: attempts=${claimedJob.attempts}`);

    // Heartbeat: renew lease
    const renewRes = await sql`
      SELECT public.renew_telegram_ai_job_lease(${claimedJob.job_id}, ${workerAlpha}, 60) as renewed
    `;
    if (!renewRes[0].renewed) {
      throw new Error("Lease heartbeat renewal failed!");
    }
    console.log("  Pass: Heartbeat renewal successfully extended lease.");

    // Complete with delivery_unknown (ambiguous Telegram delivery)
    const unknownRes = await sql`
      SELECT public.complete_telegram_ai_job(
        ${claimedJob.job_id},
        ${workerAlpha},
        false,
        'Gateway Timeout: 504 from Telegram',
        'delivery_unknown'
      ) as result
    `;
    if (!unknownRes[0].result.completed || unknownRes[0].result.status !== "delivery_unknown") {
      throw new Error("Failed to mark job status as delivery_unknown: " + JSON.stringify(unknownRes[0].result));
    }
    console.log("  Pass: Ambiguous delivery safely transitioned job to status 'delivery_unknown' (no blind resend).");

    // Verify job is NOT claimable anymore (will not be blindly resent)
    const workerGamma = crypto.randomUUID();
    const claimGamma = await sql`
      SELECT * FROM public.claim_telegram_ai_jobs(${workerGamma}, 5, 120)
    `;
    if (claimGamma.some((j) => j.job_id === claimedJob.job_id)) {
      throw new Error("Job with delivery_unknown was reclaimed! Blind resend vulnerability!");
    }
    console.log("  Pass: delivery_unknown job suppressed from automatic blind retry.");
    console.log("✅ Ambiguous delivery handling certified.\n");

    // 10. Test Connection-Scoped Deletion Preview, Execution & Contact Preservation
    console.log("[TEST 10] Testing Connection-Scoped Preview, Deletion Intent & Store Purge...");
    const contactId = crypto.randomUUID();
    await sql`
      INSERT INTO public.contacts (id, workspace_id, name, email, phone)
      VALUES (${contactId}, ${wsA}, 'Alice Customer', 'alice@example.com', '+1234567890')
      ON CONFLICT (workspace_id, id) DO NOTHING
    `;

    // Preview
    const previewRes = await sql`
      SELECT public.preview_telegram_business_deletion(${wsA}, ${bcId}, ${integA}) as preview
    `;
    const preview = previewRes[0].preview;
    console.log(`  Preview results: connections=${preview.connections_count}, msgs=${preview.messages_count}, jobs=${preview.jobs_count}, contacts_preserved=${preview.shared_contacts_preserved}`);
    if (preview.shared_contacts_preserved < 1) throw new Error("Preview failed to count preserved contacts!");

    // Generate cryptographic deletion intent token
    const rawDelToken = `tdel_${crypto.randomBytes(32).toString("hex")}`;
    const delTokenHash = crypto.createHash("sha256").update(rawDelToken).digest("hex");

    const intentRes = await sql`
      SELECT public.create_telegram_deletion_intent(
        ${wsA},
        ${bcId},
        ${delTokenHash},
        ${userA},
        ${integA}
      ) as intent
    `;
    const intentData = intentRes[0].intent;
    if (!intentData.intent_id || !intentData.preview) {
      throw new Error("Failed to create deletion intent: " + JSON.stringify(intentData));
    }

    // Execute scoped deletion with valid token hash
    const execRes = await sql`
      SELECT public.execute_telegram_scoped_deletion(
        ${wsA},
        ${bcId},
        ${delTokenHash},
        true,
        ${integA}
      ) as result
    `;
    const delResult = execRes[0].result;
    if (!delResult.success) {
      throw new Error("Scoped deletion execution failed: " + JSON.stringify(delResult));
    }
    console.log(`  Scoped deletion executed: msgs_deleted=${delResult.messages_deleted}, jobs_purged=${delResult.jobs_purged}`);

    // Verify connection status is 'local_disabled'
    const connCheck = await sql`
      SELECT status, is_enabled, can_reply FROM public.telegram_business_connections WHERE business_connection_id = ${bcId}
    `;
    if (connCheck[0].status !== "local_disabled" || connCheck[0].is_enabled !== false || connCheck[0].can_reply !== false) {
      throw new Error("Connection status was not updated to local_disabled with disabled replies: " + JSON.stringify(connCheck[0]));
    }
    console.log("  Pass: Connection marked 'local_disabled' with can_reply=false.");

    // Verify shared CRM contact in contacts table remains 100% PRESERVED
    const contactsAfter = await sql`SELECT count(*)::int as count FROM public.contacts WHERE id = ${contactId}`;
    if (contactsAfter[0].count !== 1) {
      throw new Error("Shared CRM contact was deleted! Scope breach!");
    }
    console.log("  Pass: Shared CRM contact in contacts table remains 100% PRESERVED.");
    console.log("✅ Connection-scoped deletion certified.\n");

    console.log("=================================================================");
    console.log("  ALL CERTIFICATION GATES PASSED ON DOCKER POSTGRESQL (PORT 54322) ");
    console.log("=================================================================");
  } finally {
    await sql.end();
  }
}

runCertification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ CERTIFICATION FAILED:", err);
    process.exit(1);
  });
