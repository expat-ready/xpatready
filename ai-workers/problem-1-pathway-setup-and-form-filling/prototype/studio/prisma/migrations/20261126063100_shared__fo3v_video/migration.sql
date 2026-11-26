-- FO-3v part 1 (BACKLOG row FO-3v; brief lead-b-briefs/FO-3v.md; AG-4-58 rules 2-4, §7, §12; AG-4-29 rules 2, 5-7, 9,
-- §7, §10; AG-16-73): video meeting links, in their own area file (prisma/schema/front-office-video.prisma, P-600).
--   * fo_video_pref: a person's own "My meeting link" and choice, one row per person (AG-4-58 §7), own record only;
--   * fo_booking_video: the link a Video booking got at confirmation, its source, an external id for part 2's Zoom
--     meeting, and voided_at for a cancel (AG-4-29 §7, rule 9); one per booking, keyed on (firm_id, booking_id);
--   * both links: https only, at most 2,048 characters, no white space or control characters (AG-4-58 rule 2; AG-4-29
--     §10), by a check, so no writer can store another;
--   * a person deactivated → their row is dropped in the same transaction (AG-4-58 §12), by a trigger on platform_staff
--     (fo_video_drop_on_deactivate); the booking service also never uses an inactive host's link;
--   * PF-12's wall on both tables (forced policy on the session's firm, the firm gate first).
-- No row is written here. Rollback: DROP TRIGGER "fo_video_drop_on_deactivate" ON "platform_staff"; DROP FUNCTION
-- fo_video_drop_on_deactivate(); DROP TABLE "fo_booking_video"; DROP TABLE "fo_video_pref"; DROP FUNCTION
-- fo_video_link_ok(text); DROP TYPE "FoMeetingProvider"; DROP TYPE "FoVideoSource";
-- CreateEnum
CREATE TYPE "FoVideoSource" AS ENUM ('CALENDAR', 'ZOOM', 'MY_LINK');

-- CreateEnum
CREATE TYPE "FoMeetingProvider" AS ENUM ('GOOGLE_MEET', 'TEAMS', 'ZOOM', 'MY_LINK', 'MANUAL');

-- CreateTable
CREATE TABLE "fo_video_pref" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "my_meeting_link" TEXT,
    "source_choice" "FoVideoSource",
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fo_video_pref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fo_booking_video" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "meeting_link" TEXT NOT NULL,
    "provider" "FoMeetingProvider" NOT NULL,
    "external_meeting_id" TEXT,
    "voided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fo_booking_video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fo_video_pref_firm_id_staff_id_key" ON "fo_video_pref"("firm_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "fo_booking_video_firm_id_booking_id_key" ON "fo_booking_video"("firm_id", "booking_id");

-- AddForeignKey
ALTER TABLE "fo_video_pref" ADD CONSTRAINT "fo_video_pref_firm_id_staff_id_fkey" FOREIGN KEY ("firm_id", "staff_id") REFERENCES "platform_staff"("firm_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "fo_booking_video" ADD CONSTRAINT "fo_booking_video_firm_id_booking_id_fkey" FOREIGN KEY ("firm_id", "booking_id") REFERENCES "fo_booking"("firm_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- The rules Prisma cannot say (AG-4-58 rule 2; AG-4-29 §10), the same as the API's linkOk: one https URL, at most 2,048
-- characters, printable ASCII only (no white space, control, invisible or direction-changing character, none of
-- " < > \ ^ ` { | }), so nothing a calendar file or an email could read as a new line or field, and no user or password
-- before the host. Byte ranges, so the database's collation cannot widen them (breaker m2).
CREATE FUNCTION fo_video_link_ok(link text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT octet_length(link) <= 2048 AND link ~ '^https://[]!#-;=?-[_a-z~]+$' COLLATE "C" AND link !~ '^https://[^/?#]*@'
$$;
ALTER TABLE "fo_video_pref" ADD CONSTRAINT "fo_video_pref_link_check" CHECK ("my_meeting_link" IS NULL OR fo_video_link_ok("my_meeting_link"));
ALTER TABLE "fo_booking_video" ADD CONSTRAINT "fo_booking_video_link_check" CHECK (fo_video_link_ok("meeting_link"));

-- AG-4-58 §12: a deactivated person's saved link and choice are dropped, in the deactivation's own transaction.
-- PF-12's rule for a trigger function on a firm table: SECURITY DEFINER, owned by xr_wall_reader, pinned search_path; it
-- deletes only the deactivated person's own row (their firm and id), so the reader's reach goes no further.
CREATE FUNCTION fo_video_drop_on_deactivate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  DELETE FROM "fo_video_pref" WHERE "firm_id" = NEW."firm_id" AND "staff_id" = NEW."id";
  RETURN NEW;
END
$fn$;
CREATE TRIGGER "fo_video_drop_on_deactivate" AFTER UPDATE OF "status" ON "platform_staff" FOR EACH ROW
  WHEN (NEW."status" = 'DEACTIVATED' AND OLD."status" IS DISTINCT FROM NEW."status") EXECUTE FUNCTION fo_video_drop_on_deactivate();
-- F4 (20261121230000) took CREATE on public from xr_wall_reader; the owner change needs it for this statement only (check_pf8b_f4_migrations.ts).
GRANT CREATE ON SCHEMA public TO xr_wall_reader;
ALTER FUNCTION fo_video_drop_on_deactivate() OWNER TO xr_wall_reader;
REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;
REVOKE ALL ON FUNCTION fo_video_drop_on_deactivate() FROM PUBLIC;

-- PF-12's wall (forced policy on the session's firm, the firm gate first; tests/check_pf12_walls.ts).
ALTER TABLE "fo_video_pref" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_video_pref" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_video_pref" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
ALTER TABLE "fo_booking_video" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY "pf12_firm" ON "fo_booking_video" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());
CREATE TRIGGER "0_pf12_firm_first" BEFORE INSERT OR UPDATE ON "fo_booking_video" FOR EACH ROW EXECUTE FUNCTION platform_firm_first('firm_id');
