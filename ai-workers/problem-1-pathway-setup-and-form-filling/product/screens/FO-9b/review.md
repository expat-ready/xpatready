# Review: FO-9b, one exact phone normaliser at every arrival door (R1.33; QA-526, QA-528; P-747)

Reviewer agent (did not build it), 20 Nov. Commit `4bdf017a991d0fadd2b43235462b336a6c8e0465` on `claude/confident-mendel-v60owc`. The brief stands in for the concept (`origin/lead-b-front-office:…/design/lead-b-briefs/FO-9b.md`; no `concept.md`). Ruling P-747: "at arrival doors an impossible number is kept as typed and flagged unreadable (AG-2-84 rule 5), never refused; refused on the field only on the edit route." Journey walk and score: `journey-test-reviewer-2026-11-20.md` (this folder).

## What I ran (all on this commit, port 4434 only)
* `check_fo9b_phone_doors.ts` **23/23**; `check_fo9a_phone_edit.ts` **36/36**; `check_fo9a_duplicates` 53/53; `check_fo2p3b_arrival_port` 53/53 (the ArrivalPort contract on the fake and the real adapter); `check_fo3_booking` 133/133; `check_fo2_leads_prospects` 113/113; `check_fo1p_person_port` 35/35.
* `j_33.ts rev9b 4434` on an isolated copy: **19/19** including W5 (re-shot PNGs restored afterwards). `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0.
* My own browser walk on a second isolated copy (:4434): booking page at 1440, 1024, 720 (200 % zoom) and 400 px, keyboard only, axe, double click, the public web form with junk numbers; database read after each step.
* A probe of `phoneE164Exact` against the old FO-2 rule on 22 inputs (results under M1).

## The brief, line by line
| Brief line | Result |
|---|---|
| Every door reads through `phoneE164Exact`; readable → E.164, else as typed with `readable: false` | Met for public form, Add a lead, company contact, person port, booking, duplicate check (check D1-D6; my walk J1, J4) |
| Trunk 0 dropped (+44 (0) 20 … → +442079460958); old +4402… never stored | Met (D1-D4; J-33 W5 database line) |
| An impossible "+" number is unreadable, never readable | **Partly**: "+999 123" is unreadable, but "+1 000 123 4567" and the un-prefixed "000-000-0000", "0000000000", "123 456 7890" are stored readable (**M1**) |
| Booking stops refusing a number with no country code | Met: "555 0101" booked, kept as typed, "Fix number" on the lead page (J1) |
| Edit route still refuses on the field | Met (check E, FO-9a suite 36/36, J-33 W2) |
| `phone()` keeps `{ phone, readable }`; no second regex in `front-office/` | Met (`sales/common.ts:46-51`; check G greps api and web front office) |
| J-33 W5: two spellings by two doors matched on screen | Met: the two emails differ, so `possibleMatch` (`sales/arrival.ts:40`, email or readable phone) can only have matched on the phone |
| Backfill: say on the PR, do not write one | No backfill written (correct). The FO-9b PR is not open yet, so the note is still owed (m2) |

## The three steps outside the touch list
1. **`ports/arrival.ts` `phoneReadable: false`**: justified. The booking door can only reach the person through this port, and its contract took E.164 only, so the brief's "booking accepts '555 0101' as unreadable" could not be met inside `booking/service.ts`. The change is additive (optional flag; an unflagged phone must still be E.164, `ports/arrival.ts:26-28`). Fake and contract were updated, and the contract runs green on both adapters. The real `keepPhone` now carries `readable` (`sales/arrival-port.ts:121-125`), which is needed: with `true` there an unreadable number would hit `fo_person_phone_check` and give a 500. Accepted.
2. **`duplicates/phone.ts` reads `00` dialling**: justified by a failing test (P0: with region CA, "0044 20 7946 0958" gave null). The lookahead `^00(?=[\s.()-]*[1-9])` is narrow ("00", "0044", "00 0 …" are not rewritten), and the exact-digits guard still runs. Accepted. The brief asked for this to be said on the PR first; put it in the PR body.
3. **`booking-public/type-page.tsx` no longer refuses a number without a country code**: justified by P-747 on the screen, and W5 needs it. The hint "Include your country code, e.g. +1 416 555 0100" stays as guidance, and an empty phone in phone mode is still refused on the field. Accepted.

## Issues, ranked
**M1 (Major, Must). Placeholder and impossible North American numbers are now stored readable at the FO-2 doors and the booking door, with no "Fix number", and unrelated people are flagged as possible matches.** `duplicates/phone.ts:24,27` decides readability with `isPossible()`, which checks length only. With region CA, "000-000-0000" and "0000000000" become `+10000000000`, "123 456 7890" becomes `+11234567890`, and "00 0 123 4567" becomes `+10001234567`. `isValid()` is false for all of them: no NANP area code or exchange starts with 0 or 1. On `origin/main`, FO-2's rule (`^1?[2-9][0-9]{9}$`) kept these unreadable, and booking refused them. So this PR newly lets them in at four doors. Evidence (my walk J6, `shots/J6-junk-possible-match-1440.png`): two visitors sent the public form with "000-000-0000" and "0000000000". Both rows are `+10000000000|true`. The second lead shows "Possible match: Junk1… (L-00004)" with no Fix number pill. This breaks P-747 ("an impossible number is … flagged unreadable") and brief item 1 ("An impossible '+' number is unreadable, never readable": "+1 000 123 4567" stays readable). It also defeats R1.33's purpose (correct duplicate matching) for the junk number visitors type most often. The duplicate check and the person port already read these numbers loosely before this PR; the regression is the FO-2 doors and booking. **Fix** (the brief allows touching `phone.ts` once a test proves it wrong): in `phoneE164Exact`, for country calling code 1, require the national number to match `^[2-9][0-9]{2}[2-9][0-9]{6}$` (the NANP plan), or require `n.isValid()` for +1. Add P0 fail cases ("000-000-0000", "0000000000", "123 456 7890", "+1 000 123 4567", "00 0 123 4567" → null) and one door case (public form "000-000-0000" → kept as typed, unreadable, no possible match). "416 555 0101", "1 (416) 555-0101" and the W5 spellings stay readable. The edit route would then refuse these numbers too, which P-747 wants.

**m1 (Minor, Should). The new `keepPhone(readable=false)` branch has no test.** `sales/arrival-port.ts:125`: an existing person with an open prospect and no phone books with "555 0101". Reverting it to `phoneReadable: true` would turn that booking into a 500 (the DB check), and no suite would notice. Add one line to `check_fo9b` D5.

**m2 (Minor, Should). Say the backfill question on the PR.** Rows stored under the old rule (`+4402…`, readable "+999123") keep their old `phone_e164`. Since `duplicates/service.ts:31-34` dropped the FO-2 fallback, a new "+44 (0) 20 …" no longer meets an old `+4402…` row. The brief asks for this to be stated on the PR and a ruling requested. No backfill without one.

**m3 (Minor, Should). The fakes and their comments drift from the adapter.** `ports/fo-person.ts:117,143-146` still describe the fake's `sampleE164` as "FO-2's common.ts rule" and point callers to `phoneE164`. That rule is gone, and the fake now disagrees with the adapter on "+999 123" (readable) and "0044 …" (unreadable). In `ports/arrival.ts:160-164`, the fake `addPerson` keeps a `phoneReadable: false` phone as a contact phone, unlike the fake `bookingArrived` (`:127-128`). Fix the comments, and make `addPerson` drop the unreadable phone the same way.

## D1–D20 (this item's scope)
D1 Partly: every door is unified, but impossible +1 numbers are readable (M1) · D2 Partly: junk numbers create false duplicate keys (M1) · D3 Met: one normaliser, no second regex (check G) · D4 N/A · D5 Met: a double click on "Book this time" makes 1 booking (J5) · D6 N/A · D7 N/A (no AI) · D8 Met: the lead page shows Sales › Leads › Lead · D9 Met: "Fix number" is the next action for an unreadable number · D10 Met: plain hint and field sentence · D11 Met: confirmation "The firm will call you on 555 0101"; but no pill for junk numbers (M1) · D12 Met (screenshots) · D13 Met: axe 0 on details, error and booked; no sideways scroll at 400, 720 and 1024 px; keyboard-only booking succeeded · D14 Met: team components unchanged · D15 Met: no per-row work added · D16 Partly: each door has a pass and a fail, but M1's rule and m1's branch have no failing test · D17 simulated only · D18 Met: the lead shows "Source Booking page" · D19 Met for this slice (booking → lead → match → fix) · D20 simulated only.

## BIC scorecard (EXPERIENCE §6)
N/A: a front-office arrival and normaliser item, not a case-side screen (§6 scope).

## Could not check
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); GitHub's `walks` run of J-33 (the PR is not open); stored rows on the shared demo database (:4400 is off limits), so I cannot count how many old-rule rows exist.

**Verdict: Block** for `4bdf017a991d0fadd2b43235462b336a6c8e0465`. To fix: **M1** (`duplicates/phone.ts:24,27`, with failing tests). m1-m3 should go in the same PR.

## Re-review (diff only) on 95eb6452
Diff read: `git diff 4bdf017a…95eb6452`. It changes `duplicates/phone.ts`, `ports/arrival.ts`, `ports/fo-person.ts`, `tests/check_fo9b_phone_doors.ts`, and commits this review and the journey report as written. Everything below ran on 95eb6452, port 4434 only:
* `check_fo9b_phone_doors` 26/26
* `check_fo9a_phone_edit` 36/36
* `check_fo9a_duplicates` 53/53
* `check_fo2p3b_arrival_port` 53/53
* `j_33.ts rev9b 4434` 19/19 (re-shot PNGs restored)
* my 22-input probe of `phoneE164Exact`

| Finding | Status | Evidence |
|---|---|---|
| **M1** (impossible +1 numbers readable) | **Closed** | `duplicates/phone.ts:31` refuses a +1 national number outside `^[2-9][0-9]{2}[2-9][0-9]{6}$`. The probe now reads nothing for "000-000-0000", "0000000000", "123 456 7890", "00 0 123 4567", "+1 000 123 4567", "(000) 123-4567" and "00 1 000 000 0000". These still read: "416-555-0101", "1 (416) 555-0101", "+44 (0) 20 7946 0958", "0033 6 12 34 56 78", "+91 98765 43210". The rule has a failing test (P0 NANP_BAD), plus a door case (D2: "000-000-0000" → `000-000-0000\|false\|-`). Removing line 31 fails both. The edit route now refuses these numbers too, as P-747 wants; FO-9a's suite is still 36/36 |
| **m1** (`keepPhone(readable=false)` untested) | Closed | The new D5 case puts an open prospect on file with no phone; the booking then gives "555 0101". Result: stored `555 0101\|false\|-`, no refusal. With `readable: true` the update would break `fo_person_phone_check`, the transaction would throw and `heldR` would be non-null, so the test guards the branch |
| **m2** (backfill question on the PR) | Open (Minor) | Goes in the PR body when the PR opens, as the brief asks. It does not block |
| **m3** (fakes drift) | Closed | `ports/fo-person.ts:117-118,147` now name `phoneE164Exact` and say the Sample rule is FO-2's old one. The fake `addPerson` in `ports/arrival.ts:161-165` keeps an unreadable phone out of the contact, as `bookingArrived` does |

No new issues in the diff. The NANP rule only acts on country code 1, so every non-+1 number reads as before. The journey score stays at 8.5/10: "Correct data" rises to 1 now that M1 is fixed, which would make 9.5, but I did not re-walk the browser journeys, so I leave the score as walked.

**Verdict: Approve** for `95eb64522df1f575f0af86e3be091de920aab13c` (no open Blocker or Major; m2 to go on the PR).
