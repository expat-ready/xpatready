-- migration · AS-1g (R1.106; brief build-lead-c-briefs/AS-1g.md; P-577, P-588 (1), AGENTS rule 4). Schema:
-- prisma/schema/library-score-grids.prisma. Additive only: two enums, four new platform-wide tables, no existing table or
-- row changes. The stamp is set at PR time (P-600).
--   * score_ruleset, score_factor, score_band, language_conversion: score grids as cited data (no workspace, no firm id,
--     so outside PF-12's firm walls like platform_plan). Every row carries source_ref {url, section, quote, date} or the
--     label Sample, exactly one of them (a check on each table).
--   * The write wall (case-side contract v0.1 §1 rule 1, P-588 (1)): the app role reads them and cannot write them
--     (INSERT, UPDATE, DELETE, TRUNCATE revoked from xr_data); the configurator's guarded change writes them on its named
--     bypass use (configurator.score-grids.apply, api/src/library-score-grids.bypass.ts) as xr_staff_bypass.
-- Rollback (as the migration's owner): DROP TABLE "language_conversion", "score_band", "score_factor", "score_ruleset";
--   DROP TYPE "score_role", "score_selection_model"; delete this folder's row from _prisma_migrations. Library changes of
--   kind score_grid stay as records; releases that carried a grid keep it in their frozen snapshot.

-- CreateEnum
CREATE TYPE "score_selection_model" AS ENUM ('FIXED_PASS_MARK', 'DRAW_RANKING');

-- CreateEnum
CREATE TYPE "score_role" AS ENUM ('PRINCIPAL', 'SPOUSE');

-- CreateTable
CREATE TABLE "score_ruleset" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "selection_model" "score_selection_model" NOT NULL,
    "pass_mark" INTEGER,
    "maximum" INTEGER NOT NULL,
    "combination_keys" TEXT[],
    "source_ref" JSONB,
    "sample" BOOLEAN NOT NULL DEFAULT false,
    "import_sha256" TEXT NOT NULL,
    "imported_by" TEXT NOT NULL,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_ruleset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_factor" (
    "id" UUID NOT NULL,
    "ruleset_id" UUID NOT NULL,
    "factor_key" TEXT NOT NULL,
    "role" "score_role" NOT NULL,
    "fact_keys" TEXT[],
    "maximum" INTEGER NOT NULL,
    "source_ref" JSONB,
    "sample" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "score_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_band" (
    "id" UUID NOT NULL,
    "factor_id" UUID NOT NULL,
    "condition" JSONB NOT NULL,
    "points" INTEGER NOT NULL,
    "source_ref" JSONB,
    "sample" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "score_band_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "language_conversion" (
    "id" UUID NOT NULL,
    "ruleset_id" UUID NOT NULL,
    "test" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "score_min" DOUBLE PRECISION NOT NULL,
    "score_max" DOUBLE PRECISION NOT NULL,
    "clb" INTEGER NOT NULL,
    "source_ref" JSONB,
    "sample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "language_conversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "score_ruleset_key_key" ON "score_ruleset"("key");

-- CreateIndex
CREATE UNIQUE INDEX "score_factor_ruleset_id_factor_key_role_key" ON "score_factor"("ruleset_id", "factor_key", "role");

-- AddForeignKey
ALTER TABLE "score_factor" ADD CONSTRAINT "score_factor_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "score_ruleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_band" ADD CONSTRAINT "score_band_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "score_factor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_conversion" ADD CONSTRAINT "language_conversion_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "score_ruleset"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ------------------------------------------------------------------------------- AGENTS rule 4: cited or Sample, never both
CREATE FUNCTION score_source_ref_ok(ref jsonb, sample boolean) RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN sample THEN ref IS NULL
    ELSE ref IS NOT NULL AND jsonb_typeof(ref) = 'object' AND ref ?& array['url', 'section', 'quote', 'date']
      AND length(btrim(coalesce(ref->>'url', ''))) > 0 AND length(btrim(coalesce(ref->>'quote', ''))) > 0
      AND coalesce(ref->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' END $fn$;
ALTER TABLE "score_ruleset" ADD CONSTRAINT "score_ruleset_cited" CHECK (score_source_ref_ok("source_ref", "sample"));
ALTER TABLE "score_factor" ADD CONSTRAINT "score_factor_cited" CHECK (score_source_ref_ok("source_ref", "sample"));
ALTER TABLE "score_band" ADD CONSTRAINT "score_band_cited" CHECK (score_source_ref_ok("source_ref", "sample"));
ALTER TABLE "language_conversion" ADD CONSTRAINT "language_conversion_cited" CHECK (score_source_ref_ok("source_ref", "sample"));
-- A pass mark only on a FIXED_PASS_MARK grid (DRAW_RANKING gives a total only, P-236); no negative points or maxima.
ALTER TABLE "score_ruleset" ADD CONSTRAINT "score_ruleset_pass_mark" CHECK (("selection_model" = 'FIXED_PASS_MARK') = ("pass_mark" IS NOT NULL) AND coalesce("pass_mark", 0) BETWEEN 0 AND "maximum" AND "maximum" > 0);
ALTER TABLE "score_factor" ADD CONSTRAINT "score_factor_shape" CHECK ("maximum" >= 0 AND cardinality("fact_keys") > 0);
ALTER TABLE "score_band" ADD CONSTRAINT "score_band_points" CHECK ("points" >= 0);
ALTER TABLE "language_conversion" ADD CONSTRAINT "language_conversion_range" CHECK ("score_min" <= "score_max" AND "clb" BETWEEN 1 AND 12);
CREATE INDEX "score_band_factor_id_idx" ON "score_band"("factor_id");
CREATE INDEX "language_conversion_ruleset_id_idx" ON "language_conversion"("ruleset_id");

-- ------------------------------------------------------------------------------ the write wall (P-588 (1), the PF-15 pattern)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "score_ruleset", "score_factor", "score_band", "language_conversion" FROM xr_data;
GRANT SELECT, INSERT, UPDATE, DELETE ON "score_ruleset", "score_factor", "score_band", "language_conversion" TO xr_staff_bypass;
