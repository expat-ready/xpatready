# Review: FO-3c-warn (R1.104, the consultation agreement warns and never blocks)

Commit reviewed: **f53b39de6f13984b0f6a84030e614da3c3a3e068** on `claude/busy-franklin-vxa7am-warn`, compared with origin/main (`git diff origin/main...f53b39de6`; main has 19 newer commits, none touching these paths). Reviewer: a session that did not build it, 24 Nov 2026.
The ruling under review: Lead 26 on #3471 (comment 7127584647), from the founder. AG-4-15 rule 4 says "Not accepted yet" is "a warning on the booking and never blocks anything". AG-04 Rule 7 says "Warn, never block; no regulator or statute names in product text". Legal reading: Unconfirmed: no counsel.
Note: while this review ran, another session left uncommitted edits to 7 of these files in the shared checkout (from 10:13 UTC). They also wrote `break-report.md` in this folder. Every run below finished before those edits (my last run ended 10:12:06; the copy's served text matches the commit). This review covers the commit only.

## Verdict: Rework (Block). One Major is open (M1).

## What I ran (on f53b39de6)
- **Red on main:** I used a worktree of origin/main (574a873b9) plus this branch's `check_fo3c2`. P2 Attended FAILs (409). P2 record FAILs (409). Then the suite stops: "agreementWarning is not a function". That gives 4 passed and 3 failed, as the builder said.
- **Green:** check_fo3c2 61/0, check_fo3c 42/0, check_fo3a2_consult_record 39/0, check_fo3_booking 133/0, check_fo3sr_routes 29/0, check_fo3m_answers 14/0.
- **j_104** on the isolated copy `j104r` gave 20/20. I used port 4435, the runtime range in WAY-OF-WORKING, never :4400. I restored the screenshots the run overwrote.
- **My own walk** on the same copy, as Client C: 1024 px with the keyboard only, then 1440 px, then 720 px CSS (200 % zoom). Client D for wrong role. The database was read underneath. Details are in `journey-test-reviewer-2026-11-24.md`.

## Lead 26's five points
1. **No refusal: met.** `assertAgreementSigned` is gone. The grep finds no `AGREEMENT_NOT_SIGNED` 409, `agreementHold` or `HOLD_WORDS` left in the studio. Attended (`booking/service.ts:455-463`) and the consult record (`consult/service.ts:137-160`) save in every agreement state. No-show is unchanged. The reminder and confirmation code is untouched. **The one next step: not met (M1).**
2. **Met.** No migration, no reason picker, no firm setting.
3. **Met.** The tests failed first (shown above). Signed, SIGNED_OFFLINE (W2, B10), ended (B2, B6), none sent (W1, N1-N5), the type switched off (R1) and No-show (B7, N5) are each covered. A role without the key is still refused: W3 gives 403/404, and my run gave Client D 404/404 with the booking unchanged.
4. **Met for the changed words.** Test W4 checks them, and nothing new names a regulator. Not a finding: the template checklist (`consultation-agreement/items.ts`, `retainer-page.tsx:182`) is FO-3c part 1 / P-627 (7), outside this item. **Money at Attended:** my run wrote one `booking.completed` to `module_event`. Nothing consumes it for billing (the grep finds no consumer), so AG-4-44 is unchanged.
5. **Met.** The comments carry "Unconfirmed: no counsel".

## D1-D20 (1-5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 3 | Never blocks (P2, W1). The words after Attended break "the one next step" (M1). |
| D2 Data integrity | 4 | My run stored one record row and one outbox event; the row lock is unchanged. The warning is read after commit (m2). |
| D3 Reuse | 4 | One `agreementWarning` serves Attended, the record and the panel. The panel still writes its own words (M1). |
| D4 Rule integrity | 3 | CLIENT_SIGNED + Attended says it "can no longer be signed for", but `hostLink` still signs it (M1b). |
| D5 Stability and recovery | 3 | The record's warning survives a reload. A failed read after commit gives a 500, and the retry then says STALE_VERSION (m2). |
| D6 Governance | 4 | Audit is unchanged. Stale "hold" comments remain (m5). |
| D7 AI trust | N/A | No AI. |
| D8 Orientation | 5 | The booking panel has its path and an Attended pill. |
| D9 Flow | 2 | One panel shows opposite next steps after Attended (M1). |
| D10 Language | 3 | Plain words, no statute. But: "Attended … can still be saved" appears on an Attended booking, and staff are told to reschedule a meeting that took place (m1). |
| D11 Feedback and state | 4 | The warning stays after Attended, and the notice shows after save and after reload. The record section shows nothing before the first save (m4). |
| D12 Visual quality | 4 | Team `Notice` and `Pill` in the warn tone. |
| D13 Accessibility | 4 | Axe finds 0 at 1024 and 1440 px. No sideways scroll at 1024 px or 720 px. Attended and Save record work by keyboard. |
| D14 Team look | 4 | Same panel and components. |
| D15 Speed | 5 | The panel opens in 377-416 ms. Attended saves in 222 ms. |
| D16 Testability | 3 | The tests failed first and cover each state. No test checks that the next-step words match what the link and `hostLink` actually do after Attended (M1). |
| D17 First use | simulated only | |
| D18 Provenance | 4 | The record's notice uses the server's words. The panel's words differ from them (M1). |
| D19 Closure | 4 | Booking, Attended and record close without the signature, as ruled. |
| D20 Pain and wow | simulated only | |

## BIC-01-20
N/A: a front-office booking panel, not a case-side screen (EXPERIENCE §6 scope).

## Issues, ranked
**M1 (Major, Must): after Attended (and No-show), the booking gives a false or contradictory next step.** The ruling asks for "the one next step".
- (a) The agreement is sent or viewed, then the booking is marked Attended. The panel (`web/…/calendar/agreement.tsx:48`) says "Not signed yet. The client signs from the link in their email, then Client C signs." But the client's link answers not-found once the booking leaves Scheduled (`consultation-agreement/service.ts:281-284` `bookingActive`, used at `:402-403`). In the same panel, the record's notice says "can no longer be signed for or rescheduled". My walk's booking b3 shows both texts together, as does the j_104 W4 capture. j_104 W6 itself has to sign W5's agreement "because W4's meeting was let start".
- (b) The client signs (CLIENT_SIGNED), then the booking is marked Attended. `gate.ts:41` (`WARN_WORDS_INACTIVE`) says it can no longer be signed for. But `hostLink` (`service.ts:481-485`) has no booking-status check, so the firm can still sign. Meanwhile `needsYou` (`service.ts:~360-366`, Scheduled or Rescheduled only) drops the signer's item. The break report's X2 reproduces this; I confirmed it in the code.
- (c) Before Attended, `WARN_WORDS` (`gate.ts:39`) and the panel never say that saving Attended ends the client's link. Under "warn, never block", that is the deciding fact.
- **Fix:** one set of words per booking status and agreement status, written once on the server. The panel shows those words. Add a test per state, including CLIENT_SIGNED + Attended and SENT + Attended, that checks the words match what `openAs` and `hostLink` do.

**Minor (Should):**
- **m1.** `missingWords` for NOT_SCHEDULED (`gate.ts:~78`) tells an Attended booking that "Attended and the consult record can still be saved" and to "make a new booking" "to meet the client". `NEXT_WORDS.started/startedSending` (`gate.ts:71-72`) and `NEXT_RESCHEDULE` (`contracts/consultation-agreement-words.ts:6`) advise rescheduling a meeting that took place.
- **m2.** The warning is read after the commit (`booking/service.ts:463`, `consult/service.ts:160`). A failed read gives a 500 after a successful save, and a retry of the record then says STALE_VERSION. Fix: read it inside the transaction, or answer null on failure.
- **m3.** `GET|PUT consult-record` gives `agreementWarning` (agreementId, causes) to an `agent/booking:edit` holder whom the agreement read refuses (`consult/service.ts:179` against FO-3vr, suite P5). The data stays in the same firm. The break report's X9 shows it; I confirmed it in the code.
- **m4.** The record section shows no warning before the first save: the GET gives 404 NO_RECORD without the warning (`consult/service.ts:118`, `consult-record.tsx:101`). The panel above covers this only for viewers that `by-booking` lets through.
- **m5.** Stale words still describe a block: `gate.ts:26-27` ("lifts the hold"), `:36`, `:45`; `consultation-agreement/service.ts:133`; `contracts/consultation-agreement-words.ts:1` ("while its consultation agreement holds"); `j_104.ts:4` ("Done when … cannot start until signed").
- **m6.** The committed `J-104/screenshots/w4-attended-before-signing-1440.png` predates 06a9cfd29's panel words, so it shows a sentence the code no longer shows.

## Graph (P-86)
`graph.mjs` gives G1 0, G2 0, G4 0, G5 0 (G3 276 and G6 24 are firm-wide). The routes this item touches are named by tests: POST attendance (check_fo3c2 P2/W1, j_104 W4), GET/PUT consult-record (check_fo3c2 P2/W1, j_104 W4/W9), by-booking (j_104 W3/W9).

## What I could not check
- A real screen reader, or an intended user's unaided walk (D17 and D20 stay with the founder).
- The CLIENT_SIGNED + Attended path and m2/m3 live: I confirmed them from the code and the break report's repros.
- A cancelled booking with an agreement still sent.

**Verdict: Block** on f53b39de6f13984b0f6a84030e614da3c3a3e068. To fix: M1 (a, b, c), with its tests. m1-m6 should be fixed in the same round.

Reviewer: Block f53b39de6f13984b0f6a84030e614da3c3a3e068

## Re-review, 24 Nov 2026: head 9e97b8aa33ee582249a434926e0c8850e7e0c67f
This covers commits 7d4f457cd and 9e97b8aa3, the builder's fixes. The checkout was clean at this head.

**Runs:**
- **Suites:** check_fo3c2 65/0, check_fo3c 42/0, check_fo3a2_consult_record 39/0, check_fo3_booking 133/0, check_fo3sr_routes 29/0, check_fo3m_answers 14/0.
- **Red first:** this head's check_fo3c2 run on f53b39de6 gives 61/4. W1 record, W5, W6 and W7 fail there.
- **j_104:** 20/20 on `j104r` :4435. Screenshots restored afterwards.
- **My walk:** at 1024 px with the keyboard only, at 1440 px and at 720 px CSS. Axe 0; no sideways scroll; Client D 404/404 with the booking unchanged; one `booking.completed`.

**My list:**
- **M1 — closed.** `gate.ts` `warnWords(bookingStatus, agreementStatus)` is now the one set of words. `forBooking` returns them as `warning`, and `agreement.tsx:51` shows them, adding the reschedule step only while the booking can be rescheduled.
  - (a) Sent, then Attended: on my walk the panel and the record's notice read the same words: "…the client's link no longer opens: to meet the client again, make a new booking…". W6 confirms that `openAs` returns 404.
  - (b) Client signed, then Attended: the words are WARN_WORDS_FIRM. `needsYou` keeps the item unless the booking is cancelled, and `hostLink` returns 200 (W5).
  - (c) WARN_WORDS now says that saving Attended ends the client's link.
- **m1 — closed.** The words for an Attended booking with nothing sent no longer say what can be saved (seen live). The reschedule advice now says "if the meeting did not take place" (`gate.ts:76-77`, `consultation-agreement-words.ts:6`).
- **m2 — closed.** Attended and the record read the warning inside their transaction (`booking/service.ts:456-466`, `consult/service.ts:162`). A failed read rolls the save back.
- **m3 — closed for this change.** The record's warning is `{code, words}` only (`consult/service.ts:31`, test "W1 record"). The record's own visibility rule predates this change and is noted on the PR.
- **m5 — closed.** No "hold" or "cannot start" words remain in the FO-3c files; only the internal type name `Hold` is left. The j_104 header records the 24 Nov ruling.
- **m6 — closed.** The W4 screenshot shows the shipped words.
- **m4 — server fixed, screen not fixed (Minor, Should).** The 404 NO_RECORD answer now carries the warning: I saw it live and W7 tests it. But `problemOf` (`web/src/modules/front-office/sales/contract.ts:10`) keeps only known fields and drops `agreementWarning`. So `consult-record.tsx:364` always reads `undefined`, and the record section shows no notice before the first save (my walk r5; the j_104 W4 capture). No test reads the screen here; W7 checks only the server. The booking panel above still shows the same warning to the host, so the user is warned.
  - **Fix:** read the raw problem body, or let `problemOf` keep `agreementWarning`. Add a screen check before the first save.

**Journey score: 9.5/10.** Feedback and state scores ½ for m4; every other criterion scores 1. The bar is 8 or more with no 0.

**D-score changes:** D1 4, D4 4, D5 4, D9 4, D10 4, D16 4. D11 stays 4 (m4). The other scores are unchanged.

No Blocker or Major is open; m4 is a Minor to fix in the next round.

Verdict: Approve 9e97b8aa33ee582249a434926e0c8850e7e0c67f

Reviewer: Approve 9e97b8aa33ee582249a434926e0c8850e7e0c67f

## Delta, 24 Nov 2026: head 533edb98ca95c417030d2fd3b6d5b15ed78aec99 (from 9e97b8aa3)
**Change.** This covers m4 only.
- `problemOf` (`sales/contract.ts:10-13`) now keeps `agreementWarning` when it is `{code, words}` strings. The change is additive and typed, and `tsc -p web` is clean.
- `consult-record.tsx:81` reads that field.
- j_104 W4 now also needs the record section to warn before its first save.
- 533edb98c only restores the fo-4-sales screenshots, so the net diff has no fo-4 files.

**Runs.**
- **j_104:** 20/20 on `j104r` :4435.
- **My probe on the same copy:** I marked a fresh booking Attended with no record yet. The record section shows "Consultation agreement not signed …" right after the click and again after a reload. At 9e97b8aa3 the same probe showed nothing.
- **check_fo4_sales_browser** (shared `problemOf`): 47/47 on `fo4r` :4436.
- I restored every screenshot my runs overwrote.

**Result.** m4 is closed. No findings remain open from my list; the record's own visibility rule predates this change and is noted on the PR. Journey score: 10/10, because feedback and state is now 1.

Verdict: Approve 533edb98ca95c417030d2fd3b6d5b15ed78aec99

Reviewer: Approve 533edb98ca95c417030d2fd3b6d5b15ed78aec99
