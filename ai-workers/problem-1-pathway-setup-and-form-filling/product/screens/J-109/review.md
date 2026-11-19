# J-109 review: complaints join-and-walk (R1.109), commit 648daeea9

Reviewer (Opus 5.5, high effort, P-303); did not build it. Scope: `git diff 648daeea9~1 648daeea9` only (`tests/journeys/j_109.ts` plus 9 screenshots). Brief: `J-rows.md` §J-109 as amended by `wave1-registers.md` §J-109 (at c5bf956f9). Journey test: `journey-test-reviewer-2026-11-18.md` (this folder).

**Verdict (screen-review terms): Ship after fixes.** One Major: the committed screenshots come from the builder's fake-wired run, not the real one.

## Builder's claims, checked
* **Wiring unchanged, on main:** true. `api/src/features/platform-complaints.ts` is the same on `origin/main` and at 648daeea9: `clock: systemClock`, `jobs` injected as `PlatformJobs`, `mail: fakeMail()` (lines 21, 46). The diff touches no wiring. Mail staying `fakeMail` is named in the test header (j_109.ts:9-11).
* **DW1/DW2 fail on the fakes (5 FAILs):** confirmed by reading the code, not by re-running a swapped build (I edit nothing outside my record). With `fakeJobs` no `platform_jobs.job` row exists, so DW1 pass, DW1 run, DW1 fail and DW1 cancel fail (4 lines). With `FakeClock` at `FAKE_NOW` = 24 Nov 14:00Z (`ports/clock.ts:13`), "five minutes ahead" is accepted, so DW2 fail fails (1 line). Total 5. A fake fixed in the past would fail DW2 pass instead, so the pair catches either kind of fake.
* **W1-W5, 27 passed / 0 failed:** reproduced. Copy `j109rv` on :4437 (runtime range 4430-4439, never :4400), headless Chromium, 3 runs on the same reused copy: 27/0 each time. The walk is deterministic on rerun.

## Named cases: a pass line and a fail line each
| Case | Pass line | Fail line | Proves its name? |
|---|---|---|---|
| DW1 | row in pg-boss, due at the acknowledge-by date (j_109.ts:115) | "no other reminder row" (:119) | Pass: yes. Fail: **no** (m1). The cancel line (:127) is the real negative. |
| DW2 | a minute ago gives 201 (:124) | five minutes ahead gives 422 "in the future" (:129) | Yes |
| W1 | drawer records it; the DB row has the received time and the handler (:102) | same key, other words: 422, one row (:106) | Yes; the Idempotency-Key is read off the real browser request (:69, :104) |
| W2 | stored and shown date = Tue 17 Nov 17:00, an independent constant (:132) | not Mon 16 Nov (:134) | Yes; weak fallback (m3) |
| W3 | Read-only list lacks it (:140) | Owner sees it under Overdue (:150) | Yes; also Not found by address and API 404 |
| W4 | Acknowledged, then Closed/Resolved in the DOM and the DB (:157, :163) | no outcome: refused, DB still OPEN (:160) | Yes |
| W5 | under Closed, `view=closed` (:173) | gone from Open (:170) | Yes |

Server authorisation is checked underneath (W3 API 404). The data is checked in the database (rows, `requestKey`, status, outcome). There are no per-row requests in the test. Its timing is safe: `commit()` awaits the after-commit job work before it answers (`complaints.ts:232-236`), so the cancel check at :127 does not race.

## D1-D20 (this row: joins plus walk; the screen itself is PF-21s, reviewed elsewhere)
D1 fit: every W step and DW swap in the amended brief has a line. W2 uses the 2-business-day period, not 30 days. · D2 integrity: idempotent repeat refused, one reminder per complaint, one ACKNOWLEDGED event across two tabs (journey report). · D3 N/A · D4 N/A · D5 stability: double click sends 1 POST; a reused copy reruns green; the closed day is restored in `finally` (:181). · D6 governance: audit lines record/acknowledge/reminder present (journey report); the walk does not assert them (m5). · D7 N/A (no AI) · D8 orientation: breadcrumbs on every shot. · D9 flow: one filled next-step button (W4 :152). · D10 words: plain; "Sample" on lists and the period. · D11 feedback: toasts, timeline, Needs you, 409 shown in the panel. · D12 visual: team look in the screenshots. · D13 a11y/responsive: axe clean, no sideways scroll at 400/1024/1440 and 1440 at 200%, keyboard-only record (journey report). · D14 team look: yes. · D15 speed: record 219 ms. · D16 testability: a pass and a fail per case, the swaps fail on the fakes, reruns pass; the screenshots are the wrong run (M1). · D17 simulated only · D18 provenance: Sample marked; no immigration value is asserted. · D19 closure: from record to closed in the list, the brief's end (no next capability). · D20 simulated only.

## BIC-01-BIC-20 (EXPERIENCE.md §6)
N/A, all 20: §6 covers case-side screens. Complaints is a firm (platform) screen, and this row adds no screen.

## Graph (P-86)
`graph.mjs` ran (exit 0). `qa/GRAPH.md` covers the runtime `/api` routes and pages. Platform complaints routes are not in its scope, so this row has no graph finding.

## Issues
**Major**
* **M1 (Must): the committed screenshots are from the fake-port run, not the real one.** Evidence:
  * `w2-acknowledge-by-1440.png` reads "5 business days late". Five business days after Tue 17 Nov is Tue 24 Nov, which is `FAKE_NOW`. On the system clock (18 Nov) the same step reads "1 business day late" (my run).
  * `w4-closed-1440.png` has no "Reminder sent to acknowledge" event, because `fakeJobs` never runs the job. The real run shows it.
  * The close time in `w4-close`/`w4-closed`, 12:44 p.m. Toronto, is the commit minute (17:44 UTC). So the last run before the commit was the swapped one.

  The brief asks for a screenshot per W step as evidence of the real path, and these show fake behaviour. Fix: re-run `j_109.ts` on the unchanged wiring and commit the regenerated `screens/J-109/*.png`.

**minor (Should)**
* **m1** `j_109.ts:119` "DW1 fail" cannot fail apart from :115: `r1` is read after the refused repeat, and the repeat is refused before any schedule (`complaints.ts:261`). Fix: label the cancel line (:127) as "DW1 fail" and drop :119, or make :119 test something new.
* **m2** `:118` takes pg-boss `completed` to mean the reminder ran. `runAckReminder` also completes when it skips (`complaints.ts` ~442-443). Fix: also assert a `REMINDER_SENT` event for the complaint.
* **m3** `:131` falls back to the whole page text when the "Acknowledge by" fact is missing. W2 could then pass on the banner's date alone. Fix: drop the `.catch` fallback.
* **m4** The default and example port 4573 (`:20`, `:34`) is outside the runtime lane's 4430-4439 (`WAY-OF-WORKING.md:18`). Fix: use a port in range.
* **m5** The brief's W2 says "on the fake clock" while its swap says "system clock". The builder fixed the received date instead (`:16-17`), which is sound, but say so in the PR body (never deviate silently). The walk could also assert the audit lines (D6); optional.

**Out of this diff (PF-21s screen, for its owner):** in `w4-close-1440.png` the close panel's "There is a problem" summary and field errors stay after the outcome and note are filled, until the next submit.

## What I could not check
* A visible (headed) browser walk: no display here, so headless only.
* A real screen reader. An intended user's unaided walk (D17, D20 stay with the founder).
* Re-running with the fakes swapped in: verified by code reading, since I edit nothing outside my record.
* CI on this head.

Verdict: Changes requested
1. Major M1: regenerate and commit the J-109 screenshots from a run on the real wiring (see above).
2. minor m1-m5 as listed (Should; not blocking on their own).

## Re-review R2 (P-277, diff only): `git diff 648daeea9 62b4bcd95`
Read: the `j_109.ts` changes (+12/-10), the 9 regenerated screenshots, and `break-report.md`. The app code has no change in this range (only the test and records). The committed `review.md` and journey report are mine, unaltered.
* **M1, fixed.**
  * `w2-acknowledge-by-1440.png` now reads "1 business day late". That matches the system clock on 18 Nov; the earlier shot showed FakeClock's 24 Nov.
  * `w4-closed-1440.png` now shows "Reminder sent to acknowledge · The system", so the real pg-boss worker ran it.
  * The close times (12:03 / 1:03 p.m.) are after the earlier fake-wired run.
* **m1, fixed.** The line that could not fail on its own is gone. The cancel check is now "DW1 fail" (`j_109.ts:129`): created, then acknowledged, then `cancelled`. Every case still has a pass and a fail line.
* **m2, fixed.** The run line (`:121`) now needs pg-boss `completed` and exactly one `REMINDER_SENT` event. A skipped run would fail it.
* **m3, fixed.** W2 reads only the "Acknowledge by" fact (`:133`), with no page-text fallback. A missing fact throws, the run exits non-zero, and no FAIL line is printed. That is acceptable.
* **m4, fixed.** The port is now 4436, in the runtime range 4430-4439.
* **m5.** It goes in the PR body (I can't check that from the diff).
* **Breaker m2 (wait raised to 120 s), accepted.** The longer wait only allows for a backlog; the pass condition is unchanged and still strict.
* **On the fakes, the new lines still fail.** With `fakeJobs` there is no row, so DW1 pass, run and fail all fail (3 lines). With FakeClock at 24 Nov, five minutes ahead is accepted, so DW2 fail fails (1 line). The swaps are still proven real.
* **Rerun.** I ran the `62b4bcd95` walk from a scratchpad copy (imports pointed at the same code; screenshots kept in the scratchpad, so the committed shots are untouched). Copy `j109rr` on :4436, twice on the same copy: **26 passed, 0 failed** both times, about 7.6 s each.
* **Breaker's M1 is out of J-109, so it does not block this row.** The finding: a Read-only person chosen as handler can see, acknowledge and close the complaint (`complaints.ts:188-192`, `:323-326`). That bug sits in PF-21v/w, which this row may not change (the brief says to stop and ask). W3 as briefed still holds for a Read-only person who is not the handler. The question to the tech lead needs a tracked row (BUGS or PF-21v/w), so it is not lost when this merges.
* **Breaker's other findings.** Its m3 (the "Reminder sent" wording while mail is `fakeMail`) is allowed by the brief and named in the header. Its m1, m4 and m5 belong to existing parts. No new issue in this diff.

Verdict: Approve 62b4bcd95aeb8c69e519e37444905b8230103993

## Re-review R3 (P-277, diff only): `62b4bcd95..9f36c6502`
* **J-109's own files are unchanged.** `j_109.ts` and the `screens/J-109/` screenshots are identical to `62b4bcd95`. The new J-109 content is only `qa/built/J-109.md` (1 line) and my R2 section.
* **The merge keeps both sides in `complaints.ts`.**
  * Against `origin/main`, the head adds exactly PF-21i's changes:
    * the `lockRequestKey`/`requestHash` import;
    * `REPEATED`, `KEY_LOCK` and `keyReused`;
    * the `requestKey`/`requestHash` columns kept out of the view;
    * the keyed `record()`.
  * Main's `mailIn` import and the MessagePort reminder (#2157) stay as they are.
  * Against `62b4bcd95`, the head brings exactly main's changes to this file (I compared the changed lines of the two diffs: identical).
* **The merge keeps both sides in `platform/MODULE.md`.** Main's lines stay, including PF-19r's "and the complaint reminder" under `MESSAGES_MAIL`. PF-21i's parts are added: the `Idempotency-Key` on `POST`, the `idempotency.ts` entry point, the invariant line and `tests/check_pf21i_idempotent.ts`. Between main and the head, the app differs only in PF-21i's 8 files: complaints, routes, idempotency, migration, schema, drawer, session and the card.
* **DW1 holds on the new reminder path.**
  * The wiring is now `systemClock`, `PlatformJobs` and `MESSAGES_MAIL` (`features/platform-complaints.ts:9-21`).
  * `runAckReminder` writes `REMINDER_SENT` and its audit line, then the email through `mailIn` in the same transaction (`complaints.ts:475-483`). A refused send rolls the run back and the job runs again, so DW1's "completed and one REMINDER_SENT" stays strict: it can fail, never falsely pass.
  * My runs on copy `j109r3`, port 4438 (never :4400), with the walk run from a scratchpad copy (imports pointed at this checkout, screenshots kept in the scratchpad; the committed shots are untouched): **26 passed, 0 failed, 4 times on the same reused copy.**
  * After a run, `msg_outbox` holds exactly one SERVICE EMAIL in state SENT for the walk's reminder (`idempotency_key` `mail:complaint.ack_reminder:…`). The reminder goes through MessagePort, not memory.
  * I did not re-run the PF-21 suites. The coordinator's results are taken as reported.
* **minor m6 (Should; non-blocking): two records still say mail is `fakeMail`, which stopped being true when main (#2157) moved the reminder to `MESSAGES_MAIL`.**
  * `j_109.ts:11` says "Mail stays PF-0p's fakeMail (in memory) until the sending adapter lands".
  * `qa/built/J-109.md` says "Mail stays in memory (fakeMail) … nothing is delivered".
  * At the head, the reminder email is a SENT outbox row on the app's email adapter.
  * Fix: say mail is MessagePort's `MESSAGES_MAIL` (from #2157, not this row), and make the PR body's mail note match. The breaker's m3 ("Reminder sent" while nothing leaves) is now moot.
* Nothing else is open from R1/R2. No Blocker or Major.

Verdict: Approve 9f36c65027eb8e5b35e869a7a8a25cfcc6e58850

## Re-review R4 (P-277, diff only): `9f36c6502..eb49e116b`
Changed in 4 files, no code line: `j_109.ts` (comment only, +2/-1), `qa/built/J-109.md` (one sentence), the new `branch-notes.md`, and my R3 section, committed unchanged.
* **m6 fixed.** `j_109.ts:11-12` and the qa line now say the reminder's mail goes through the app's MessagePort (`MESSAGES_MAIL`, #2157, not this row) and that on a local copy it lands in the demo inbox. That is accurate:
  * `channels.ts:20` uses `localEmail` unless the environment is non-local with SES set;
  * `channels/email/local.ts:1-3` marks the row SENT, and `GET /api/demo/platform-inbox` lists it;
  * R3 found exactly that row (SERVICE, EMAIL, SENT).
* **`branch-notes.md` matches the record.**
  * The Approve sha and the merge story are right.
  * The suite results are as reported; I re-ran only `j_109`, 26/0, in R3.
  * The DW fake-fail check matches R1, where I verified it by reading the code.
  * The break M1 is routed as a question with a bug-row recommendation against PF-21v/w, as R2 asked.
* Nothing is open. No Blocker, Major or minor. No re-run was needed: no executable line changed.

Verdict: Approve eb49e116b6a088b80c3eb41c6a2c2a90dd706da3

## Re-review R5 (P-277, diff only): `eb49e116b..497af411d`
* **No J-109 code or evidence changed.** Since R4 the J-109 changes are only `branch-notes.md` (1 line) and my R4 section, committed unchanged. `j_109.ts` and the screenshots are untouched.
* **The merge keeps both sides.**
  * `complaints.ts`, `routes.ts`, `idempotency.ts`, the drawer and the complaints feature are unchanged since R4.
  * Against `origin/main`, the head still differs only in PF-21i's 8 files. `complaints.ts` is the same +38 lines as in R3.
  * The PF-21i migration `20261118233000` is still later than main's newest, `20261118230000_csk1_case_client`.
  * In `platform/MODULE.md`, a word-diff against main shows only two additions:
    * PF-21i's `Idempotency-Key` note, with the former invariant's words folded in. No meaning is lost: one complaint per firm and key, a repeat answers 200 with nothing written, another body gives 422.
    * `tests/check_pf21i_idempotent.ts` in the Tests line.

    Main's lines are all kept.
* **Main's changes since the main that 208c1eb59 carried (9d440b2f4), on the path J-109 walks:**
  * Complaints, messages, jobs and the complaints web module: no change.
  * **AUD-1b** changed the AuditPort adapter the service writes through (`audit/audit-event.ts`, `audit/context.ts`, `ports/audit.ts`). Each line now also gets `firm_id`, `actor_type` and a correlation id. A line naming another firm or another actor than the request's is refused, and the transaction rolls back.
  * **Smaller changes:**
    * `settings.ts`: `firmId` on the setting audit line;
    * `firm-scope.ts`: one new job bypass for PF-15;
    * identity and observability: request context.
  * **Effect on J-109:** none of these changes the walk's behaviour. Every complaint act names its own request's actor, and the reminder job writes as `SYSTEM`.
* **Rerun at the head.** Copy `j109r5` on :4438 (never :4400). The walk ran from a scratchpad copy, with its screenshots kept in the scratchpad, so the committed shots are untouched.
  * **26 passed, 0 failed, twice on the same reused copy.**
  * Underneath, under AUD-1b, every complaint audit line carries a `firm_id` and the right actor type:
    * `complaint.record` ×4, `.acknowledge` ×4 and `.close` ×2 as `FIRM_STAFF`;
    * `complaint.reminder` ×2 as `SYSTEM`.
  * `msg_outbox` holds 2 reminder emails, both SERVICE and SENT, one per run. DW1 holds on the MessagePort path.
  * I did not re-run the PF-21 suites; I'm relying on the coordinator's results.
* Nothing is open. No Blocker, Major or minor.

Verdict: Approve 497af411d3684d464eefe7f86d150ba94aac1dea

## Re-review R6 (P-277, diff only): `497af411d..306dcd2a9`
* **No J-109 code or evidence changed.** Since R5 the J-109 changes are only `branch-notes.md` and my R5 section, committed unchanged. `j_109.ts` and the screenshots are untouched.
* **Both sides are kept.**
  * `complaints.ts` is unchanged since R5. Against `origin/main`, the head still differs only in PF-21i's files: complaints, routes, idempotency, migration, schema, drawer, session. The card fragment is the one addition.
  * `platform/MODULE.md` is byte-identical to main's, so the frozen lists are untouched (P-712).
  * PF-21i's items are in `api/src/platform/MODULE.rows/PF-21i.md`: 2 lines, its `Idempotency-Key` entry point, `idempotency.ts`, and `tests/check_pf21i_idempotent.ts`.
* **Main since 2973a8f9b (merge base 4aa912c92), on the path J-109 walks:**
  * No change to complaints, messages, jobs, audit, settings, firm scope, identity, observability, the clock, jobs, mail or audit ports, or the platform web module.
  * The only touch is one back-relation line on `PlatformStaff` (`foAvailabilitySets`, FO-3a) in `platform.prisma`, which complaints never reads.
* **Does J-109 need a `MODULE.rows` entry? No.** J-109's own files (`tests/journeys/j_109.ts`, `qa/built/J-109.md`, `screens/J-109/*`) are in no module's `paths:`. `module-cards.py pr` on them gives "PASS module cards: 0 module(s) touched". So J-109 needs neither a fragment nor a `Card unchanged:` line.
  * Checking the whole branch against main instead flags web-shell, from PF-21i's `record-drawer.tsx` and `session.ts`, with no body given. That belongs to #2012's PR body or fragment, not to J-109, whose PR opens after #2012 is on main.
* **Note for #2012, not J-109:** main now has `20261119031000_fo3a_hour_sets`, which is later than PF-21i's `20261118233000`. Rows rev 15.2 wants PF-21i's stamp to be later than main's newest when it merges, so #2012 needs another re-stamp. J-109 has no migration.
* **Rerun at the head.**
  * Copy `j109r6` on :4438 (never :4400). The walk ran from a scratchpad copy, with its screenshots kept in the scratchpad, so the committed shots are untouched.
  * **26 passed, 0 failed, twice on the same reused copy.**
  * Underneath, as in R5: `complaint.record` ×4, `.acknowledge` ×4 and `.close` ×2 as `FIRM_STAFF`, and `complaint.reminder` ×2 as `SYSTEM`, all with a `firm_id`.
  * `msg_outbox` holds 2 reminder emails, both SERVICE and SENT.
  * I did not re-run the PF-21 suites; I'm relying on the coordinator's results.
* Nothing is open for J-109. No Blocker, Major or minor.

Verdict: Approve 306dcd2a9f012d21dc4d57e44f26c16a97c32191

## Re-review R7 (P-277, diff only): `306dcd2a9..5b04aab9a`
* **Three files changed.**
  * `branch-notes.md`: the R6 record, plus the #2012 migration-stamp note. It matches R6.
  * My R6 section, committed unchanged.
  * `MODULE.rows/PF-21i.md`: its Tests line drops the backticks around the test path. Same item, same meaning.
* **No code, test or screenshot changed** (api, web, tests, ports and prisma are identical apart from the fragment).
* `module-cards.py pr` on the fragment passes, and so does `tree` (15 cards).
* No re-run needed. Nothing open for J-109.

Verdict: Approve 5b04aab9ae704e7ad24b16152a8b1af30214d66a
