-- FO-3pa (rows rev 16.23; Lead B's answer on PR #1830, 15 Nov; concept fo-3-booking r2 BR-1, BR-8; AG-4-16 rule 1,
-- AG-4-36..-38 rule 4): three switches on a booking type. Additive only: new columns with defaults that keep today's pages
-- as they are (every active free-consultation type listed, reschedule and cancel by link allowed). No row, other column
-- or table changes.
ALTER TABLE fo_consultation_type
  ADD COLUMN show_on_booking_page boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_reschedule     boolean NOT NULL DEFAULT true,
  ADD COLUMN allow_cancel         boolean NOT NULL DEFAULT true;
