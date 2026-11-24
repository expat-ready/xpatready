# PF-4bc follow-up (#3479): independent review

Reviewer: a fresh session, 24 Nov 2026. Head `e83c22ccdc0e7d38ef3f6441a3e7589139039144`, stacked on #3217's approved head `7a7740278`. I reviewed only `git diff 7a7740278..e83c22ccd`: `session/firm-lock.ts`, `session/service.ts`, `tests/check_pf4bc_cognito_admin.ts` and `MODULE.rows/PF-4bc.md`. I also read the PR body (#3479).

**Verdict: Ship (Approve).** All five round-3 Minors are fixed as described. There are no Blockers and no Majors. I found five new Minors. The first is the only one that matters for behaviour: keeping the bound for the whole transaction also bounds a lock that accept takes *after* its provider call.

## What I ran
* `npx tsx --tsconfig api/tsconfig.json tests/check_pf4bc_cognito_admin.ts`: **50 passed, 0 failed** (11 s).
* `run-suites.sh --only "check_pf4b_session_reads.ts check_pf6m2_invite_recheck.ts"`: 57/0 and 19/0, both PASS.
* `graph.mjs --check`: exit 0. `tsc` was not run (the PR reports `typecheck.mjs` as PASS).
* **Red at e5e39f51** (a scratch copy with that commit's three files): **45 passed, 5 failed**. The failures were the 503 race, the person-row bound ("still waiting" at 6001 ms), the 12 s limit, the sign-out pin and the accept pin. The inFirm pin passes there, as expected for a pin of wiring that already existed. So the tests are honest.
* **Mutations** (scratch copy only; every file restored and checked with `cmp`; `git status` is clean):

  | Mutation | Result |
  |---|---|
  | M1: `set local lock_timeout to default` put back after the firm lock | **1 fails** (R3-m1: "still waiting", 6005 ms) |
  | M4: accept without `.catch(busyOnLockTimeout)` | **1 fails** (the accept pin) |
  | M5: inFirm without its outer `.catch(busyOnLockTimeout)` | **passes 50** (m4) |
  | M7: inFirm ignores `bounded` (`if (o.bounded \|\| true)`), so sign-out is bounded again | **passes 50** (m4) |

* **Probes** (scratchpad `probe/probe.ts`, `probe/journey.ts`, `probe/j5.ts`). These ran on a scratch database and on an isolated copy at :4436, PLATFORM_IDENTITY=local, which has since been stopped and dropped:
  * A lock timeout from a *model* query surfaces as `DriverAdapterError` "canceling statement due to lock timeout", and the regex (firm-lock.ts:17) matches it. Raw queries were already covered (P2010 with 55P03 in `meta`, round 3).
  * In the app: sign-out-everywhere while the firm row is held gives **503 FIRM_BUSY at 1521 ms**, and a retry gives 200. The invitation page under contention shows "Not done" plus the words, and **Continue stays**. A retry lands on `/sign-in/callback` and writes 1 staff row, 1 accepted invitation, 1 audit line and 1 joined event.

## The checks asked for
* **Callers of `PlatformSession.inFirm`** (session/service.ts only; identity/service.ts has its own private, unbounded `inFirm`):
  * `signOut` (:183): unbounded, which is right because it makes no provider call.
  * `signOutEverywhere` (:193): bounded, which is right. The Cognito call comes last, and no lock is taken after it.
  * `resetTwoStep` (:207): bounded, which is right. Its locks (person row, outbox advisory lock on a random key, msg_firm) all come before `admin.resetTwoStep`, which is the last statement.
  * `accept` (:109) uses `lockFirm` directly with `FIRM_TX`.
  * The tables these transactions write have no deferred triggers and no NOTIFY, so nothing locks at commit.
* **Every lock timeout is mapped:** the `.catch` sits on the whole `$transaction` promise, both in inFirm (:57) and in accept (:152). So a timeout inside `fn` and one at commit both become 503. The unbounded path passes errors through unchanged.
* **409 → 503:** nothing in `web/src` or `tests/` (other than this test) reads `FIRM_BUSY` or depends on its 409. `person-panel.tsx:16` shows `e.message` for any status. `accept-page.tsx:75` now keeps Continue (walked). The contracts do not name FIRM_BUSY.
* **Unbounded sign-out:** the SQL and the options are the same as before PF-4bc (`git show d297ce36e^`: plain `for no key update`, Prisma's defaults). See m2 for a limit.

## Blockers
None.

## Majors
None.

## Minors (Should)
* **m1. After accept's provider call, a lock wait is now bounded at 1.5 s.** This brings back "provider changed, our records rolled back" for accept, and the PR body and header claim the opposite ("always before the provider call", firm-lock.ts:9-13).
  * Where: session/service.ts:148-150. The Cognito user is created at :148. Then `tx.moduleEvent.create` (:150) takes the **global** `module_event_seq` advisory lock (pf3 migration :435). Every module-event writer in every firm holds that lock until it commits.
  * Evidence: with the bound kept (firm-lock.ts:26), a 4 s holder gives **503 FIRM_BUSY at 1758 ms after the provider changed**. Round-3 code waited and **committed at 4006 ms** (probe P1). It is the same through the app (J5): 503 at 1595 ms, 0 staff rows, and the stand-in already held the user.
  * Recovery: a retry works, because `createUser` is idempotent (UsernameExists → AdminGetUser). So this is a Minor and not R2-M1 again. Reset and sign-out-everywhere take no lock after their provider call.
  * Fix: in accept, run `set local lock_timeout to default` just before `this.admin.createUser` (:148), since the bound only matters before the provider call. Then correct "before any provider call" in firm-lock.ts:9-10 and in the PR body.
* **m2. An unbounded sign-out still fails behind a holder that takes more than its 5 s default limit, and FIRM_TX now lets a bounded holder keep the firm lock up to 12 s.**
  * Evidence: in the app (J4, twice), with the firm row held 7 s, sign-out gives **500 (P2028) at 6.7 s**, writes 0 revocation rows, and the old token still gets 200 on `/me`. frame.tsx:92 forgets it in the browser anyway. With a 3 s holder the result is 200, a revocation row, and 401 afterwards.
  * Fix: give the unbounded path a limit above any bounded holder. For example, at service.ts:57 use `o.bounded ? FIRM_TX : { timeout: FIRM_TX.timeout + 3_000 }`, plus a pass test with a holder of about 7 s.
* **m3. The busy words are wrong for the invitee and for m1's cause.** firm-lock.ts:16 says "Someone else in your firm is changing staff right now". The invitee is not in the firm yet, which round 3's r3-m1 already pointed out, and a module-event writer elsewhere is not changing staff. Fix: neutral words, such as "This could not be finished just now because of other changes. Nothing was saved; try again in a moment." (with "nothing was saved" dropped if m1 is not fixed).
* **m4. Two parts of the wiring are not pinned** (M5 and M7 pass): inFirm's outer `busyOnLockTimeout`, and inFirm honouring `bounded: false`. If either regresses, a person-row timeout becomes a 500, or sign-out is silently bounded again. Fix: at check_pf4bc_cognito_admin.ts:249, also require `/busyOnLockTimeout/` and `/if \(o\.bounded\)/` in `body("inFirm")`, or drive `PlatformSession.inFirm` on the scratch database.
* **m5. Stale words.** provider.ts:96 still says "FIRM_TX: 8 s, covering a bounded 1.5 s wait". check_pf4bc_cognito_admin.ts:193-194 still says "at most 1.5 s and gets 409". Fix: 12 s, about 3 s per wait, and 503.

Not counted (outside the diff): after the refusal, focus leaves Continue (accept-page.tsx; Enter → busy). A keyboard user must Tab back to it, but the notice is `role="alert"`, so it is announced.

## Dimensions changed since #3217 round 3
D2 4/5 (m1, which a retry recovers) · D11 4/5 (m2) · D10 4/5 (m3) · D13 5/5 (axe 0 on the refused state; 400/1024/1440 px with no sideways scroll; keyboard path completes) · D16 4/5 (honest red→green; m4) · D19 2/5, unchanged (declared). The rest are as in round 3. BIC-01–20: N/A (not a case-side screen).

## Journey score: 8.5/10, a pass (none at 0)
Details: `screens/PF-4bc-minors/journey-test-reviewer-2026-11-24.md`.

## Could not check
A live Cognito pool (C21); a real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); `tsc`.

Verdict: Approve e83c22ccdc0e7d38ef3f6441a3e7589139039144
