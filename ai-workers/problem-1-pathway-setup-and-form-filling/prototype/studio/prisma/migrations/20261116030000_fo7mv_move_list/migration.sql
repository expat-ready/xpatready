-- FO-7mv (BACKLOG row FO-7mv as split by its brief, approved by Lead B, rev 16.31; B-18 and B-19 from #1758; AG-6-73,
-- AG-6-69 rule 2, AG-6-70, AG-6-77, AG-6-48; P-603, P-607 (1), P-600; Code SOR/2022-128 s. 32 as FO-7a cites it,
-- legal reading Unconfirmed: no counsel; schema file prisma/schema/client-money.prisma, owner Lead B): the "To move"
-- list between the firm's trust and operating bank accounts. Schema and the database's rules only: no route, no screen
-- (the list's routes and the 25-day home item are FO-7t's, which calls only these tables and reads money_to_move).
--   * new: money_move_batch, money_move_line, the view money_to_move; money_trust_entry gains correction_kind.
--   * no existing row changes. The migration stops if a correction of a deposit already exists (it would have no kind).
--   * every function and trigger is money_; none of FO-7a's functions is replaced: the trust-entry rules are a new
--     AFTER trigger beside FO-7a's money_trust_entry_write.
-- Rollback (in this order): DROP VIEW "money_to_move"; DROP TABLE "money_move_line", "money_move_batch"; DROP TRIGGER
--   money_trust_entry_moves ON "money_trust_entry"; ALTER TABLE "money_trust_entry" DROP CONSTRAINT
--   "money_trust_entry_correction_kind_check", DROP COLUMN "correction_kind"; DROP INDEX
--   "money_trust_entry_firm_id_corrects_entry_id_idx"; DROP FUNCTION money_move_batch_write(),
--   money_move_batch_has_lines(), money_move_line_write(), money_move_line_not_undone(), money_trust_entry_moves();
--   DROP TYPE "MoneyMoveDirection", "MoneyMoveKind", "MoneyCorrectionKind"; delete this folder's row from
--   _prisma_migrations.

-- A correction of a deposit written before this migration says nothing about why it was made, so it can never be read
-- as licensing a move or not (B-19). None exists outside test databases (no route writes trust entries yet). The
-- guard locks the table first, so it waits for a correction written in a transaction still open and counts it (break
-- B-6).
DO $$
DECLARE n integer;
BEGIN
  LOCK TABLE "money_trust_entry" IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO n FROM "money_trust_entry" c JOIN "money_trust_entry" d ON d.firm_id = c.firm_id AND d.id = c.corrects_entry_id
    WHERE c.kind = 'CORRECTION' AND d.kind = 'DEPOSIT';
  IF n > 0 THEN
    RAISE EXCEPTION 'fo7mv_move_list: % correction(s) of a deposit have no correction kind (BOUNCED, WRONG_ACCOUNT or ENTRY_ERROR); give each its kind by hand, then run the migration again', n USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- Prisma's DDL (prisma migrate diff), then the rules.
CREATE TYPE "MoneyCorrectionKind" AS ENUM ('BOUNCED', 'WRONG_ACCOUNT', 'ENTRY_ERROR');
CREATE TYPE "MoneyMoveKind" AS ENUM ('TRUST_APPLIED', 'WRONG_ACCOUNT', 'CARD_FEE_ON_TRUST');
CREATE TYPE "MoneyMoveDirection" AS ENUM ('TRUST_TO_OPERATING', 'OPERATING_TO_TRUST');
ALTER TABLE "money_trust_entry" ADD COLUMN     "correction_kind" "MoneyCorrectionKind";

CREATE TABLE "money_move_batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "currency" "MoneyCurrency" NOT NULL,
    "direction" "MoneyMoveDirection" NOT NULL,
    "transfer_date" DATE,
    "undoes_batch_id" UUID,
    "reason" TEXT,
    "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_move_batch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "money_move_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "kind" "MoneyMoveKind" NOT NULL,
    "direction" "MoneyMoveDirection" NOT NULL,
    "currency" "MoneyCurrency" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "source_entry_id" UUID NOT NULL,
    "invoice_id" UUID,
    "person_id" UUID,
    "company_id" UUID,
    "move_ordinal" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_move_line_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "money_trust_entry_firm_id_corrects_entry_id_idx" ON "money_trust_entry"("firm_id", "corrects_entry_id");
CREATE UNIQUE INDEX "money_move_batch_firm_id_id_key" ON "money_move_batch"("firm_id", "id");
CREATE UNIQUE INDEX "money_move_batch_firm_id_undoes_batch_id_key" ON "money_move_batch"("firm_id", "undoes_batch_id");
CREATE INDEX "money_move_line_firm_id_batch_id_idx" ON "money_move_line"("firm_id", "batch_id");
CREATE INDEX "money_move_line_firm_id_invoice_id_idx" ON "money_move_line"("firm_id", "invoice_id");
CREATE UNIQUE INDEX "money_move_line_firm_id_source_entry_id_move_ordinal_key" ON "money_move_line"("firm_id", "source_entry_id", "move_ordinal");
ALTER TABLE "money_move_batch" ADD CONSTRAINT "money_move_batch_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "money_payment_settings"("firm_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_move_batch" ADD CONSTRAINT "money_move_batch_firm_id_undoes_batch_id_fkey" FOREIGN KEY ("firm_id", "undoes_batch_id") REFERENCES "money_move_batch"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_move_line" ADD CONSTRAINT "money_move_line_firm_id_batch_id_fkey" FOREIGN KEY ("firm_id", "batch_id") REFERENCES "money_move_batch"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_move_line" ADD CONSTRAINT "money_move_line_firm_id_source_entry_id_fkey" FOREIGN KEY ("firm_id", "source_entry_id") REFERENCES "money_trust_entry"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "money_move_line" ADD CONSTRAINT "money_move_line_firm_id_invoice_id_fkey" FOREIGN KEY ("firm_id", "invoice_id") REFERENCES "money_invoice"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- ------------------------------------------------------------------------------------------------ rules Prisma cannot say
-- As FO-7a: SQLSTATE 23514 (check_violation) for a broken rule, 42501 for a change to an insert-only row.

-- Only a correction carries a kind; which corrections must (those of a deposit) needs the corrected entry, so that part
-- is money_trust_entry_moves below.
ALTER TABLE "money_trust_entry"
  ADD CONSTRAINT "money_trust_entry_correction_kind_check" CHECK ("kind" = 'CORRECTION' OR "correction_kind" IS NULL);
ALTER TABLE "money_move_batch"
  -- A batch records a bank transfer (its date, no reason); an undo names the batch it undoes and a reason (AG-6-73
  -- rule 6). An undo's transfer date is optional (the bank may have sent the money back on a date).
  ADD CONSTRAINT "money_move_batch_kind_check" CHECK (
    ("undoes_batch_id" IS NULL AND "transfer_date" IS NOT NULL AND "reason" IS NULL)
    OR ("undoes_batch_id" IS NOT NULL AND "undoes_batch_id" <> "id" AND money_text_ok("reason", 200))),
  -- A real bank date (break B-9: 'infinity', 4713 BC).
  ADD CONSTRAINT "money_move_batch_date_check" CHECK ("transfer_date" IS NULL OR "transfer_date" BETWEEN '2000-01-01' AND '2999-12-31'),
  ADD CONSTRAINT "money_move_batch_by_check" CHECK (money_text_ok("recorded_by", 200));
ALTER TABLE "money_move_line"
  ADD CONSTRAINT "money_move_line_amount_check" CHECK ("amount_minor" > 0 AND "move_ordinal" >= 1),
  ADD CONSTRAINT "money_move_line_party_check" CHECK (num_nonnulls("person_id", "company_id") = 1);
CREATE TRIGGER money_move_batch_insert_only BEFORE UPDATE OR DELETE ON "money_move_batch" FOR EACH ROW EXECUTE FUNCTION money_insert_only();
CREATE TRIGGER money_move_line_insert_only BEFORE UPDATE OR DELETE ON "money_move_line" FOR EACH ROW EXECUTE FUNCTION money_insert_only();
CREATE TRIGGER money_move_batch_no_truncate BEFORE TRUNCATE ON "money_move_batch" FOR EACH STATEMENT EXECUTE FUNCTION money_insert_only();
CREATE TRIGGER money_move_line_no_truncate BEFORE TRUNCATE ON "money_move_line" FOR EACH STATEMENT EXECUTE FUNCTION money_insert_only();

-- -------------------------------------------------------------------------------------------------------- batches
-- An undo names a recorded batch (never an undo: an undo is never undone, the moves are recorded again instead), in
-- its currency and direction; one undo per batch is the unique index money_move_batch_firm_id_undoes_batch_id_key.
-- The time is the database's.
CREATE OR REPLACE FUNCTION money_move_batch_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record;
BEGIN
  IF NEW.undoes_batch_id IS NOT NULL THEN
    SELECT x.undoes_batch_id, x.currency, x.direction INTO b FROM "money_move_batch" x WHERE x.firm_id = NEW.firm_id AND x.id = NEW.undoes_batch_id;
    IF NOT FOUND THEN PERFORM money_missing('money_move_batch', 'batch', NEW.undoes_batch_id); END IF;
    IF b.undoes_batch_id IS NOT NULL THEN
      RAISE EXCEPTION 'money_move_batch: an undo is never undone (record the moves again instead)' USING ERRCODE = 'check_violation';
    END IF;
    IF (b.currency, b.direction) IS DISTINCT FROM (NEW.currency, NEW.direction) THEN
      RAISE EXCEPTION 'money_move_batch: an undo is in the currency and direction of the batch it undoes (% %)', b.currency, b.direction USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.recorded_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER money_move_batch_write BEFORE INSERT ON "money_move_batch" FOR EACH ROW EXECUTE FUNCTION money_move_batch_write();

-- A recorded batch holds at least one line when its transaction commits (an empty "I moved these" records nothing).
CREATE OR REPLACE FUNCTION money_move_batch_has_lines() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.undoes_batch_id IS NULL AND NOT EXISTS (SELECT 1 FROM "money_move_line" l WHERE l.firm_id = NEW.firm_id AND l.batch_id = NEW.id) THEN
    RAISE EXCEPTION 'money_move_batch: a batch records at least one line, in its own transaction' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER money_move_batch_has_lines AFTER INSERT ON "money_move_batch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION money_move_batch_has_lines();

-- ---------------------------------------------------------------------------------------------------------- lines
-- A line moves part of one trust entry (AG-6-73 rule 1; P-603: money leaves trust only by a withdrawal to an issued
-- invoice or a refund to the client, so a move out of trust follows a ledger entry that already took the money out):
--   * TRUST_APPLIED, trust → operating: a WITHDRAWAL_TO_INVOICE. Its moves, net of undone batches, never exceed the
--     withdrawal less the money returned to trust from it (B-18: "withdraw 100, move 100, return 100" three times
--     moved 300.00 for one 100.00 invoice).
--   * WRONG_ACCOUNT, trust → operating: a correction of a deposit whose kind is WRONG_ACCOUNT (AG-6-69 rule 2), at most
--     that correction's amount. A BOUNCED or ENTRY_ERROR correction never licenses a move (B-19: a bounced cheque or a
--     refunded deposit moved other clients' trust money to operating).
--   * CARD_FEE_ON_TRUST: no source yet. Card money into trust is held (P-567; FO-7a refuses it), and the card fees are
--     FO-7c's: the kind is kept for AG-6-73 rule 1 (c) and refused here.
--   * Money from operating into trust (AG-6-69 rule 2 the other way; a shortfall, P-607 (1)) has no ledger entry to name
--     yet: OPERATING_TO_TRUST lines wait for the row that adds one (FO-7v names the shortfall).
-- The line's currency and direction are its batch's; its invoice and party are copied from the entry and must match.
-- The party's trust lock first (the one every trust entry takes, so a return and a move on one withdrawal go one at a
-- time at READ COMMITTED), then for a trust application the invoice row is touched, as a return touches it
-- (money_trust_entry_moves): at REPEATABLE READ the later of the two fails to serialise (40001). Two moves of one
-- entry at once: move_ordinal (count of its earlier lines + 1) is unique per entry, so a stale second writer is
-- refused (23505). Lines are written only in the transaction that records their batch, never after its undo (FO-7a's
-- B-16 rule; round 3, B-15: an unknown transaction status is not mine).
CREATE OR REPLACE FUNCTION money_move_line_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b record; s record; party uuid; earlier integer; moved bigint; returned bigint; cap bigint; due bigint; held bigint; to_move bigint; uncleared bigint;
BEGIN
  SELECT x.undoes_batch_id, x.currency, x.direction, pg_xact_status(((pg_current_xact_id()::text::bigint >> 32 << 32) | x.xmin::text::bigint)::text::xid8) = 'in progress' AS mine
    INTO b FROM "money_move_batch" x WHERE x.firm_id = NEW.firm_id AND x.id = NEW.batch_id;
  IF NOT FOUND THEN PERFORM money_missing('money_move_line', 'batch', NEW.batch_id); END IF;
  IF b.undoes_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'money_move_line: an undo batch carries no lines (the undone batch''s lines go back to the list)' USING ERRCODE = 'check_violation';
  END IF;
  IF b.mine IS NOT TRUE THEN
    RAISE EXCEPTION 'money_move_line: a batch takes its lines in the transaction that records it; a recorded batch is never added to' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = NEW.firm_id AND u.undoes_batch_id = NEW.batch_id) THEN
    RAISE EXCEPTION 'money_move_line: an undone batch never gains a line, also in the transaction that records it' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.currency, NEW.direction) IS DISTINCT FROM (b.currency, b.direction) THEN
    RAISE EXCEPTION 'money_move_line: a line is in its batch''s currency and direction (% %); CAD and USD never share a batch', b.currency, b.direction USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'CARD_FEE_ON_TRUST' THEN
    RAISE EXCEPTION 'money_move_line: card fees on the trust account wait for card payments into trust (held, P-567; FO-7c)' USING ERRCODE = 'check_violation';
  END IF;
  SELECT e.kind, e.amount_minor, e.currency, e.person_id, e.company_id, e.invoice_id, e.correction_kind, d.kind AS corrected_kind
    INTO s FROM "money_trust_entry" e LEFT JOIN "money_trust_entry" d ON d.firm_id = e.firm_id AND d.id = e.corrects_entry_id
    WHERE e.firm_id = NEW.firm_id AND e.id = NEW.source_entry_id;
  IF NOT FOUND THEN PERFORM money_missing('money_move_line', 'trust entry', NEW.source_entry_id); END IF;
  IF NEW.kind = 'TRUST_APPLIED' AND s.kind IS DISTINCT FROM 'WITHDRAWAL_TO_INVOICE' THEN
    RAISE EXCEPTION 'money_move_line: a trust application moves a withdrawal to an invoice, not a %', s.kind USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'WRONG_ACCOUNT' AND (s.kind IS DISTINCT FROM 'CORRECTION' OR s.corrected_kind IS DISTINCT FROM 'DEPOSIT' OR s.correction_kind IS DISTINCT FROM 'WRONG_ACCOUNT') THEN
    RAISE EXCEPTION 'money_move_line: only a WRONG_ACCOUNT correction of a deposit licenses a wrong-account move out of trust (this entry is a %): a bounced cheque or an entry error never reached the trust account as money to move',
      coalesce(s.correction_kind::text || ' ', '') || s.kind USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.direction <> 'TRUST_TO_OPERATING' THEN
    RAISE EXCEPTION 'money_move_line: a % line moves from trust to operating (money into trust waits for its own ledger entry)', NEW.kind USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.currency <> s.currency THEN
    RAISE EXCEPTION 'money_move_line: a line is in its entry''s currency (%)', s.currency USING ERRCODE = 'check_violation';
  END IF;
  NEW.invoice_id := coalesce(NEW.invoice_id, s.invoice_id);
  IF NEW.person_id IS NULL AND NEW.company_id IS NULL THEN
    NEW.person_id := s.person_id; NEW.company_id := s.company_id;
  END IF;
  IF (NEW.invoice_id, NEW.person_id, NEW.company_id) IS DISTINCT FROM (s.invoice_id, s.person_id, s.company_id) THEN
    RAISE EXCEPTION 'money_move_line: a line''s invoice and party are its trust entry''s' USING ERRCODE = 'check_violation';
  END IF;
  party := coalesce(s.person_id, s.company_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('money_trust:' || NEW.firm_id || ':' || party || ':' || s.currency, 0));
  IF NEW.kind = 'TRUST_APPLIED' THEN
    UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = s.invoice_id;
  END IF;
  SELECT count(*), coalesce(sum(l.amount_minor) FILTER (WHERE NOT EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = l.firm_id AND u.undoes_batch_id = l.batch_id)), 0)
    INTO earlier, moved FROM "money_move_line" l WHERE l.firm_id = NEW.firm_id AND l.source_entry_id = NEW.source_entry_id;
  IF NEW.kind = 'TRUST_APPLIED' THEN
    SELECT coalesce(sum(c.amount_minor), 0) INTO returned FROM "money_trust_entry" c WHERE c.firm_id = NEW.firm_id AND c.corrects_entry_id = NEW.source_entry_id;
  ELSE
    returned := 0;
  END IF;
  cap := -s.amount_minor - returned;
  IF moved + NEW.amount_minor > cap THEN
    RAISE EXCEPTION 'money_move_line: % % would move more than this entry still holds (% % to move: % less % returned to trust, % moved before)',
      NEW.amount_minor, NEW.currency, cap - moved, NEW.currency, -s.amount_minor, returned, moved USING ERRCODE = 'check_violation';
  END IF;
  -- Break B-4: a trust application moves at most what trust may keep for its invoice — the total less credit notes and
  -- the write-off — less what the invoice's applications already moved (the invoice row is touched above, as a credit
  -- note and a write-off touch it).
  IF NEW.kind = 'TRUST_APPLIED' THEN
    due := money_invoice_total(NEW.firm_id, s.invoice_id)
      - (SELECT coalesce(sum(c.amount_minor), 0) FROM "money_credit_note" c WHERE c.firm_id = NEW.firm_id AND c.invoice_id = s.invoice_id)
      - (SELECT coalesce(sum(w.amount_minor), 0) FROM "money_write_off" w WHERE w.firm_id = NEW.firm_id AND w.invoice_id = s.invoice_id);
    SELECT coalesce(sum(l.amount_minor), 0) INTO moved FROM "money_move_line" l WHERE l.firm_id = NEW.firm_id AND l.invoice_id = s.invoice_id AND l.kind = 'TRUST_APPLIED'
      AND NOT EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = l.firm_id AND u.undoes_batch_id = l.batch_id);
    IF moved + NEW.amount_minor > due THEN
      RAISE EXCEPTION 'money_move_line: % % would move more than the invoice keeps after credit notes and the write-off (% due, % moved): return the rest to trust', NEW.amount_minor, NEW.currency, due, moved USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- Breaks B-1, B-2: only cleared money leaves trust. After this line, the party's money in the trust bank account
  -- (what it holds in the ledger plus what is still to move) covers its cheques not yet cleared, net of their BOUNCED
  -- and ENTRY_ERROR corrections; so a bounce can always be recorded and never takes another client's money. The
  -- firm's settings row is touched, so two moves of one party at REPEATABLE READ go one at a time (40001).
  UPDATE "money_payment_settings" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id;
  SELECT coalesce((SELECT e.balance_after_minor FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND (e.person_id = party OR e.company_id = party) AND e.currency = s.currency ORDER BY e.seq DESC LIMIT 1), 0) INTO held;
  SELECT coalesce(sum(-e.amount_minor
      - CASE WHEN e.kind = 'WITHDRAWAL_TO_INVOICE' THEN (SELECT coalesce(sum(c.amount_minor), 0) FROM "money_trust_entry" c WHERE c.firm_id = e.firm_id AND c.corrects_entry_id = e.id) ELSE 0 END
      - (SELECT coalesce(sum(l.amount_minor), 0) FROM "money_move_line" l WHERE l.firm_id = e.firm_id AND l.source_entry_id = e.id
           AND NOT EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = l.firm_id AND u.undoes_batch_id = l.batch_id))), 0) INTO to_move
    FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND (e.person_id = party OR e.company_id = party) AND e.currency = s.currency
      AND (e.kind = 'WITHDRAWAL_TO_INVOICE' OR (e.kind = 'CORRECTION' AND e.correction_kind = 'WRONG_ACCOUNT'));
  SELECT coalesce(sum(greatest(e.amount_minor + (SELECT coalesce(sum(c.amount_minor), 0) FROM "money_trust_entry" c WHERE c.firm_id = e.firm_id AND c.corrects_entry_id = e.id AND c.correction_kind IN ('BOUNCED', 'ENTRY_ERROR')), 0)), 0)
    INTO uncleared FROM "money_trust_entry" e JOIN "money_payment" p ON p.firm_id = e.firm_id AND p.id = e.payment_id
    WHERE e.firm_id = NEW.firm_id AND (e.person_id = party OR e.company_id = party) AND e.currency = s.currency AND e.kind = 'DEPOSIT' AND NOT p.cleared;
  IF held + to_move - NEW.amount_minor < uncleared THEN
    RAISE EXCEPTION 'money_move_line: % % of this party''s trust money rests on payments not yet cleared; it moves once they clear (% held, % to move)', uncleared, NEW.currency, held, to_move USING ERRCODE = 'check_violation';
  END IF;
  NEW.move_ordinal := earlier + 1;
  NEW.created_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER money_move_line_write BEFORE INSERT ON "money_move_line" FOR EACH ROW EXECUTE FUNCTION money_move_line_write();

-- At commit: the batch was not undone later in the same transaction (an undo then a line is refused above).
CREATE OR REPLACE FUNCTION money_move_line_not_undone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = NEW.firm_id AND u.undoes_batch_id = NEW.batch_id) THEN
    RAISE EXCEPTION 'money_move_line: an undone batch never gains a line, also in the transaction that records it' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER money_move_line_not_undone AFTER INSERT ON "money_move_line" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION money_move_line_not_undone();

-- ---------------------------------------------------------------------------------------------- the trust ledger side
-- After FO-7a's money_trust_entry_write and its checks (so their refusals come first, with their words):
--   * a correction of a deposit says why (B-19): BOUNCED, WRONG_ACCOUNT or ENTRY_ERROR; a correction of a withdrawal
--     carries no kind;
--   * money returned to trust from a withdrawal is refused while what is moved of it, net of undone batches, would be
--     more than the withdrawal less all its returns (B-18): undo the move first. The party's lock is already held
--     (money_trust_entry_write takes it first); the invoice row is touched as a move touches it.
CREATE OR REPLACE FUNCTION money_trust_entry_moves() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c record; moved bigint; returned bigint;
BEGIN
  IF NEW.kind <> 'CORRECTION' OR NEW.corrects_entry_id IS NULL THEN RETURN NULL; END IF;
  SELECT e.kind, e.amount_minor, e.invoice_id INTO c FROM "money_trust_entry" e WHERE e.firm_id = NEW.firm_id AND e.id = NEW.corrects_entry_id;
  IF c.kind = 'DEPOSIT' AND NEW.correction_kind IS NULL THEN
    RAISE EXCEPTION 'money_trust_entry: a correction of a deposit says why it was made: BOUNCED, WRONG_ACCOUNT or ENTRY_ERROR' USING ERRCODE = 'check_violation';
  END IF;
  IF c.kind <> 'DEPOSIT' AND NEW.correction_kind IS NOT NULL THEN
    RAISE EXCEPTION 'money_trust_entry: only a correction of a deposit has a correction kind (this one names a %)', c.kind USING ERRCODE = 'check_violation';
  END IF;
  IF c.kind = 'WITHDRAWAL_TO_INVOICE' THEN
    UPDATE "money_invoice" x SET updated_at = now() WHERE x.firm_id = NEW.firm_id AND x.id = c.invoice_id;
    SELECT coalesce(sum(l.amount_minor), 0) INTO moved FROM "money_move_line" l
      WHERE l.firm_id = NEW.firm_id AND l.source_entry_id = NEW.corrects_entry_id
        AND NOT EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = l.firm_id AND u.undoes_batch_id = l.batch_id);
    SELECT coalesce(sum(r.amount_minor), 0) INTO returned FROM "money_trust_entry" r WHERE r.firm_id = NEW.firm_id AND r.corrects_entry_id = NEW.corrects_entry_id;
    IF moved > -c.amount_minor - returned THEN
      RAISE EXCEPTION 'money_trust_entry: % % of this trust application has moved to operating, so only % can come back to trust: undo that move batch first',
        moved, NEW.currency, greatest(-c.amount_minor - (returned - NEW.amount_minor) - moved, 0) USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER money_trust_entry_moves AFTER INSERT ON "money_trust_entry" FOR EACH ROW EXECUTE FUNCTION money_trust_entry_moves();

-- ----------------------------------------------------------------------------------------------- the derived list
-- AG-6-73 rules 1, 2, 4: every amount still to move, per source entry, derived from the ledger and the move lines (no
-- stored status): eligible − returned to trust before moving − moved (net of undone batches). A line fully returned
-- before moving (a dispute, a credit note: AG-6-77, AG-6-48) or fully moved is not on the list. Totals per currency
-- and direction are a GROUP BY on it (FO-7t). Each amount is at most its entry's, so an integer like every *_minor. created_at is the source entry's, for the 25-day item (rule 5).
CREATE OR REPLACE VIEW "money_to_move" AS
  WITH src AS (
    SELECT e.firm_id, e.id AS source_entry_id, 'TRUST_APPLIED'::"MoneyMoveKind" AS kind, e.currency, e.person_id, e.company_id, e.case_id, e.invoice_id,
           -e.amount_minor AS eligible_minor,
           (SELECT coalesce(sum(c.amount_minor), 0)::integer FROM "money_trust_entry" c WHERE c.firm_id = e.firm_id AND c.corrects_entry_id = e.id) AS returned_minor,
           e.created_at
      FROM "money_trust_entry" e WHERE e.kind = 'WITHDRAWAL_TO_INVOICE'
    UNION ALL
    SELECT e.firm_id, e.id, 'WRONG_ACCOUNT'::"MoneyMoveKind", e.currency, e.person_id, e.company_id, e.case_id, NULL::uuid,
           -e.amount_minor, 0, e.created_at
      FROM "money_trust_entry" e WHERE e.kind = 'CORRECTION' AND e.correction_kind = 'WRONG_ACCOUNT'
  ), m AS (
    SELECT s.*, 'TRUST_TO_OPERATING'::"MoneyMoveDirection" AS direction,
           (SELECT coalesce(sum(l.amount_minor), 0) FROM "money_move_line" l WHERE l.firm_id = s.firm_id AND l.source_entry_id = s.source_entry_id
              AND NOT EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = l.firm_id AND u.undoes_batch_id = l.batch_id))::integer AS moved_minor
      FROM src s
  ), o AS (
    -- A trust application shows at most what its invoice still keeps after credit notes, the write-off and the
    -- invoice's other moves (break B-4).
    SELECT m.*, CASE WHEN m.kind = 'TRUST_APPLIED' THEN least(m.eligible_minor - m.returned_minor - m.moved_minor, money_invoice_total(m.firm_id, m.invoice_id)
             - (SELECT coalesce(sum(c.amount_minor), 0) FROM "money_credit_note" c WHERE c.firm_id = m.firm_id AND c.invoice_id = m.invoice_id)
             - (SELECT coalesce(sum(w.amount_minor), 0) FROM "money_write_off" w WHERE w.firm_id = m.firm_id AND w.invoice_id = m.invoice_id)
             - (SELECT coalesce(sum(l.amount_minor), 0) FROM "money_move_line" l WHERE l.firm_id = m.firm_id AND l.invoice_id = m.invoice_id AND l.kind = 'TRUST_APPLIED'
                  AND NOT EXISTS (SELECT 1 FROM "money_move_batch" u WHERE u.firm_id = l.firm_id AND u.undoes_batch_id = l.batch_id)))
           ELSE m.eligible_minor - m.returned_minor - m.moved_minor END AS open_amount
      FROM m
  )
  SELECT firm_id, source_entry_id, kind, direction, currency, person_id, company_id, case_id, invoice_id, eligible_minor, returned_minor, moved_minor,
         open_amount::integer AS open_minor, created_at
    FROM o WHERE open_amount > 0;
