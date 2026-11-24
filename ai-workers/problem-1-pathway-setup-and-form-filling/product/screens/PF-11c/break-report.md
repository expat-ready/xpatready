# PF-11c part 1 + AUD-2 part 1: break report

PR #3195, branch `claude/runtime-pf11c-close`, head `71f3131daf1c8426d0474ec20f6b3e1c6033d7a4`. No screen: the day-90 close job (`api/src/platform/firm-closure/closure.ts`), the write-once archive port (`ports/audit-archive.ts`) and sign-in refusal (`identity/service.ts`). Scope is R1.105: the firm is closed, not deleted, and a delete inside a keep period is refused. Part 2 (purge, `plat_firm_deletion`, client-portal sessions) is out of scope.

Method: `tests/check_pf11c_close.ts` passes at this head (33/0). I wrote five probes (probe1-5.mts in the session scratchpad) that copy its scratch-database setup on 127.0.0.1:54329, one database each, every one dropped. Probe 4 also runs the job through the API's real walled pool (`walledPool`, xr_app, RLS by `app.firm_id`). The PR's own check uses a raw owner connection, so it never does this. Port 4400 was not used.

## Blockers
None.

## Majors

**M1. The close accepts a partial or stale archive copy.** closure.ts:80-86.
* If an object already sits at the key, the job does not write its own copy. It reads back whatever is there.
* The read-back check is `sha256Of(copy.bytes) === copy.sha256`. Both values come from the store, so the check proves nothing about content.
* The sha256 that `put` returns (line 82) is thrown away. Nothing is compared with the database: not the line count, not the header's `auditLines`, not the body lines' `firmId`. `namesFirm` reads line 1 only.

Repro (probe1 a):
1. Put A on hold, send all four notices, set the clock to day 90.
2. `archive.put(archiveKeyOf(A, holdSeq), '{"kind":"firm-closure-archive","firmId":A,"holdSeq":…,"auditLines":40}\n', now+7y)`.
3. Run `runFirm(A)`.

Expected: `blocked` with `archive_unreadable`. Actual: `closed`, status DELETED. The `firm.closed` line names a 110-byte copy that holds 0 of the firm's 4 audit lines.

Stale copy, the realistic path (probe2 1). The copy is written, then the close's own transaction fails. Here the `firm.closed` audit write throws once. The same happens if the process dies, or if a hold lands between `put` and the final transaction.
1. The day-90 run throws. The copy stays at the key.
2. A legal hold stands from day 91 to day 120, giving 30 `firm.closure_held` lines plus other activity.
3. After the release, the day-121 run reuses the day-90 copy.

Expected: the archive holds every line up to the close. Actual: the copy says `writtenAt` day 90 and has 4 lines, while the firm had 34 when it closed. The `firm.closed` summary still says "Its archive copy was written first".

**M2. With the real clock the close can never succeed, and the key is lost for good.** closure.ts:82 vs :86.
* `retainUntil` is `addYears(now, 7)`, where `now` is the job's clock taken at the start of `runFirm`.
* The check needs `retainUntil >= addYears(copy.writtenAt, 7)`, where `writtenAt` is the archive's clock taken after the bundle is built.
* In production the job clock is `systemClock` (wall time, `firms/runtime-ports.ts:45`), so any store that stamps its own time fails this check.

Repro (probe3 1): job `now: () => new Date()`, `fakeAuditArchive(() => new Date())`, firm on hold since 91 days ago with all notices sent.
* First run: `blocked: PF-11c.archive_unreadable`. `retainUntil` 2033-11-23T05:41:02.561Z is 21 ms short of writtenAt+7y (…02.582Z).
* Second run: the same. The key is write-once, so the firm stays blocked on every run for that hold.

The PR's check freezes the clock, which hides this.

**M3. A pending invitation can still be accepted after the close.** `identity/session/service.ts:105-145`: `accept` never reads `platform_firm.status`, and the close leaves invitations open.

Repro (probe5 2):
1. An ACTIVE Owner of A invites `late.joiner@example.test` before day 90.
2. The firm is closed.
3. `PlatformSession.accept(token)`.

Expected: 410, invitation not valid. Actual: a new ACTIVE staff row with grants, `platform.invitation.accepted`, a provider user created (`admin.createUser`) and a set-password hand-off.

Their later sign-in is refused (FIRM_CLOSED), so this is not a sign-in. But it adds a person's data and an identity-provider account to a closed firm. That data is not in the archive copy and has no `firm-closed` revocation.

## Minors

**m1. The local sign-in door issues a token for a closed firm.** `identity/service.ts:184-203`: `localSignIn` does not check firm status. Repro (probe5 1): `localSignIn({firmKey, email, secondStep:true})` after the close returns a token. It also writes a `platform.staff.sign_in` line, a revocation and `lastSignInAt` into the closed firm. The guard refuses the token (probe5 1b). The door is closed in production, hence Minor.

**m2. The archive port lets a caller store an object with a keep-until date already past.** `ports/audit-archive.ts:19`. `put(k, b, 2020-01-01)` is accepted and `remove(k)` succeeds at once (probe5 3a). The close itself guards against a short date (closure.ts:86). The port's contract does not, and AUD-2's export will call `put` directly.

**m3. The fake archive can be changed from outside, bypassing its own rules.** `ports/audit-archive.ts:40-50`. It exposes `objects`, and `Object.freeze` is shallow. Through it a caller can:
* call `objects.get(k).retainUntil.setTime(0)` and `bytes.write("EVIL")`, after which `remove` succeeds inside the keep period and `get` returns bytes whose stored sha256 no longer matches (probe5 3e);
* call `objects.delete(k)` inside the keep period (3f).

This is test-only, but tests that pass through `objects` would not catch an adapter that breaks the rules.

**m4. A failure inside the close's transaction raises no alert.** closure.ts:146. When the final transaction throws, `runFirm` throws and `sweep` only counts `failed` and logs `firm_closure_failed`. No `firm_closure_blocked` alert is raised (seen in probe2 1, r1 `threw`). Together with M1, the stale copy is then reused without anyone looking.

**m5. One missed notice blocks the close permanently.** closure.ts:72 vs `billing/exit-clock.ts:48-53`. `dueNotice` never sends an older notice late once a newer day is due, so a single missed day (say day 16) can never be sent. The firm then raises `firm_closure_blocked` every day with no way to proceed short of editing the database.

**m6. A firm that pays keeps a 7-year copy it cannot remove.** If the firm pays after its copy was written, the run ends `changed`, and the copy stays locked for 7 years. Probe3 3: `closure-4.jsonl` remains for a firm that went back to ACTIVE.

## What held
* **No archive, no hold check, failed `put`, missing notices:** `blocked` with an alert, firm unchanged (the PR's check, re-run).
* **Wrong-firm copy:** a header naming firm A at B's key gives `archive_unreadable` (probe1 b).
* **Concurrent legal hold:** a placement that takes the exclusive hold lock after the copy is written and commits 400 ms later is waited for. The close ends `held` and the firm stays on PAYMENT_HOLD (probe3 2).
* **Parallel and repeat runs:** five parallel `runFirm(B)` give one `closed` and four `changed`, one `firm.closed` line, one revocation per staff member and one object. Sweep plus `runFirm` after the close does nothing, and a second sweep closes 0 (probe2 2, probe4 d).
* **Hold ended, then a new hold:** while the firm is paid (ACTIVE) the result is `not_due`. Day 89 of the new clock is `not_due`. On day 90 the old hold's notices do not count (`notices_missing`). With the new notices sent it closes under a new key, `closure-<newSeq>` (probe3 3).
* **Firm B and scope, through the walled pool:** `withFirm(A, runFirm(B))` sees no clock (`not_due`), so B is untouched with no copy. The real sweep through xr_app closes each due firm in its own scope (probe4 a, c). An unscoped call only reaches B in a process in "direct" mode (scripts). In the API, `wallUnscopedQueries` covers this.
* **Bypass use:** `job:platform.firm.closure` is outside-only, has no routes and is audited per firm. It is used only to list firms and `touchEachFirm`.
* **Nothing deleted:** no `delete` in the job. Per-table row counts are not lower after the close, and `audit_event` refuses a delete.
* **Archive keys and keep period:**
  * The same key is refused (`ArchiveKeyExists`) whether the bytes are the same or different, and whether the date is longer or shorter.
  * `remove` 1 ms before keep-until is refused. Exactly at keep-until it succeeds, which matches S3.
  * These odd keys are refused: upper case, full-width `ｋ`, a trailing space or newline, a trailing `/`, `.`, `..x`, `./`, a backslash and the empty key.
* **Sign-in for a closed firm:** with a fresh guard token, `authenticate` answers 401 FIRM_CLOSED before any other check (the PR's check; probe5 1b).

Verdict: Changes 71f3131daf1c8426d0474ec20f6b3e1c6033d7a4

## Round 2 (diff 71f3131..1b4298d)

Head `1b4298d062c453e8f6f5dcb2fc8228d631529c5a`. Only the diff was checked. The PR's check passes (45/0). One probe (`r2/probe.mts` in the session scratchpad) built a scratch database on 127.0.0.1:54329 and dropped it afterwards. No app was started and port 4400 was not used.

### Round 1 findings
* **M1 fixed.** Each run now writes its copy under a fresh key (`closure-<seq>-<time>-<random>`), reads it back and compares it byte for byte with what it wrote and with the store's sha256 (closure.ts:91-100). The close then checks again, under the firm lock, that the copy holds every audit id (closure.ts:113-115). A partial read-back is now `archive_unreadable`, and a line written after the copy gives `changed` (the PR's check). One small window is still open: see m7.
* **M2 fixed.** Keep-until is now one value (`until` from the job clock), and the read-back compares the store's answer with that value (closure.ts:90, :99). It passes with the store's clock 25 ms ahead. Note for AUD-2's adapter: the comparison is to the millisecond, so a store that rounds keep-until down would leave the firm blocked on every run.
* **M3 fixed.** `accept` reads the firm's status under `for no key update`, which conflicts with the close's `for update` (session/service.ts:113-115). After the close the answer is 410 and no staff row is added (the PR's check). If an accept and the close run at the same time, either the accept waits and then sees DELETED, or its audit line makes the close return `changed`.
* **m1 fixed.** `localSignIn` answers 401 FIRM_CLOSED (identity/service.ts:192-194). An upper-case firm key gets no token either (UNKNOWN_STAFF).
* **m2 fixed.** The fake `put` refuses a keep-until that is now or already past (audit-archive.ts:49). **m3 fixed.** `objects` is private and `get` returns copies. **m4 fixed.** A failed close transaction now raises `firm_closure_blocked` with rule `PF-11c.close_failed` (closure.ts:126-129).
* **m5 open.** It was not in this fix (exit-clock.ts is unchanged).
* **m6 open, and now more copies are left behind.** Every run that writes a copy and then does not close leaves its own 7-year copy, which no `firm.closed` line names. That covers a `changed`, a `held` after the write, and a `close_failed`. In the probe, five parallel `runFirm(B)` gave one `closed`, four `changed`, and 5 copies under `firms/<B>/closure-`. Minor: the daily pg-boss job does not run in parallel, but each `changed` day adds one copy.

### New findings
**m7 (Minor). A line written by a transaction that is open during the close can be missing from the copy.** closure.ts:113. `audit_event.firm_id` has no foreign key (audit.prisma:30), so a writer never waits for the close's `for update`. At READ COMMITTED the `live` read cannot see a line that is not committed yet. Repro: open a raw pg transaction and insert an `audit_event` line for firm A, run `runFirm(A)` and get `closed`, then commit. Result: the line is dated 06:07:18.953, before the `firm.closed` line at 06:07:18.980, yet it is not in the copy. Nothing is deleted in part 1, so the database still holds the line. Part 2's purge must check again before it relies on the copy. The window is milliseconds wide, for example a sign-in (`authenticate` or `localSignIn`, which read the status without a lock) that commits just as the close does.

**m8 (Minor). The full-export gate accepts an export that is empty, old or about to expire.** closure.ts:86 checks only that `archive.get(exp.key)` is not null. Repro: `put("firms/<A>/export-1999-01-01.zip", <0 bytes>, now+1s)`, then `runFirm(A)` gives `closed` and `firm.closed` names it as `exportKey`. Two seconds later `archive.remove(exportKey)` succeeds and the export is gone. The gate does not check the size, the write time against `holdSince`, or that the export's keep-until reaches the copy's. Minor because `fullExport` is `null` in the feature (platform-firm-closure.ts:19), so no firm closes until PF-11 provides the port. Its contract should name these checks.

### What held
* **Close against a billing action.** The close was paused inside its transaction while holding `plat_billing:<B>`. A refresh-style transaction waited 611 ms for the same lock, then read DELETED. `FIRM_MOVES.DELETED` is `[]` (webhook.ts:52), so Stripe cannot move a closed firm. The lock order matches `refresh` (billing lock, then the firm row), so they cannot deadlock. The reverse order (the PR's `whileLocked`) gives `changed`.
* **Legal hold placed mid-run.** The PR's check covers a hold inserted after `put`, which gives `held`. The added billing lock does not touch the hold lock. Placement takes only the exclusive hold lock, and its trigger reads `platform_firm` without a row lock (pf21b migration:73), so there is no cycle with the close's `for update`.
* **Copy tampered or partial between write and close.** The fake's store is private, so the copy cannot be changed after it is written, and the byte-for-byte read-back catches a lying `get` (the PR's check). The close never reads an older object.
* **Keep-until edges.** `put` refuses a keep-until equal to now or earlier. `remove` succeeds exactly at keep-until. A store clock ahead of the job's (25 ms) passes, and one behind it passes as well.
* **Sign-in after the close.** A token issued an hour before the close gets FIRM_CLOSED at `authenticate`. Session callback goes through `localSignIn`, so it is refused too.
* **Full export missing, another firm's, or not in the archive.** Each gives `blocked` with `no_full_export` and an alert (the PR's check). The port is unwired in the feature, so no firm is closed in production.

Verdict: Approve 1b4298d062c453e8f6f5dcb2fc8228d631529c5a

## Round 3 (diff 1b4298d..c234475)

Head `c234475ab4c7e0d8bc0942327ea42679f724c999`. Only the diff was checked: `CLOSE_TX_TIMEOUT_MS` (closure.ts:43, :127) and three new checks. The PR's check passes (47/0). The work ran in a detached worktree in the session scratchpad (`r3/`), now removed: five mutation runs and one probe (`r3/probe_block.ts`, spliced in after the m4 block). Scratch databases were on 127.0.0.1:54329. No app was started and port 4400 was not used.

### Findings
**m9 (Minor). Nothing tests the new timeout, so reverting it keeps CI green.** closure.ts:127. Mutation: the options were removed (back to Prisma's 5 s). Result: 47/47 still pass. The M3 check holds billing's lock for only 400 ms. The setting does matter. In the probe, billing's lock was held for 8 s, inside the webhook's 30 s. With the options the run gives `closed` after 8.0 s. Without them it gives `blocked` / `PF-11c.close_failed` after 8.0 s, and the firm stays on hold. A check that holds the lock longer than 5 s would catch a revert. It costs about 6 s of run time.

**m10 (Minor; also true before this diff). The 60 s is not a limit on how long the close holds its locks.** The constant's comment reads as one. closure.ts:42, :106-127. Prisma's timeout does not cancel a statement that is waiting on a lock. Its ROLLBACK queues behind that statement on the same connection. The close sets no `lock_timeout` (person-link.ts:63 and form-library.ts:460 do).

Probe P2: a raw session held firm A's row (`for no key update`) for 70 s.
* At 62 s, `runFirm` had still not returned. `plat_billing:A` was still taken. pg_stat_activity showed the close's backend waiting on `... for update`.
* It returned only when the row was released, at 70.0 s, with `close_failed` and an alert. The firm was still on PAYMENT_HOLD, with no `firm.closed` line and no revocation.

So a stuck row holder keeps the close, the sweep (one firm at a time) and billing's lock for that firm waiting with no limit. A webhook for that firm waits the same way: its 30 s timeout does not cancel its own wait for the lock.

Probe P2b: a placement in flight took the legal-hold lock after the copy was written. The close then waited inside its transaction with billing's lock and the firm row both taken. An accept-style `for no key update` on the row waited, and was cancelled by the probe's 3 s `lock_timeout`. The close then gave `closed` after 12.5 s.

The 5 s setting behaved the same. The diff does not make any lock wait longer: the wait ends when the other holder lets go, whatever the setting. It only turns a 5-60 s wait from `close_failed` into a real close.

### Hazards checked
* **Billing's 30 s.** refresh (webhook.ts:136-165) holds `plat_billing:<firm>` while it calls Stripe (10 s timeout, 2 retries). That call runs in JS, not in a SQL statement, so at 30 s Prisma's ROLLBACK goes through and the lock is freed. The close's 60 s covers that with room to spare. Lock order is still billing, then the firm row, the same as refresh.
* **Pool exhaustion in the sweep.** The sweep runs one firm at a time (closure.ts:165-170), so a close uses at most one connection. `maxWait` is time spent queued for a connection, not time holding one, so it cannot drain the pool.
* **Worst case against pg-boss's 15 min expiry.** About 60 s per firm, and only when another holder is busy. If the job did expire and run again, round 1 showed that parallel runs close a firm once (the rest give `changed`). The cost is m6's extra copies.
* **Sign-in.** It is not blocked: `authenticate` and `localSignIn` read the status without a row lock (round 2). Invitation accept waits on the close's `for update` only while the close is blocked after taking the row (P2b), which does not depend on the timeout.

### The new checks can fail
* **Owner-invited invitation (check_pf11c_close.ts:234-240).** Mutation: the closed-firm guard was disabled (session/service.ts:114). Result: 46/1, and this check fails. `refusedInviter === 0` and the uuid test on `ownerA` stop it passing because of the inviter check or an empty query.
* **Export named but absent (:140-142).** Mutation: the `archive.get(exp.key)` gate was removed. Result: this check fails with `closed`, and 13 later checks fail with it.
* **Close failing inside its transaction (:198-200).** Mutation: `close_failed` returned without `blocked()`, so no alert is raised. Result: 46/1. Its rollback assertions (status, revocations, `firm.closed`) cover writes made through `tx`. A `firm.closed` write moved to the root client was not caught (47/47), but the check does not claim to cover that.

### What held
The rollback and the alert for a close that fails, the export gate, the closed-firm guard at accept, and the lock order against billing. Round 2's m5, m6, m7 and m8 were not in this diff and are unchanged.

Verdict: Approve c234475ab4c7e0d8bc0942327ea42679f724c999
