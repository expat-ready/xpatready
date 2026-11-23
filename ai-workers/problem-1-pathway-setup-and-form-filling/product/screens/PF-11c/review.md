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

## Round 2 (diff 71f3131..1b4298d)

**Head reviewed:** 1b4298d062c453e8f6f5dcb2fc8228d631529c5a. Only the diff is reviewed: `closure.ts`, `platform-firm-closure.ts`, `ports/audit-archive.ts`, `identity/service.ts`, `identity/session/service.ts`, `tests/check_pf11c_close.ts` and `challenge.md`.
**Ran:**
* `check_pf11c_close.ts`: 45/45, exit 0, on a scratch copy that is byte-identical to the head.
* 17 mutations on that copy, one at a time, each restored afterwards (the copy diffs clean against the head). Results are below.
* The other suites listed in the hand-off were already green on this head (aud5 57 and 54, bypass 52, pf4 120, pf4b 57). They were not re-run.

**Journey score:** 6/10, carried from round 1. There was no new browser walk, because this round reviews the diff only. The one change a user would meet is in the sign-in path: the local door now refuses a closed firm, and the refusal is titled "Account closed". The suite covers it (mutation below).

### Round-1 Majors
1. **The close can never succeed with a real clock. Fixed.**
   * The check now compares against the date passed to `put` (`until`), not the store's `writtenAt`. The suite's store clock runs 25 ms ahead of the job's clock.
   * Mutation: restoring the old `addYears(copy.writtenAt, 7)` check fails 8 checks.
2. **The read-back proves nothing, and an old or partial copy is accepted. Fixed.**
   * Each run writes to its own new key (hold seq, run time and a random part). The read-back is compared byte for byte with the bundle, and its sha256 is checked against the bundle's.
   * Inside the close transaction, the live audit ids of the firm must equal the copy's ids.
   * These mutations are each caught:
     * byte compare removed;
     * byte and sha compares removed;
     * live-ids check removed (the stale test then closes);
     * fixed key.
3. **A payment that lands during the close brings a closed firm back. Fixed.**
   * The close takes `pg_advisory_xact_lock(hashtext('plat_billing:'||id))`. This is the same expression as `billing/webhook.ts:138`. Both ids are lowercase: `firmScope` lowercases on the close side, and the webhook's `row.firmId` comes from the database.
   * Lock order: both the close and `refresh` take the billing lock first, then the firm row. Only `webhook.ts:156` writes `platform_firm.status`. Invitation accept takes only the firm row. So there is no cycle. The hold lock is taken after the firm row, as in round 1 (unchanged).
   * Mutation: removing the lock makes the M3 test fail (`waited: false`).
4. **The race guards in the close transaction are untested. Fixed.** Each mutation is now caught:
   * `FOR UPDATE` removed;
   * clock re-check removed;
   * hold re-check removed.
5. **The archive gate is weaker than the row's step (2). Fixed.**
   * The `FullExportPort` gate (`PF-11c.no_full_export`) is in place, with `fullExport: null` wired. The substitute is recorded in `challenge.md` item 2.
   * Mutations: removing the whole condition is caught, and removing the firm-prefix check is caught. Removing the existence check (`archive.get(exp.key)`) passes 45/45 (n2 below).
6. **An invitation can be accepted after the close. Code fixed; the test does not prove it. Still open (Major, D16, the same bar as round-1 Major 4).**
   * The guard at `session/service.ts:113-115` is correct. It reads the status under the firm row lock, which the close's `FOR UPDATE` conflicts with.
   * The suite's invitation uses `invited_by = staff:${staffA[0]}`, the first staff member by id. In my runs that person was a CASE_OFFICER, and in another run a CASE_MANAGER, without the invite key. So `inviterRefusal` refuses the accept with the same 410 INVITATION_NOT_VALID, revokes the invitation and writes `platform.invitation.refused_inviter`.
   * Mutation: with the DELETED guard removed, the suite passes 45/45.
   * Fix (checked on the scratch copy): insert the invitation with an active OWNER of A as the inviter. Then the suite fails without the guard (the accept succeeds and a staff member is added) and passes with it. Also assert that no `platform.invitation.refused_inviter` line was written.

### Round-1 minors
* m1 (local door): fixed and tested. The mutation is caught (UNKNOWN_STAFF instead of FIRM_CLOSED).
* m2 (title): fixed, "Account closed". The web keys on `code` only; no client matches the title.
* m3 (alarm), m5 (missed notice), m6 (hold reading): recorded for the Lead in `challenge.md` items 3, 4 and 1.
* m4 (alert on close failure): fixed (`PF-11c.close_failed` raises the alert), but untested. Removing the catch passes 45/45.
* m7 (the chain verifies; a firm B line dated inside A's range): not addressed. Still a Minor.
* m8: fixed for both points. A keep-until date in the past or now is refused (tested), and the fake no longer exposes `objects` (tested). The suite and fake naming against the row is unchanged.

### New in this diff (Minors, none Major)
* **n1 `closure.ts` live-ids check.** The transaction is READ COMMITTED, and audit inserts do not take the firm lock. A line committed between the `findMany` and the commit is not in the copy. It is still kept in the database, so the gap is small and nothing is lost.
* **n2.** The export existence check is untested. B's named but missing export never reaches it, because B stops earlier at `notices_missing`.
  * Nothing checks that the export is recent (for example, written after the hold began). That belongs to PF-11's port contract; state it there.
* **n3.** Every run that writes a copy but does not close leaves a 7-year write-once object. This covers `changed`, a hold placed late, `archive_unreadable` and `close_failed`. A firm failing daily gets one copy per day. A `changed` result from a stale copy raises no alert. The content is lines that AUD-5 keeps for 7 years anyway, so this is storage, not privacy.
* **n4.** The close transaction uses Prisma's default 5 s timeout. `refresh` holds `plat_billing` across a Stripe call, with a 30 s timeout. A slow Stripe call makes the close end `close_failed`, with an alert, and it retries the next day with a new copy. Give the close transaction an explicit timeout above the billing one.

Verdict: Changes 1b4298d062c453e8f6f5dcb2fc8228d631529c5a. Not Approve: Major 6's test must fail without the fix (an Owner as inviter). Majors 1-5 are closed. n1-n4 and m4/m7 are Minors.
Reviewer: Changes 1b4298d062c453e8f6f5dcb2fc8228d631529c5a

## Round 3 (diff 1b4298d..c234475)

**Head reviewed:** c234475ab4c7e0d8bc0942327ea42679f724c999. Only the app diff is reviewed: `closure.ts` (+3/-1) and `tests/check_pf11c_close.ts` (+12/-3). The commits between the two heads are review records only.
**Ran:**
* `check_pf11c_close.ts` on the head: 47/47, exit 0.
* Three mutations on the working tree, one at a time. Each file was copied to the scratchpad first and copied back afterwards; `git status` was clean at the end.

**Journey score:** 6/10, carried from round 1. There was no new browser walk, because this round reviews the diff only. Nothing a user meets changed: the diff is one transaction option and three tests.

### Major 6: closed
* The test's inviter is now an active OWNER of firm A, read from `platform_role_grant` with `ended_at is null`. An Owner holds the invite key and every role's keys, so `inviterRefusal` returns null for this invitation. Only the closed-firm guard can refuse it.
* The new `refused_inviter` count is a real check, not an empty one. The refusal path commits its audit line before it throws the 410 (`session/service.ts:122-127`, "committed"). So a refusal by the inviter check would show up as a count of 1.
* The test also checks that `ownerA` is a uuid, so an empty query cannot pass silently.
* Mutation: guard changed to never match (`status === "__NEVER__"`). Result: 46 passed, 1 failed. The failed check is the invitation one, with `acc: {}`, which means the accept succeeded, and `refusedInviter: 0`. Restored.

### New tests: sound
* **n2 (export existence).** The firm's own key `firms/${A}/export-2027-03-01.zip` is never written to the archive, so only the `archive.get(exp.key)` check can block it. Mutation (the check removed): the n2 check fails, because the firm closes, and 13 later checks fail with it, because the firm is already closed. This matches the builder's "14 failed". Restored.
* **m4 (close_failed).** The fault is in the audit write, which is the last statement in the close transaction. The firm update and the session revocations have already run inside the transaction by then. So the test's checks prove a real rollback: the firm stays PAYMENT_HOLD, there are 0 `firm-closed` revocations, there are 0 `firm.closed` lines, and exactly one `PF-11c.close_failed` alert is raised. Mutation (the catch replaced by `throw e`): the suite stops with "the audit write fails inside the close". Restored.
  * Nit: each run of this test leaves one more 7-year write-once copy in the fake archive. That is the n3 behaviour, already recorded; it does no harm in the test.

### Timeout (n4): no Blocker or Major
* The close transaction now sets `{ timeout: 60_000, maxWait: 60_000 }` through `CLOSE_TX_TIMEOUT_MS`. That is above the billing transaction's 30 s (`billing/webhook.ts:165`), so the close now waits for billing instead of failing. Other services in this codebase use the same 60 s pattern: `holds/service.ts`, `plan-change/service.ts`.
* `maxWait` is only the wait for a pool connection. Sixty seconds is harmless for a nightly job that handles one firm at a time.
* An invitation accept that holds the firm row runs under Prisma's default 5 s, so it cannot keep the close waiting longer than that.
* No test exercises the timeout value itself. That is acceptable for a Minor fix.

### Still open (Minors, none blocking)
n1 and n3, as recorded in round 2. m7 (the chain verifies; a firm B line dated inside A's range) is not addressed. The recency of the export belongs to PF-11's port contract. n2, n4 and m4 are now closed.

Verdict: Approve c234475ab4c7e0d8bc0942327ea42679f724c999. No open Blocker or Major: Majors 1-6 are closed. The remaining items are Minors.
Reviewer: Approve c234475ab4c7e0d8bc0942327ea42679f724c999
