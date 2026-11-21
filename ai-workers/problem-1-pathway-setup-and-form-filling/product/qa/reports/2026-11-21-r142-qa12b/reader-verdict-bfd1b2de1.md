# R1.42 — independent reader's verdict on main bfd1b2de1 (qa 12b)

Reader: a fresh read-only session. Ran nothing (git diff/log/show only). Paths below are relative to
`ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/` unless they start with `product/`.
Evidence read: `product/qa/reports/2026-11-21-r142-qa12b/` walk_j42_job136831103939.txt (GitHub run 44899086096, fdb3ba39e, 33/33),
j42_1.txt (55a9aba2f, 33/33), j42_2_bfd1b2de1.txt (33/33), suites_bfd1b2de1.txt (11/11 PASS). Run 44910722219 on bfd1b2de1: pending.

## 1. Done-when clauses

| Clause | Result | Evidence |
|---|---|---|
| Single-use link reschedules inside the firm's notice rule | **Met by screens** | `tests/journeys/j_42.ts:195-217` (W2: manage page → Reschedule → radio → "Move to this time"; DB RESCHEDULED at the new time). Server: `api/src/front-office/booking/service.ts:334-339`, `:560-589` (recheckToken under row lock, new token issued after the update) |
| … or cancels | **Met by screens** | `j_42.ts:225-232` (W4: Cancel → "Cancel booking"; DB CANCELLED). Server `service.ts:343-348`, `:606-624` |
| Later refused in words | **Met by screens** | `j_42.ts:239-246` (W5: B inside the 60-min limit sees "It is less than 1 hour before your meeting. Please reply … +1 416 555 0100.", no buttons). Words: `web/src/modules/front-office/booking-public/manage-page.tsx:31-33`, `:89` |
| Used link refused | **Met by screens** | `j_42.ts:219-223` (W3: A's first link, opened fresh, → bad-link words, no buttons) and `:233-237` (W4 fail) |
| Expired link refused | **Met by screens, real clock** | `j_42.ts:248-254` (W6 waits for B's meeting end, ~10-13 min; B is still SCHEDULED, so the refusal is expiry, not inactivity) |
| Staff record the outcome | **Met by screens** (Attended only) | `j_42.ts:256-270` (W7: booking detail → Attended; COMPLETED + one audit line naming the host). No-show is not walked (suites only) |
| … and the note | **Met by screens** | `j_42.ts:272-300` (W8: Consult record panel; no-currency refused in words; notes + item + 1,500.00 CAD saved, who/when, audit without note text) |

## 2. Gate A
* **Start:** W0 an Admin creates the booking type and its timings on Settings → Booking types (`j_42.ts:142-180`), W1 two people book on the public page (`:119-140`, `:184-193`): the end of the booking capability, by screens.
* **End:** W9 Next step "Engage and prepare retainer" → FO-4 Engage panel → "Engage as Individual" → prospect page (`j_42.ts:302-316`). `tests/journeys/j_53.ts:4-5` says J-53 "starts where J-42 ends (j_42.ts W9: an Engaged prospect)", and J-53 W1 opens that prospect's Retainer card. So the walk reaches row 53's first step. **Yes.**
* **SQL/API in R1.42 steps:** none. Setup by SQL, declared as `setup (not through the product)` lines: firm, zone, host + Admin, host hours (`:79-88`, printed at `:100`) and the 5-minute slot interval (`:181-182`). Staff sign-in is by API with the token put into sessionStorage (`:89-98`, `:106`) — not an R1.42 step, but not printed as a setup line. The manage link is read from the demo inbox API (stand-in SI-20, declared at `:62`) — the mail client stand-in. The EUR PUT (`:299-300`) is an extra route check, not a walk step.
* **Stand-ins declared:** Sample timings a firm may choose (notice 0, self-service limit 60 min, 5-min meetings, host on 24/7), set by screens except the interval (`:25-29`).
* **Clock:** real (`:4`, `:25`; W6 sleeps until B's end).

## 3. Server-side refusals
All enforced server side, not just hidden in the UI:
* Single use: tokens are voided by a DB trigger on move/cancel (`prisma/migrations/20261114120000_fo1b_booking_tables/migration.sql:8-9`, `fo_booking_void_tokens`); `liveToken` refuses voided/expired/wrong-hash (`api/src/front-office/booking/tokens.ts:31-39`); `byToken` also refuses an inactive booking (`service.ts:834-849`).
* Expiry: `expires_at = endsAt` (`tokens.ts:17-19`), checked against the clock port (`tokens.ts:38`).
* Notice rule: `selfServiceOpen` in `manageSlots` and in `recheckToken` under the row lock → 409 `too-close-to-meeting` (`service.ts:326`, `:854-862`, `:92`). The walk only shows the screen side (W5 reads `canChange=false`); the POST refusal is proved in `tests/check_fo3_booking.ts:310-311` (green in suites_bfd1b2de1.txt) and old/expired tokens at `:277`, `:313`.
* Attendance: not before start, not on cancelled (`service.ts:404-420`). Consult record: COMPLETED only, fee needs CAD/USD (`api/src/front-office/booking/consult/service.ts:65-73`, `:126-133`).

## 4. fdb3ba39e..bfd1b2de1 (51 files in studio)
No file under `api/src/front-office/booking/**` or `web/src/modules/front-office/booking*/**` changed. Indirect touches:
* `api/src/platform/messages/send/messages.ts` + `branding/branding.ts`, `image-setting.ts`: every firm email (the booking confirmation, the move mail with the new link) now reads the firm's logo setting; a bad value "reads as none". Risk for DW1 / the link: low; j42_2 on bfd1b2de1 passed DW1.
* `api/src/platform/firm-scope.ts`: `touchPlatform` adds lines only for "platform" bypass uses; `byToken` uses `withFirm`/`enterFirm`, not a bypass. Risk: none seen.
* `web/.../sales/prospect-page.tsx:+RetainerCard`, `routes.tsx`, `sales-frame.tsx`: W9 lands on the prospect page, which now renders the Retainer card. Risk: low. W9 checks the URL, one prospect, no page error; passed locally on bfd1b2de1. The GitHub walk at fdb3ba39e did **not** include this, so run 44910722219 is the one that counts for it.
* `tests/check_fo3st3_types_browser.ts` (unhold, #2818): test only.
* suites_bfd1b2de1.txt names commit f9892a44d. `git diff bfd1b2de1 f9892a44d -- prototype/studio` is empty, so the suites ran on main's code.

## 5. Ways the walk could pass while the feature is broken
* W8's no-currency "fail" is refused by the client before any request (`web/src/modules/front-office/booking/calendar/consult-record.tsx:156`). It would pass with no server check. The server does check (`consult/service.ts:127`), but only the EUR case is shown by route.
* W5 shows the UI's reading of `canChange`, not a refused POST. That is covered by the suite (above), not by the walk.
* W4's "the link that cancelled is refused too" opens the **second email's** link (`j_42.ts:233-234`). The page cancelled with the token from the reschedule answer (`manage-page.tsx` `onToken`), which is a different token. The refusal still holds because the booking is CANCELLED (`service.ts:846`), but the label claims more than it tests.
* Nothing else: W3/W6 open fresh browser contexts against the real GET, and the DB reads back each pass.

## 6. Bugs and gaps (no Blocker, no Critical)
* **Minor — stale NOTE at W9** (`j_42.ts:317`, header `:20`): it says FO-5s is "not on main", but bfd1b2de1 has `retainers/retainer-page.tsx` and `RetainerCard`. Fix: update the NOTE and assert the prospect's Retainer card ("No retainer yet." / Prepare retainer), the exact point where J-53 W1 starts.
* **Minor — W4 fail label** (above). Fix: also open the in-page token (`new URL(mine.url()).hash`) in a fresh context, or reword it to "the latest emailed link".
* **Minor — undeclared API sign-in.** Fix: print a `setup (not through the product): staff sign in by the local session API` line.
* **Minor — W8 no-currency is client-only.** Fix: add a route PUT `{quotedFeeMinor:1000}` with no currency → 400, beside the EUR check.
* **Minor (evidence)** — the local logs carry no sha inside them (it is only in the file name or commit message). Fix: echo `git rev-parse HEAD` at the walk's start.
* **Note** — No-show is not walked. The Done-when says "the outcome", and Attended satisfies it. No-show stays covered by the suites.

## 7. Verdict
**Works**, conditional on GitHub run 44910722219 (j_42 on bfd1b2de1) finishing green with 33/33. Every Done-when clause is walked by screens on the real clock, with refusals enforced server side. The walk runs from the booking capability's end to J-53's declared start, and setup is declared. The fdb3ba39e..bfd1b2de1 changes reach R1.42's path only indirectly (email branding, prospect page), and the local main-head walk and the 11 suites cover them. **Confidence 85%** (at 70% until 44910722219 reports, because the only GitHub walk predates the prospect-page change). If 44910722219 fails at W9 or DW1, the verdict is **Partial**.

Comparison (written after this verdict): the earlier reader (reader-verdict.md) also reached Works at 85%; this read adds the stale W9 NOTE, the W4 label gap and the client-only no-currency check as Minor items.
