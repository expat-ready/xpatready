# PF-11c part 1 + AUD-2 part 1: review (PR #3195)

**Head reviewed:** 71f3131daf1c8426d0474ec20f6b3e1c6033d7a4. This is a runtime row with no screen, so there is no concept.md and the BIC table is N/A (no case-side screen).
**Ran (all on the head):**
* `check_pf11c_close.ts`: 33/33, exit 0.
* `check_aud5_check.ts`: 54/54.
* `check_aud5_keep_periods.ts`: 57/57.
* `graph.mjs --check`: exit 0.
* An isolated copy on :4435 (the job `platform.firm.closure` is scheduled at 30 7 * * * America/Toronto).
* 15 mutations and 3 repros on a scratch copy that is byte-identical to the head.

The builder's uncommitted fixes appeared in this shared checkout at 05:44 UTC, after these runs. They are not reviewed here.
Journey score: **6/10, fail** (`journey-test-reviewer-2026-11-23.md`).

**Verdict: Ship after fixes.** No Blocker. Six Majors, listed below.

## What holds
* **Nothing is deleted.** No `delete` in the job; per-table counts never drop; `audit_event` refuses a delete.
* **Archive before close.** A failed `put` leaves the firm on hold with no revocation (mutation M13 is caught).
* **BR-7 order on the first pass.** The hold is asked before anything is archived (M4 caught). With no hold check wired, the job is blocked.
* **The archive port.** It refuses a key twice and refuses a delete inside the keep period. The keep period is the longest FLOOR in AUD-5's table (7 years, pinned).
* **Idempotency.** A second run the same day is `not_due` and writes no second copy, line or revocation.
* **Firm B** is untouched and still signs in.
* **Sign-in.** `authenticate` refuses a DELETED firm on every request, before any other check (M6 caught). The bypass use is declared, outside-only, audited per firm.
* **The alert kind** `firm_closure_blocked` is valid in `ports/alert.ts`, with id-only detail.

## Majors (each must be fixed before Approve)
1. **The close can never succeed with a real clock.**
   * Where: `firm-closure/closure.ts:60,82,86`. `retainUntil` is `addYears(now, 7)`, with `now` taken at the start of `runFirm`. The check needs `retainUntil >= addYears(copy.writtenAt, 7)`, and the store stamps `writtenAt` later.
   * Scenario: a firm on hold since 91 days ago with all notices sent, job and fake archive both on `new Date()`. Run 1 and run 2 both end `blocked: PF-11c.archive_unreadable`, and the key is write-once, so the firm can never close for that hold. The suite freezes the clock, which hides this (the breaker's M2, re-checked independently).
   * Fix: compare against the date passed to `put`. Add a suite line with a clock that moves during the run.
2. **The read-back proves nothing, and an old or partial copy is accepted.**
   * Where: `closure.ts:80-86`. If any object already sits at the key it is reused. `sha256Of(copy.bytes) === copy.sha256` compares the store with itself, and `namesFirm` reads line 1 only.
   * Scenario: a copy left at the key by a day-90 run whose close transaction failed is reused after a 30-day hold, so the archive lacks the lines added since (the breaker's M1). Mutation M5 (every read-back check removed) passes 33/33.
   * Fix: compare the bytes written with the bytes read; never reuse an earlier run's object. Add a test that pre-places a short or foreign copy.
3. **A payment that lands during the close brings a closed firm back.**
   * Where: `closure.ts:89-94` against `billing/webhook.ts:137-157`. Billing's `refresh` reads the firm without a row lock under its own advisory lock `plat_billing:<firm>`, which the close does not take, then writes the status unconditionally.
   * Scenario (repro on the head copy): refresh reads PAYMENT_HOLD; the close commits DELETED; refresh writes ACTIVE. The final status is ACTIVE after a `firm.closed` line. Billing's own line says "firm PAYMENT_HOLD → ACTIVE", which is false, and `FIRM_MOVES.DELETED = []` is bypassed.
   * Fix: take `pg_advisory_xact_lock(hashtext('plat_billing:'||firm))` in the close transaction before the re-check. Add a test with a slow billing read.
4. **The race guards in the close transaction are untested.**
   * Where: `closure.ts:90-93`. These mutations all pass 33/33: M1 (hold re-check removed), M2 (clock re-check removed) and M3 (`FOR UPDATE` removed).
   * Scenario for M2: the update at `:94` is unconditional, so without the re-check a firm that paid between the first transaction and the close is set DELETED. For M1: a hold placed during the archive write is ignored (the SA-11-18 precedence rule).
   * Fix: one test each, with a hold placed and a payment made between `put` and the close (a fake archive whose `put` does it).
5. **The archive gate is weaker than the row's step (2).**
   * Where: `closure.ts:3-17,74-87`; BACKLOG PF-11c step (2). The row requires "the firm's full export (PF-11) written to the write-once archive and the download offered for all 90 days". If not, the job alerts and waits. Part 1 archives only the firm row and its audit lines, and checks nothing about PF-11 (not on `main`).
   * Scenario: the day AUD-2's S3 adapter sets `CLOSURE_ARCHIVE`, firms start closing without ever having been offered their data. The only guard today is that no archive is wired.
   * Fix: block with a rule such as `PF-11c.no_full_export` until a `FirmExportPort` copy exists. Otherwise record the substitute in `challenge.md` for the Lead; do not leave it implicit.
6. **An invitation can be accepted after the close.**
   * Where: `identity/session/service.ts:105-131` at the head. `accept` never reads `platform_firm.status`, and the close leaves invitations PENDING.
   * Scenario: an Owner invites someone on day 80; the firm closes on day 90; the invitee accepts. A new ACTIVE staff row, grants and an identity-provider user are created in the closed firm, with no revocation and nothing in the archive (the breaker's M3, confirmed by reading).
   * Fix: refuse there with 410 when the firm is DELETED, or revoke pending invitations in the close transaction.

## Minors (should)
* m1 `identity/service.ts:184-203`: the local sign-in door issues a token to a closed firm's staff and writes `last_sign_in_at` (seen on :4435). In the browser the person gets an empty sign-in card again with no message (screenshots in the scratchpad), so the FIRM_CLOSED words never reach anyone. Fix: refuse at the door. The card then shows the detail.
* m2 `identity/keys.ts:65` as used at `service.ts:140`: the title "Sign in again" contradicts the detail "Sign-in is no longer possible". Give FIRM_CLOSED its own title.
* m3 `deploy/cdk/lib/observability.ts:25`: `firm_closure_blocked` is not in `ALARMED_ALERT_KINDS`, so no alarm pages anyone, although the code says "a person looks". Name the follow-up for PF-23c's owner in the PR.
* m4 `closure.ts:138-143`: a failure inside the close transaction is only logged (`firm_closure_failed`); no alert is raised.
* m5 `closure.ts:72-73` with `exit-clock.ts:48-53`: one missed notice day can never be sent late, so the firm is blocked for good with a daily alert. Say what the person does.
* m6: the PR closes on the first run after a hold is released. The row says "clock paused, resumes when released". This reading is stated in the PR body but not recorded as a challenge; ask the Lead.
* m7: the row's test "its chain still verifies" is not in the suite. Mutation M12 (no firm filter in `bundle`) also passes. Add the AUD-1c verify, plus a Sample line of firm B dated inside A's range.
* m8 `ports/audit-archive.ts:19,40-50`: `put` accepts a keep-until date already past, and the fake's `objects` can be changed from outside (the breaker's m2 and m3). The fake is in memory, not the row's local folder, and the suite is `check_pf11c_close.ts`, not the row's `check_pf11c_closure.ts`.

## D1-D20 (runtime row; one line each)
* **D1 Requirement fit:** Partly (Majors 1, 5).
* **D2 Data integrity:** Partly (Majors 2, 3, 6).
* **D3 Reuse and normalisation:** Met (EXIT_NOTICE_DAYS, KEEP_PERIODS and exitClock are reused).
* **D4 Rule integrity:** Partly (m5: a permanent block).
* **D5 Stability and recovery:** Partly (idempotent; Major 1 never clears).
* **D6 Freshness and governance:** Met (audit lines name the key, sha256 and keep-until).
* **D7 AI trust:** N/A.
* **D8 Orientation:** N/A.
* **D9 Flow of information:** Not met for the closed firm's staff (m1).
* **D10 Language and guidance:** Partly (m2).
* **D11 Feedback and state:** Partly (m3, m4).
* **D12 Visual quality, D14 Looks like the team's product:** N/A (no new UI).
* **D13 Accessibility and responsive:** the card is unchanged; keyboard-only works at 1024 and 1440 px.
* **D15 Speed:** Met (under 20 ms).
* **D16 Testability:** Not met (Majors 2 and 4; M1, M2, M3, M5 and M12 survive).
* **D17 First-use intuitiveness, D20 User pain solved:** simulated only.
* **D18 Information provenance:** Met (SA ids, "Unconfirmed: no counsel").
* **D19 End-to-end capability closure:** Partly (no archive adapter, no PF-11; stated in the PR).

## Could not check
The S3 Object Lock adapter (not built). The client portal sessions (PF-4p not built). Behaviour at production volume (the bundle holds every audit line of a firm in memory). A real screen reader. An intended user's walk.

Verdict: Changes 71f3131daf1c8426d0474ec20f6b3e1c6033d7a4. Not Approve: fix Majors 1-6, then a new head for re-review.
Reviewer: Changes 71f3131daf1c8426d0474ec20f6b3e1c6033d7a4
