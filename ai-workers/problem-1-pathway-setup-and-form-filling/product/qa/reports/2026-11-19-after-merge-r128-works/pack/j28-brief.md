### J-27: every lead carries a source (map row 27; J-28 inside it), rank 10
* **Waits on:** FO-2 (API), FO-4 (screens).
* **Swaps:** booking's `arrival` from `fakeArrival` to FO-2's `ArrivalPort` (`runtime-ports.ts`).
* **Screen:** FO-4's sales screens.
* **Walk:**
  * `W1`: a visitor submits the web form;
  * `W2`: a lead appears with its source; its consent per purpose is J-28's own walk (split out, 19 Nov);
  * `W3`: it sits in Unassigned;
  * `W4`: a staff member clicks Take it;
  * `W5`: Engage makes a prospect;
  * `W6`: ends at row 37's first step: book a consultation for the prospect.

### J-28: consent recorded per purpose (map row 28), split out of J-27 (Lead B (7), 19 Nov 12:3x IST, P-733)
* **Why split:** J-37's steps assert no consent, and R1.28's purposes include the web form, so J-37 is not R1.28's J-test. J-27 waits on FO-4 part 2a, part 2b, part 3, FO-2 part 5 and FO-4b. Everything R1.28 needs is on `main` once #2196 (the real `ArrivalPort`, QA-511) merges: qa already walked a ticked web form at 400 px writing one consent with wording, source and time (CAPABILITIES R1.28, 19 Nov). J-27 keeps its W1 and W3-W6 and points to J-28 for W2.
* **Waits on:** #2196 (FO-2 part 3b) on `main`.
* **Swaps:** none (`arrival` is real after #2196).
* **Screen:** the public web form (FO-2/FO-4 part 1 on `main`), the booking page (FO-3w), the unsubscribe page (PF-19b part 2) and the demo inbox.
* **Walk** (each step asserts the stored row underneath, read through the app's own reads or the walk's SQL conditions on the demo copy):
  * `W1`: a visitor submits the web form with EMAIL MARKETING ticked and another purpose unticked → one consent row for the ticked purpose only, with the wording id, source WEB_FORM and the time;
  * `W2`: the same visitor books on the booking page and ticks the booking consent → one BOOKING-source row for that purpose; a booking with the tick off records none (QA-511);
  * `W3`: the one-click unsubscribe link in a marketing mail withdraws EMAIL MARKETING only; the booking purpose stays granted;
  * `W4`: an attempt to edit a consent row is refused (the database trigger), and a new grant supersedes rather than edits;
  * `W5`: ends at row 49's first step: a marketing send to the withdrawn purpose is blocked.
* **Size:** one PR, the walk only (about 250-400 lines). Reviewer. **Proof:** R1.28's J-test (P-733 (3)).

