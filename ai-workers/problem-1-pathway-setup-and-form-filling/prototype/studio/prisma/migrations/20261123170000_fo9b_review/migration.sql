-- FO-9b part 2 (BACKLOG row FO-9b; brief design/lead-b-briefs/FO-9b.md "Part 2"; P-574 (2); AG-2-16, AG-2-78, AG-2-96):
-- the duplicate review list. One row per pair of person records in a firm (the pair in id order, unique), written when a
-- new person arrives with a match (exact email or phone, or a similar name), with its score and reasons and when it was
-- first seen. Its status is OPEN, MERGED (names the merge record) or KEPT_SEPARATE; an Undo of the merge opens it again.
-- noted_by_merge_id names the merge that wrote the pair (the survivor meeting the loser's matches); while that merge
-- is undone and the two no longer match, the pair is not listed (product/screens/FO-9b-2/pair-model.md).
-- Never deleted or truncated (fo_dup_review_no_delete). The pair's ids are plain uuids, like fo_dup_merge's: a pair is a
-- decision record, so a MERGED pair keeps naming the merged-away record (read through merged_into_id).
CREATE TYPE "FoDupReviewStatus" AS ENUM ('OPEN', 'MERGED', 'KEPT_SEPARATE');

CREATE TABLE "fo_dup_review" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "kind" "FoDupKind" NOT NULL DEFAULT 'PERSON',
    "low_id" UUID NOT NULL,
    "high_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "status" "FoDupReviewStatus" NOT NULL DEFAULT 'OPEN',
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ,
    "merge_id" UUID,
    "noted_by_merge_id" UUID,

    CONSTRAINT "fo_dup_review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fo_dup_review_order" CHECK ("low_id" < "high_id"),
    CONSTRAINT "fo_dup_review_score" CHECK ("score" BETWEEN 0 AND 100),
    CONSTRAINT "fo_dup_review_decided" CHECK (("status" = 'OPEN') = ("decided_at" IS NULL) AND ("decided_at" IS NULL) = ("decided_by" IS NULL)),
    CONSTRAINT "fo_dup_review_merged" CHECK (("status" = 'MERGED') = ("merge_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "fo_dup_review_firm_id_low_id_high_id_key" ON "fo_dup_review"("firm_id", "low_id", "high_id");
CREATE INDEX "fo_dup_review_firm_id_status_idx" ON "fo_dup_review"("firm_id", "status");
ALTER TABLE "fo_dup_review" ADD CONSTRAINT "fo_dup_review_merge_id_fkey" FOREIGN KEY ("merge_id") REFERENCES "fo_dup_merge"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "fo_dup_review" ADD CONSTRAINT "fo_dup_review_noted_by_merge_id_fkey" FOREIGN KEY ("noted_by_merge_id") REFERENCES "fo_dup_merge"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION fo_dup_review_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fo_dup_review: review pairs are never removed (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER "fo_dup_review_no_delete" BEFORE DELETE ON "fo_dup_review" FOR EACH ROW EXECUTE FUNCTION fo_dup_review_no_delete();
CREATE TRIGGER "fo_dup_review_no_truncate" BEFORE TRUNCATE ON "fo_dup_review" FOR EACH STATEMENT EXECUTE FUNCTION fo_dup_review_no_delete();

-- PF-12's wall (forced policy naming the session's firm; the firm-first gate before the area's own triggers); the trigger
-- function runs as xr_wall_reader (tests/check_pf12_walls.ts).
ALTER TABLE "fo_dup_review" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_dup_review" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_dup_review" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION fo_dup_review_no_delete() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION fo_dup_review_no_delete() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
