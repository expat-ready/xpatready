-- AUD-1c part 1 (map row 97, R1.97; SA-11-4@4cfd3199, AG-13-42@a9a48286, NFR5-08; P-570 (1), P-571 (1)): a hash chain on
-- the one audit trail. Every line gets chain_key, seq, prev_hash and entry_hash, set by the insert trigger
-- aud_event_zchain and never by a writer: entry_hash = sha256(prev_hash || UTF-8 of aud_event_canonical(line)), seq
-- 1, 2, 3… per chain with no gap. Altering or removing a line breaks every later hash (part 2's checker finds it).
--
-- Chains: `sample:<workspace id>` for a line of the demo workspace (whatever its firm_id) or of a workspace that no
-- longer exists whose firm is none or a Sample firm's (the lines AUD-1a lets the demo reset delete; review m2), else the line's firm_id, else `platform`. So a reset
-- never cuts a firm's or the platform's chain (P-571 (1)). AUD-4 reads a firm's log by firm_id, not by chain_key.
-- No pgcrypto: sha256(bytea) is built into PostgreSQL 11 and later (no new extension, STANDARDS §1).
--
-- Order: the columns (nullable); the canonical form; the back-fill, oldest first per chain, with AUD-1a's
-- aud_event_no_change switched off for this step only and on again before the migration ends; NOT NULL and the
-- unique (chain_key, seq); the insert trigger and the reset restart; the checker's table (part 2 writes it).
-- A later BEFORE INSERT trigger on audit_event must sort before aud_event_zchain, or it changes a line after it is hashed
-- (the checker then reports the chain broken).
-- Down (by hand): drop aud_event_zchain, aud_event_chain_restart and their functions, aud_event_canonical,
-- aud_chain_field, the unique index, the four columns, aud_chain_check and the enum AuditChainStatus.

-- CreateEnum
CREATE TYPE "AuditChainStatus" AS ENUM ('INTACT', 'BROKEN');

-- AlterTable (NOT NULL after the back-fill)
ALTER TABLE "audit_event" ADD COLUMN "chain_key" TEXT,
ADD COLUMN "entry_hash" BYTEA,
ADD COLUMN "prev_hash" BYTEA,
ADD COLUMN "seq" BIGINT;

-- One field of the canonical form: its UTF-8 length in bytes, a colon and the text; '~' for a null (a length never
-- starts with '~'), so no two lines' fields run together into the same text.
CREATE FUNCTION aud_chain_field(v text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT CASE WHEN v IS NULL THEN '~' ELSE octet_length(v)::text || ':' || v END $fn$;

-- The canonical form of a line, written once here (api/src/platform/audit/canonical.ts mirrors it byte for byte):
-- a version word, then each field in this fixed order. `at` is UTC text to the microsecond; `detail` is jsonb's own
-- text (keys by length then bytes, numbers as numeric prints them).
CREATE FUNCTION aud_event_canonical(e "audit_event") RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT 'aud1c/1' || aud_chain_field(e."chain_key") || aud_chain_field(e."seq"::text) || aud_chain_field(e."id"::text)
    || aud_chain_field(to_char(e."at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) || aud_chain_field(e."workspace_id"::text)
    || aud_chain_field(e."firm_id"::text) || aud_chain_field(e."case_id"::text) || aud_chain_field(e."combination_id"::text)
    || aud_chain_field(e."actor") || aud_chain_field(e."actor_type"::text) || aud_chain_field(e."action") || aud_chain_field(e."entity")
    || aud_chain_field(e."entity_key") || aud_chain_field(e."summary") || aud_chain_field(e."correlation_id")
    || aud_chain_field(e."support_session_id"::text) || aud_chain_field(e."detail"::text) $fn$;

-- The chain a line belongs to (rule above). Reads the workspace row, so callers run as xr_wall_reader.
CREATE FUNCTION aud_chain_key_of(workspace_id uuid, firm_id uuid) RETURNS text
  LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
  AS $fn$ SELECT CASE
    WHEN (NOT EXISTS (SELECT 1 FROM "workspace" w WHERE w."id" = workspace_id)
          AND (firm_id IS NULL OR EXISTS (SELECT 1 FROM "platform_firm" f WHERE f."id" = firm_id AND f."key" IN ('sample-firm', 'sample-solo'))))
      OR EXISTS (SELECT 1 FROM "workspace" w WHERE w."id" = workspace_id AND w."key" = 'demo') THEN 'sample:' || workspace_id::text
    WHEN firm_id IS NOT NULL THEN firm_id::text
    ELSE 'platform' END $fn$;
ALTER FUNCTION aud_chain_key_of(uuid, uuid) OWNER TO xr_wall_reader;

-- Back-fill: every existing line chained once, oldest first (at, then id) per chain. Chaining is an UPDATE, which
-- AUD-1a's trigger refuses: it is switched off for this step only, inside this migration's transaction.
ALTER TABLE "audit_event" DISABLE TRIGGER "aud_event_no_change";
UPDATE "audit_event" SET "chain_key" = aud_chain_key_of("workspace_id", "firm_id");
DO $$
DECLARE r record; k text := NULL; s bigint := 0; h bytea; e "audit_event";
BEGIN
  FOR r IN SELECT "id" FROM "audit_event" ORDER BY "chain_key", "at", "id" LOOP
    SELECT * INTO e FROM "audit_event" WHERE "id" = r."id";
    IF k IS DISTINCT FROM e."chain_key" THEN k := e."chain_key"; s := 0; h := '\x0000000000000000000000000000000000000000000000000000000000000000'::bytea; END IF;
    s := s + 1; e."seq" := s; e."prev_hash" := h;
    h := sha256(h || convert_to(aud_event_canonical(e), 'UTF8'));
    UPDATE "audit_event" SET "seq" = s, "prev_hash" = e."prev_hash", "entry_hash" = h WHERE "id" = r."id";
  END LOOP;
END $$;
ALTER TABLE "audit_event" ENABLE TRIGGER "aud_event_no_change";

ALTER TABLE "audit_event" ALTER COLUMN "chain_key" SET NOT NULL, ALTER COLUMN "seq" SET NOT NULL,
  ALTER COLUMN "prev_hash" SET NOT NULL, ALTER COLUMN "entry_hash" SET NOT NULL,
  ADD CONSTRAINT "aud_event_chain_hash_len" CHECK (octet_length("prev_hash") = 32 AND octet_length("entry_hash") = 32 AND "seq" >= 1),
  -- The canonical `at` is UTC text with no era: a line's time is finite and AD (breaker minor 4: BC and ±infinity
  -- would print alike).
  ADD CONSTRAINT "aud_event_at_finite" CHECK (isfinite("at") AND "at" >= '0001-01-01 00:00:00+00');

-- CreateIndex
CREATE UNIQUE INDEX "audit_event_chain_key_seq_key" ON "audit_event"("chain_key", "seq");

-- Insert trigger. Named with a `z` so it fires last of the BEFORE INSERT triggers (PostgreSQL fires them in name
-- order): the hash covers what aud_event_fill filled. It replaces any chain value a writer gives, takes the chain's
-- lock until commit (pg_advisory_xact_lock; so seq follows commit order with no gap), reads the head and links to it.
-- A transaction that inserts under REPEATABLE READ and misses a newer head fails on the unique (chain_key, seq):
-- fail-closed, never a fork.
CREATE FUNCTION aud_event_zchain() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$
DECLARE head record;
BEGIN
  NEW."chain_key" := aud_chain_key_of(NEW."workspace_id", NEW."firm_id");
  PERFORM pg_advisory_xact_lock(1096107075, hashtext(NEW."chain_key"));   -- 1096107075 = 'AUDC': the audit chains' lock space
  SELECT "seq", "entry_hash" INTO head FROM "audit_event" WHERE "chain_key" = NEW."chain_key" ORDER BY "seq" DESC LIMIT 1;
  NEW."seq" := coalesce(head."seq", 0) + 1;
  NEW."prev_hash" := coalesce(head."entry_hash", '\x0000000000000000000000000000000000000000000000000000000000000000'::bytea);
  NEW."entry_hash" := sha256(NEW."prev_hash" || convert_to(aud_event_canonical(NEW), 'UTF8'));
  RETURN NEW;
END $fn$;
ALTER FUNCTION aud_event_zchain() OWNER TO xr_wall_reader;
CREATE TRIGGER "aud_event_zchain" BEFORE INSERT ON "audit_event" FOR EACH ROW EXECUTE FUNCTION aud_event_zchain();

-- Reset restart: when a DELETE (only ever the demo reset's, AUD-1a) removes a `sample:` chain's lines 1..M (a reset,
-- not a single line), it takes that chain's lock, so a demo write still in flight finishes first (breaker Major 1: a
-- line committed after the delete's snapshot would otherwise survive at seq M+1 and link to a deleted line), removes
-- any line of that chain that committed in the meantime (Sample lines the same reset may remove; AUD-1a's rule applies,
-- so a line it refuses fails the whole reset), and, when the chain's workspace still exists, writes one
-- `chain.restarted` line (actor system, Sample) at seq 1. demo.ts needs no edit. A chain whose workspace is gone (the
-- reset deletes the demo workspace row next; its orphan sweep then removes that line) simply ends: the new demo
-- workspace has its own chain.
CREATE FUNCTION aud_event_chain_restart() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
  AS $fn$
DECLARE r record;
BEGIN
  FOR r IN SELECT o."chain_key", min(o."workspace_id"::text)::uuid AS ws FROM gone o WHERE o."chain_key" LIKE 'sample:%'
             GROUP BY o."chain_key" HAVING min(o."seq") = 1 AND max(o."seq") = count(*) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(1096107075, hashtext(r."chain_key"));
    DELETE FROM "audit_event" e WHERE e."chain_key" = r."chain_key";
    IF EXISTS (SELECT 1 FROM "workspace" w WHERE w."id" = r.ws) THEN
      INSERT INTO "audit_event" ("id", "workspace_id", "actor", "action", "entity", "summary")
        VALUES (gen_random_uuid(), r.ws, 'system', 'chain.restarted', 'audit chain',
                'The demo reset removed this Sample workspace''s audit lines; its audit chain starts again here (Sample)');
    END IF;
  END LOOP;
  RETURN NULL;
END $fn$;
ALTER FUNCTION aud_event_chain_restart() OWNER TO xr_wall_reader;
CREATE TRIGGER "aud_event_chain_restart" AFTER DELETE ON "audit_event" REFERENCING OLD TABLE AS gone
  FOR EACH STATEMENT EXECUTE FUNCTION aud_event_chain_restart();

-- CreateTable: the checker's last verified place per chain (AUD-1c part 2 writes it; SA-11-6).
CREATE TABLE "aud_chain_check" (
    "chain_key" TEXT NOT NULL,
    "verified_seq" BIGINT NOT NULL DEFAULT 0,
    "verified_hash" BYTEA,
    "checked_at" TIMESTAMPTZ,
    "status" "AuditChainStatus" NOT NULL DEFAULT 'INTACT',
    "failing_from_seq" BIGINT,
    "failing_to_seq" BIGINT,
    CONSTRAINT "aud_chain_check_pkey" PRIMARY KEY ("chain_key")
);
