# FO-9b — one exact phone normaliser at every arrival door (R1.33's last part; QA-526, QA-528; P-747)

Item: R1.33 (Wave 1, P-745). Shaped by Lead B (8), 20 Nov 03:2x IST, at the current Lead's (Lead 98) ask. One lane, one PR, near 800 lines (P-610), J-33's new step inside (P-728).

## Why
qa 7's #2392 holds R1.33 at Partial on **QA-526 (Major)**: only `people/edit.ts` (FO-9a's staff edit) uses `duplicates/phone.ts` `phoneE164Exact`. Every other door reads phones more loosely:
* `sales/common.ts` `phone()` (used by the FO-2 doors: `sales/public.ts:100`, `sales/leads.ts:154`, `corporate/service.ts:213`) keeps a trunk 0 ("+44 (0) 20 7946 0958" is stored as +4402079460958) and stores any "+" with 7-15 digits as readable, possible or not;
* the FO person port (`people/fo-person-port.ts`) and `duplicates/service.ts` use the looser `phoneE164`;
* `booking/service.ts:126` has its own regex on the field and refuses a number with no country code.
So the same person typed two ways gets two different stored numbers and no duplicate match, which is what R1.33 forbids.

**The ruling, P-747 (QA-527, Lead 98), quoted:** "at arrival doors an impossible number is kept as typed and flagged unreadable (AG-2-84 rule 5), never refused; refused on the field only on the edit route."

## The part
1. **One normaliser.** Every arrival door (`sales/common.ts` `phone()` and so the three FO-2 doors, the FO person port, `duplicates/service.ts`, the booking door) reads a typed phone through `phoneE164Exact`: a number it returns is stored as that E.164 value and readable; anything else is stored **as typed** with `readable: false`. A trunk 0 is dropped ("+44 (0) 20 7946 0958" → +442079460958). An impossible "+" number is unreadable, never readable.
2. **Booking stops refusing** a number with no country code on the field. It keeps it as typed and flags it unreadable (P-747). The edit route (`people/edit.ts`) still refuses on the field; leave it unchanged.
3. **No new copy:** `phone()` keeps its signature `{ phone, readable }` and calls `phoneE164Exact`; no second regex stays anywhere in `front-office/` (grep in the test).
4. **QA-528 (Minor), same PR while it stays under ~800 lines:** J-33 (`tests/journeys/j_33.ts`) gains **W5**: two arrivals of the same person with two spellings ("+44 (0)20 7946 0958" through the public form, "0044 20 7946 0958" through booking) are matched as duplicates on screen. If the PR would pass ~800 lines, W5 goes in a second PR on the same lane.

## Done when (tests, pass and fail each)
* `tests/check_fo9b_phone_doors.ts`: for each door (public enquiry, lead, corporate contact, booking, person port), a trunk-0 spelling stores +442079460958 readable (fail case: the old +4402… value never appears); an impossible "+999 123" is stored as typed with readable false and the request is accepted, not refused (fail case: no 4xx); a CA local "416 555 0101" stores +14165550101 readable; booking with "555 0101" (no country code) is accepted and unreadable.
* The edit route still answers 422 for an impossible number (FO-9a's suite unchanged and green).
* A grep step: `phoneE164Exact` is the only normaliser called from `front-office/` doors; no phone regex outside `duplicates/phone.ts`.
* J-33 W5 green on GitHub's runners (walk j_33), with screenshots.
* Existing suites green: `check_fo9a_phone_edit.ts`, FO-2's sales suites, `check_fo3_booking.ts`, the duplicates suite.

## Touch
`front-office/sales/common.ts`, `front-office/people/fo-person-port.ts`, `front-office/duplicates/service.ts`, `front-office/booking/service.ts` (the phone field only), `tests/check_fo9b_phone_doors.ts`, `tests/journeys/j_33.ts`, the row's MODULE.rows fragment. Not `duplicates/phone.ts` unless a test proves `phoneE164Exact` wrong (say so on the PR first). No migration expected: stored values change only for new arrivals; say on the PR if existing rows need a backfill, and do not write one without a ruling.

## Clashes
FO-9a-c (one `personSeen`) and FO-9a-p (00 / non-0 trunk) are parked rows in the same files; FO-9a-p's `00` case is covered here by item 1, so FO-9a-p shrinks to the non-0 trunk prefixes. #2323 FO-2pv (queued) touches `sales/`: start after it merges, or merge main before the PR.

Source: QA-526 and QA-528 (qa 7, #2392), P-747 (QA-527), AG-2-84 rule 5, R1.33's Done when, P-733, P-745.
