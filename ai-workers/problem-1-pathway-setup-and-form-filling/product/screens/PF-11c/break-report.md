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
