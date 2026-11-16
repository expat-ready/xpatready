-- FO-3pa (rows rev 16.23, 16.30; Lead B's answers on PR #1830, 15 Nov; concept fo-3-booking r2 BR-1, BR-8; AG-4-16
-- rule 1, AG-4-36..-38 rules 4 and 8; AG-04 v2.1 Booking.cancelReason): three switches on a booking type, and the
-- booker's cancel reason on the booking. Additive only: new columns with defaults that keep today's pages
-- as they are (every active free-consultation type listed, reschedule and cancel by link allowed); the reason is NULL for
-- every existing row. No row, other column or table changes.
ALTER TABLE fo_consultation_type
  ADD COLUMN show_on_booking_page boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_reschedule     boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_cancel         boolean NOT NULL DEFAULT true;

-- The reason a booker gives when cancelling by link: at most 500 characters, and only on a cancelled booking.
ALTER TABLE fo_booking
  ADD COLUMN cancel_reason text NULL,
  ADD CONSTRAINT fo_booking_cancel_reason_check CHECK (cancel_reason IS NULL OR (char_length(cancel_reason) <= 500 AND status = 'CANCELLED'));
