-- FO-3sa (rows rev 16.23; AG-4-63 rule 4, AG-4-26 O4): staff may book a host over another of the host's bookings after
-- "Book anyway". The booking row is the host row while a booking has one host (collective hosts are not built), so the
-- staff member who confirmed the overlap is kept on it, and the no-overlap rule skips a confirmed row. Public and
-- self-service writes never set it; their free-time check still reads every active booking, confirmed ones too, so the
-- public page stays strict. A move clears it unless that move is itself confirmed (the service).
-- Down: ALTER TABLE "fo_booking" DROP CONSTRAINT "fo_booking_no_overlap"; ADD the FO-1b constraint again (WHERE status
-- IN ('SCHEDULED', 'RESCHEDULED')); DROP COLUMN "overlap_confirmed_by_user_id".
ALTER TABLE "fo_booking" ADD COLUMN "overlap_confirmed_by_user_id" UUID;
ALTER TABLE "fo_booking" DROP CONSTRAINT "fo_booking_no_overlap";
ALTER TABLE "fo_booking" ADD CONSTRAINT "fo_booking_no_overlap" EXCLUDE USING gist ("firm_id" WITH =, "staff_id" WITH =, "block_range" WITH &&)
  WHERE ("status" IN ('SCHEDULED', 'RESCHEDULED') AND "overlap_confirmed_by_user_id" IS NULL);
