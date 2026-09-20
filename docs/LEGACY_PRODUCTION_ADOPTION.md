# Legacy Production Supabase adoption

This process is for a J10 Production project whose application schema exists but whose
`supabase_migrations.schema_migrations` history was lost. It does **not** replay historic SQL.

1. Use the immutable `canonical-schema-manifest-<main SHA>` artifact produced by the successful
   `Supabase full migration-chain certification` workflow. The artifact is exported only after a
   disposable local Supabase database has applied the canonical chain through `20261013`; it carries
   the source SHA, exact 45-version range, normalized manifest, fingerprint, and SHA-256 checksum.
2. Verify the artifact's workflow provenance, source SHA, range, checksum, and absence of secret-like
   values before using its normalized schema manifest as certification input.
3. Run `node scripts/certify-legacy-production-adoption.mjs` with the exact Production ref,
   hostname, canonical manifest, report destination, and `--dry-run`.
4. Review the deterministic report. It includes only schema fingerprints and aggregate invariant
   counts—never rows, customer content, credentials, or tokens.
5. Copy the passing report to `docs/adoption-reports/` and commit it as controlled release
   evidence. Then run `node scripts/apply-legacy-production-ledger-adoption.mjs` with the exact
   target, hostname, report path, and `--apply-ledger`.

The certification command is dry-run only. The explicit ledger-adoption command fails closed unless
the report passes, the ledger is empty, and every application-table aggregate count is unchanged
after Supabase's official `migration repair --status applied` operation. Neither command runs a
database reset, migration SQL, provider action, or application-table mutation.
