# FO-3pa review: public booking answers (API only, no screen)

Reviewer: independent Opus 5.5 session, 15 Nov 2026. Commit reviewed: **d53843344** (b1899c3a7 plus the builder's commit of the two files sent to me uncommitted, the schema and the `20261115110000_fo3pa_booking_type_flags` migration; same content I read). Diff: `git diff 2a3589aeb d53843344 -- studio`. Brief 6774aee3d:`lead-b-briefs/FO-3pa.md`, plus Lead B's answers (three columns, optional `consent` on the port, reason kept in the audit only, DW9). Concept fo-3-booking r2 §3 BR-1..BR-11, §6.
Uncommitted edits to `public.controller.ts` and `service.ts` showed up in the working tree while I was reviewing (fixes for the break report). I did **not** review them; they need a re-review of their own diff.

## Verdict
**Ship after fixes.** There is 1 Blocker and 1 Major. Journey score 7/10 (below the pass mark, see `journey-test-reviewer-2026-11-15.md`).

## Runs (Postgres 127.0.0.1:54329; the probe used :4431 from the runtime range, never :4400)
* `check_fo3pa_public_answers.ts` 31 passed, 0 failed · `check_fo3_booking.ts` 133/0 · `check_fo3sr_routes.ts` 29/0.
* `tsc --noEmit -p api/tsconfig.json`: no error in a changed file. The 15 errors it reports are all in other tests (c18, c69, cost_check, vv_checklist, x2b).
* Reviewer probe: a copy of the suite's harness in the scratchpad, run against a `git archive` of d53843344. Results are quoted below.

## Issues (ranked)
1. **Blocker: a cancel by link with a reason answers 500 and does not cancel.** It happens with a reason of 201 to 500 characters (allowed by `CancelBody`, service.ts:80 in the diff) or any reason containing an email address. `cancelBooking` puts the reason in `detail` (service.ts:236 in the diff), and `AuditDetail` (ports/audit.ts:16-22) caps a detail string at 200 and refuses anything shaped like an email. The real adapter parses the same schema (`api/src/platform/audit/audit-event.ts:28`), so production fails the same way. Probe: a 300-char reason → `500 {"message":"Internal server error"}`; `"a"×500` → 500; `"Please write to ana@client.example instead"` → 500, booking still SCHEDULED. DW7 misses this because it only tries a short reason and a 501-char one. **Conflict to raise, not settle:** the brief says up to 500 characters in the audit entry, but the port says detail holds "ids and facts only, never personal data", and a booker's free text is personal data. Raise it with Lead B / the tech lead ("Question for the tech lead", or `challenge.md`). Whatever the ruling, a reason must never cause a 500: either the body refuses it with a 400 field issue, or it is stored where the port allows. Add a DW7 case at exactly 500 characters and one with an email in it.
2. **Major: the `.ics` not-found arrives as a calendar download, unlike every other not-found (BR-2, AG-4-17 rule 3, "identical response").** `Header(...)` on the route (public.controller.ts:48) sets the headers even on errors. Probe: `GET /bookings/not-a-token/ics` → `404`, `Content-Type: text/calendar; …`, `Content-Disposition: attachment; filename="invite.ics"`. The body matches the other 404s but the response does not, and a browser saves the 404 JSON as `invite.ics`. DW6's fail case compares only `text`. Fix: set the headers only on success, and make DW6 also compare `content-type` and `content-disposition` with the slug's 404.
3. **Minor: the rate limits on the new routes have no test.** `publicList` uses `slots:ip` (service.ts:109 in the diff) and `.ics` / cancel-with-body use `token:ip`. The suite sets every limit to 1000, so deleting either `limit` line still passes. Add one 429 case for the list and one for `.ics`.
4. **Minor: consent cases with no test.** (a) `consent: false` with a `consentWordingId` records no consent. The probe shows the code is right, but the mutation `if (b.consent || b.consentWordingId)` still passes every suite. (b) BR-5: a firm with no sentence books without the tick. No suite uses `fakeArrival({ wording: null })`, so putting back `if (!wording) throw notFound()` before the tick check still passes.
5. **Minor: the "switched off after the page loaded" check covers cancel only.** The DW5 late case (test:162-169) proves that `recheckToken`'s switch (service.ts:276 in the diff) is read inside the write transaction for cancel. Reschedule's late case is untested. That code path is shared, so this is a test gap, not a fault.

## Named cases DW1-DW9 (does a pass case and a fail case exist, and would the test fail if the rule were wrong)
| Case | Pass / fail cases | Proves it? |
|---|---|---|
| DW1 list, no id, one not-found | yes / yes (hidden, retired, unknown firm, capitals, firm UUID) | Yes. The exact key set and the UUID scan would catch a leak. Rate limit untested (#3). |
| DW2 hidden type = unknown slug | yes / yes (page and form, nothing saved) | Yes |
| DW3 optional tick | yes / yes (wrong wording → 409, tick without id → 400) | Mostly. Gaps in #4. |
| DW4 contact, limit hours, no ids | yes / yes (`owner_note` not leaked, firm with no address) | Yes. Address keys are on an allow-list (service.ts:310). |
| DW5 allowCancel false refused, row unchanged | yes / yes, plus the late switch | Yes for cancel and reschedule (#5) |
| DW6 .ics = mailed invite, voided → 404 | yes / yes | Yes for the content (UID, SEQUENCE, DTSTART/DTEND UTC, organizer, attendee, STATUS). Misses the error headers (#2). |
| DW7 reason in audit only, never shown back | yes / yes | The not-shown-back half is proven. The kept half breaks over 200 characters (#1). |
| DW8 join link only after confirmation | yes / yes (type page, phone, no link, cancelled) | Yes |
| DW9 (Lead B) no cancel action, refusal | yes / yes | Yes. Removing `&& type.allowCancel` fails it. |

## Other checks
* **check_fo3_booking.ts:370-372 change is right.** AG-4-19 rule 3 ("Booking never needs the tick") makes the old "no tick → 400" assertion wrong. The new one keeps the remaining rule: a tick must carry its wording id. The "no tick → books, no consent" behaviour is now covered by DW3.
* **Consent semantics:** match AG-4-19 rules 3 and 6 and Lead B's optional `BookingArrival.consent` (ports/arrival.ts:36). The wording is read only when the tick is given. The only adapter of `bookingArrived` in the repo is the fake.
* **Join link:** `publicAnswer` (service.ts:287-290 in the diff) gives the link only when the booking is SCHEDULED or RESCHEDULED and by video. The type page's `meetingLink` is fixed to null.
* **Switch re-checked under the lock:** `recheckToken` runs inside `$transaction` after `lock()`, on the type row read in that transaction (service.ts:438-441, 476-478).
* **.ics equal to the mailed one:** both come from one writer, `inviteIcs` (service.ts:293); the email path calls it at :251.
* **Migration:** additive only (`ADD COLUMN … boolean NOT NULL DEFAULT true` ×3). The defaults keep today's behaviour. Its stamp is newer than the newest one on the branch (`20261115013000_fo13…`), but this must be re-checked against `main` at merge (rows rev 15.2). The schema matches the migration. The name `allowCancel` follows Lead B's ruling, not the concept's `allowCancellation`.
* **Size (P-610):** about 418 changed lines including the migration, under 800. No explicit `any` added outside tests. No new technology (zod, Nest and Prisma were already used).
* **Duplicate-case types:** only `FREE_CONSULT` exists in `FoConsultationPurpose`, so "case types never" cannot be exercised yet. Not a finding.

## Not checked
No screen exists, so the screen-review steps that need one are N/A: keyboard walk, 1024 px / 200 % zoom, PRODUCT §3-§4 menu words, the BIC-01..BIC-20 scorecard, and D1-D20 as screen scores. D17 and D20 were simulated only. I did not run `graph.mjs`, because it rewrites `qa/GRAPH.md` and this review may write only this file and the journey report. I did not run the rest of the suites on `main` merged into the branch (the builder's step before the label), nor the RLS/tenancy test for the new list query beyond `firmScope`. The uncommitted fix edits were not reviewed.

**Verdict: Block** (Changes needed). Fix #1 (Blocker) and #2 (Major), then re-review the diff. #3-#5 are Minor.

## Re-review at 042b60cf1 (diff since d53843344 only, P-277)
Read: `git diff d53843344 042b60cf1`. The code changes are in `public.controller.ts`, `service.ts` and `check_fo3pa_public_answers.ts`; the rest are records. Runs: `check_fo3pa_public_answers` 43 passed, 0 failed · `check_fo3_booking` 133/0 · `check_fo3sr_routes` 29/0. `tsc` (api) shows no error in a changed file; the same 15 errors as before, all in unrelated tests. No explicit `any` added (the one match is the word in a comment).
* **#1 Blocker: closed.** `cancelBooking` (service.ts:488-490) now puts the reason in `summary` ("Consultation cancelled. The booker's reason: …"). That prefix is 45 characters, plus at most 500 for the reason, so 545, under the port's 600. `detail` holds ids only. `CancelBody` (service.ts:126-130) turns line breaks into spaces, trims, then caps at 500. It refuses lone surrogates, C0/C1 control characters, bidi overrides and isolates, zero-width characters and the BOM with a 400. The suite now runs on the real `auditEvent` adapter (the one that 500'd). New cases: 500 characters, a reason with an email, two lines → 200 and kept. Broken UTF-16, a bidi override, only invisible characters → 400, booking unchanged. Each of these would fail on d53843344.
* **#2 Major: closed.** The `.ics` headers are now set in the handler after `publicIcs` succeeds (public.controller.ts:39-45, `Res({ passthrough: true })`). The new DW6 case checks that the voided and garbage 404s are `application/json` with no `Content-Disposition`. DW6's pass case still checks the download headers.
* **#3-#5 Minor: closed.**
  * Rate limits: a 429 case for the list and for `.ics`, with another IP not held back.
  * Consent: `consent:false` with a wording id gives no consent.
  * BR-5: a firm with no sentence books without the tick, and a tick there gives 409.
  * The late reschedule switch is refused, booking unchanged.
  * Also new: control and bidi characters dropped from `firmContact` (service.ts:785-786) and a blank phone gives null, with a test.
* **The reason in the audit `summary`: acceptable as interim.** Lead B ruled "audit only, no column". The port limits `detail` to ids and facts but sets no such rule on `summary` ("one plain sentence a person reads"). Staff who read the audit trail will see the booker's words, which is what "kept in the audit" means. One point for Lead B, not a block: once AUD-1 makes the trail insert-only and hash-chained, free text there cannot be erased on request (Unconfirmed: no counsel). Lead B's answer on the PR settles where the reason lives for good.
* **No new finding** in the diff. The test's `getStatus` casts are test-only. The `firmContact` change only drops characters and keeps the 200-character cap.

Journey re-score: task completed, plain words, feedback and state, and error recovery go from ½ to 1 (the 500 and the `.ics` download on a 404 are gone). The score is now **9/10**, a pass with no 0. Accessibility and visual quality stay ½ (N/A, no screen: FO-3w).

Verdict: Approve 042b60cf1922e8584d0058d0d04f852630d0f111

Approve 08576c9b389e4f30d695bee0d16bc627b76a5c70 (records only since 042b60cf1)

Verdict: Approve 08576c9b389e4f30d695bee0d16bc627b76a5c70

## Re-review at d1715795a (diff since the main merge 77210ce46 only)
Read: `git diff 77210ce46 d1715795a` (7 files, +53/-33); none of `main`'s own changes. Runs: `check_fo3pa_public_answers` 45 passed, 0 failed · `check_fo3_booking` 133/0. I did not start `run-suites.sh` (one was already running in this copy).
* **Migration re-stamp: correct.** The migration is now `20261115170000_fo3pa_booking_type_flags`, after `main`'s newest (`20261115120000_pf6b_permission_catalogue`). The old 110000 folder is gone; it was never on `main`. It is still additive only: the three type switches as before, plus `fo_booking.cancel_reason text NULL` with `CHECK (cancel_reason IS NULL OR (char_length(cancel_reason) <= 500 AND status = 'CANCELLED'))`. Existing rows stay NULL and pass the check. The body caps at 500 UTF-16 units, which is never more than 500 characters, so anything the API accepts fits the column. The schema matches (`cancelReason String? @map("cancel_reason")`).
* **Lead B rev 16.30: done as ruled.** Only `cancelBooking` writes the reason, in its own update in the cancel's transaction (service.ts:489). Only `selfCancel` passes a reason (:304); the staff cancel passes none (:346). The audit summary is `Consultation cancelled by the booker.`, plus ` A reason was given.` when there is one, with no part of the text. A staff cancel keeps `Consultation cancelled.` The round-1 `CancelBody` checks are unchanged. The reason reaches no public answer, no event payload (`outbox` builds its fields one by one, :500-505), no mail and no staff `view()`.
* **DW10 ticked.**
  * Pass cases: the trimmed reason is stored and the audit holds none of it; 500 characters, an email address, or two lines are stored whole; no reason stores NULL with the plain sentence.
  * Fail cases: 501 characters or a control character → 400, booking unchanged, NULL; broken UTF-16, a bidi override or only invisible characters → 400, NULL; the database itself refuses a reason on a booking that is not cancelled, and one over 500 characters.
  * The test would catch a broken rule: dropping the `cancelReason` write fails the stored case, and putting the text in the summary fails the audit case.
* **DW7 still holds.** The reason is not in the cancel answer, the events or the mails, and the cancelled link answers the one not-found. The old "not on the booking row" part was correctly removed, since the row now keeps it by ruling.
* **`api/src/front-office/MODULE.md`: true.**
  * The public routes listed match `public.controller.ts:58-65`.
  * The two new invariants match the code: the one not-found with no ids, and the switches read after the row lock. So does the line saying the reason lives on the booking and never in the audit.
  * The test list now includes `check_fo3pa_public_answers.ts`.
* **`qa/built/FO-3pa.md`: true.** "kept on the booking, never shown back on the public pages" matches the code.
* No new finding.

Verdict: Approve d1715795abbefb773228e466b7e0f84de6e61bd5
