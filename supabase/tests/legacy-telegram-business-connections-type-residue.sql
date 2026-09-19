-- Simulate the one standalone composite type a linked reset may preserve.
-- The existing completed-chain table is renamed, rather than dropped, so
-- this fixture uses no CASCADE and does not remove any dependency. Rename
-- its schema-global indexes as well, freeing the canonical relation name
-- for the reset migration to rebuild.

ALTER TABLE public.telegram_connection_sessions
  RENAME TO telegram_connection_sessions_legacy_residue;

ALTER INDEX IF EXISTS public.telegram_connection_sessions_pkey
  RENAME TO telegram_connection_sessions_legacy_residue_pkey;
ALTER INDEX IF EXISTS public.telegram_connection_sessions_token_hash_key
  RENAME TO telegram_connection_sessions_legacy_residue_token_hash_key;
ALTER INDEX IF EXISTS public.idx_tg_conn_sessions_hash
  RENAME TO idx_tg_conn_sessions_hash_legacy_residue;
ALTER INDEX IF EXISTS public.idx_tg_conn_sessions_ws
  RENAME TO idx_tg_conn_sessions_ws_legacy_residue;
ALTER INDEX IF EXISTS public.idx_tg_conn_sessions_tg_uid
  RENAME TO idx_tg_conn_sessions_tg_uid_legacy_residue;

CREATE TYPE public.telegram_connection_sessions AS (
  legacy_marker uuid
);
