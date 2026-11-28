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

## Round 2

Reviewer: a fresh session, 24 Nov 2026. Head `b902813c001a0b5747564f0a2c2a80f85abe9e34`. I reviewed only `git diff e83c22ccd..b902813c0 -- ':!*/product/screens/*'`: firm-lock.ts, service.ts, provider.ts (a comment) and the PR test.

**Verdict: Ship (Approve).** The breaker's M1 is fixed, and so are breaker m1, breaker m3 and review m1, m2, m4 and m5. There are no Blockers and no Majors. One claimed fix is not delivered in its main case: the invitee's words (review m3 / breaker m4), shown below as R2-m1.

### What I ran
* PR test: **56 passed, 0 failed**. `graph.mjs --check`: exit 0. `git status` is clean afterwards, and every scratch database I made was dropped.
* **M1, the breaker's own script** (`pf4bcm/a.mts A1,A1q` at head): A1 gives **200 in 2514 ms**, with 1 Cognito user, 1 staff row and `accepted_at` set (the retry is a correct 410). A1q gives **200 in 2511 ms**, with 1 Cognito user and 1 staff row. Through the app on an isolated copy (:4437), a 4 s `module_event_seq` holder gives **200 in 3716 ms** (run twice). Round 1 gave 503 after the provider call. **M1 is fixed.**
* **Breaker m1** (A2 and A2s, overlapping key-share stream on the person's row): reset and sign-out-everywhere give **503 FIRM_BUSY at 10.0 s, Cognito untouched** (`totp=true`, `signOuts 0→0`), 0 audit lines and 0 revocations. With the stream at 14 s (past FIRM_TX, the P2028 path): 503 at 14.6 s, Cognito untouched. Round 1 gave 500 with Cognito changed. **Fixed.**
* **Breaker m3 / review m2:**
  * A6 (40 sign-out-everywhere requests behind a 6 s holder): 10 × 200 and 30 × 503, no 500 (round 1 had 3 × 500).
  * A3 (own sign-out behind a 6 s holder): 200 with the token ended.
  * A4 mixed burst: only 200 or 503, and Cognito and our records agree for each person.
  * A5: 503 at 1577 ms with 0 Cognito calls.
* **Real P2028 shapes** (scratchpad `r2/p2028.mts`): an expired transaction ("A query cannot be executed on an expired transaction") and maxWait ("Unable to start a transaction in the given time") are both `PrismaClientKnownRequestError` with `code === "P2028"`, and both map to 503. The PR test uses a synthetic error, but the real ones match.
* **Mutations** (in place, each file restored and checked with `cmp`):

  | Mutation | PR test |
  |---|---|
  | Mu1 txClock stores nothing | 1 fails |
  | Mu6 P2028 dropped | 1 fails |
  | Mu7 no lift before createUser | 1 fails |
  | Mu8 room margin removed | 1 fails |
  | Mu9 sign-out back to Prisma's defaults | 1 fails |
  | Mu2 inFirm without txClock | **passes 56**; caught by check_pf4b_session_reads (3 fail) |
  | Mu3 accept without txClock | **passes 56**; caught by check_pf4b_session_reads and check_pf6m2_invite_recheck (3 fail each) |
  | Mu4 one shared clock reset on each start (fails open for older transactions) | **passes 56** (R2-m2) |
  | Mu5 roomForProvider fails *open* with no clock | **passes 56** (R2-m2) |
  | Mu10 accept's outer catch without the invitee words | **passes 56** (R2-m1) |

### The checks asked for
* **txClock covers the whole callback** in inFirm (service.ts:49-57) and accept (:114-155): every statement and all three provider calls run inside `started.run`. Its context survives Prisma's awaits, and this was shown three ways. A probe ran `$queryRaw`, `$executeRawUnsafe` and `Promise.all` of thenables, then `roomForProvider` answered "room ok". Reset, sign-out-everywhere and accept answer 200 through the app, which they could not do if the store were lost, since it fails closed. And Mu2 and Mu3 turn those suites red. Node 22.23.
* **Fails closed:** with no store, the probe returns 503 FIRM_BUSY (firm-lock.ts:41-42). This is not pinned (R2-m2).
* **Refusing legitimate changes:** the refusal comes after 7 s of the transaction (12 s − 3 s − 2 s). The clock starts after BEGIN, so it never runs ahead of Prisma's own timer. The bounded waits before a provider call add up to about 1.5 s per lock attempt, so only multi-wait contention gets there, which is the case m1 means to refuse. A5b and A4 succeed in 37 ms and in under 4 s. I found no legitimate fast change that is refused.
* **A P2028 after the provider changed** can only come at commit, or, in accept, at the now-unbounded `module_event` insert. A retry is safe for all three calls:
  * createUser: UsernameExists → AdminGetUser, so the same subject is used (A1 retry, round 1).
  * resetTwoStep: MFA turned off again; `factors` then reads null, so it is a no-op.
  * signOutEverywhere: AdminUserGlobalSignOut repeats harmlessly.
  * What is left is "provider changed, records rolled back" until the person retries. That needs a commit slower than about 2 s, or the global sequence lock held for more than about 2-5 s after a 3 s provider call. It is narrow and stated in the header, so it is not counted.
* **The 503 on the bounded paths** keeps the accept page's Continue (journey 2) and shows the words in the person panel.

### Blockers
None.

### Majors
None.

### Minors (Should)
* **R2-m1. The invitee still gets "Someone else in your firm is changing staff right now" in the usual busy case**, so review m3 / breaker m4 is not fixed there.
  * Why: `lockFirm` maps its own timeout with the default words (firm-lock.ts:46, `busyOnLockTimeout(e)`). The 503 HttpException it throws then passes accept's outer `.catch` unchanged (service.ts:155).
  * Evidence: probe W1 (firm A's row held 2.5 s, then accept) gives 503 at 1596 ms with the old words. Journey 2 in the browser shows the same, twice.
  * When the new words do appear: only for a room refusal or a P2028.
  * Why the pin missed it: the pin at check_pf4bc_cognito_admin.ts:264 is satisfied by the `roomForProvider(tx, BUSY_WORDS_INVITEE)` call. Mu10 passes.
  * Fix: `lockFirm(tx, firmId, words = BUSY_WORDS)` passing `BUSY_WORDS_INVITEE` from accept (:116), plus a test: accept with the firm row held answers with `detail === BUSY_WORDS_INVITEE`.
  * Note: the new words still say "Your firm's account". r3-m1's condition was words without "your firm"; this reads acceptably as the firm being joined, so I do not count it.
* **R2-m2. Two properties of the room check are not pinned.**
  * Fail-closed with no clock (Mu5): a future fourth provider call outside txClock would fail open silently.
  * A clock per transaction (Mu4): the comment at check_pf4bc_cognito_admin.ts:243 ("a shared one would refuse the fresh transaction") holds only for a clock set once. One reset on each start fails open and passes.
  * Fix: assert `roomForProvider` outside `txClock` → 503. Then start transaction A, wait past 7 s, start B, and check that A is still refused.
* **R2-m3. An own sign-out behind a firm-lock holder of more than 15 s is still a 500 with a live token** (the rest of breaker m2).
  * Journey 4, twice: a 16 s holder gives **500 after 15.7 s**, 0 revocations, and the old token still gets 200. The browser forgets it (frame.tsx:92).
  * The unbounded path does not map P2028 (service.ts:57, `Promise.reject(e)`). PF-11c's close or plan change can hold the firm lock that long.
  * A 7 s holder now gives 200 and the token ended (round 1: 500). Review m2's condition, a limit above any bounded holder, is met.
  * Fix (optional): map P2028 to 503 on the unbounded path as well.

### Dimensions changed since round 1
D2 5/5 (M1, breaker m1) · D11 4/5 (R2-m3, rarer than round 1's m2) · D10 4/5 (R2-m1) · D16 4/5 (honest pins for every changed line except R2-m1/R2-m2; Mu2/Mu3 caught by neighbouring suites) · the rest as round 1. BIC-01–20: N/A (not a case-side screen).

### Journey score: 9.5/10, a pass (none at 0)
Details: Round 2 in `screens/PF-4bc-minors/journey-test-reviewer-2026-11-24.md`.

### Could not check
A live Cognito pool; a real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); `tsc`. Two databases named `xr_studio_pf4bc_scratch_13331` and `_13458`, with no live process behind them, were on :54329 after my runs. I could not tell whether they are mine, so I left them for `tools/prune-test-dbs.sh`.

Verdict: Approve b902813c001a0b5747564f0a2c2a80f85abe9e34

## Round 3 (diff-only, 53e603a8)

Head 53e603a8ed33169ebbf4f2f704c9f60d8f855f96 (checked). The changes since my round-2 Approve (code at b902813c0, records at 611d0027e) are two pure merges: origin/main (c60972ea8), then #3217's new head 2242c776 (records only). `git diff 611d0027e HEAD -- <#3479's own files>` is empty, and the code is unchanged since b902813c0. **Scope:** only whether main's changes break #3479's code or interact with it.

### What I ran (on 53e603a8, Postgres :54329)
* check_pf4bc_cognito_admin **56/0** · check_pf4b_session_reads **55/0** (part A; part B needs a port) · check_tx_end_guard **21/0** and check_pool_tx_return **16/0** (main's pool guards, in this tree) · `tsc -p api/tsconfig.json --noEmit` **0 errors**. I did not re-run pf4dn, pf4r, pf11c or pf6m2 (they need an isolated copy each). The builder's runs are taken as given.
* **Probe through main's real pool** (scratchpad `probe_pf4bc_realpool.mts`). It used a scratch database with every migration and the sample seed, and `core.ts` Db as it is: `walledPool` + `oneQueryPerCaller`, xr_app under RLS. Each lock was held from a second connection. 10/11 checks passed; the one failure is R2-m1 (below).
  * Reset two-step with T's staff row held **FOR KEY SHARE** (the lock main's new foreign keys to platform_staff take) gives **503 FIRM_BUSY at 1558 ms**. Held **FOR SHARE** instead (the lock `pf_import_attestation_owner` takes), it gives **503 at 1524 ms**. In both cases there was no provider call, and the revocation and audit counts were unchanged, so nothing was committed.
  * Sign-out everywhere with the same hold gives 503 FIRM_BUSY at 1527 ms, with no provider call.
  * Own sign-out (unbounded) with its own row held FOR KEY SHARE for 2.5 s waits past the bound and **completes at 2524 ms**: 200, and the revocation is written.
  * Accept with the invitation row held FOR UPDATE (taken after the firm lock, so the kept bound applies) gives **503 FIRM_BUSY at 1517 ms with the invitee's words**. Accept with the firm row held gives 503 at 1506 ms. In both cases there was no createUser and no staff row, and the invitation stayed unaccepted. The retry afterwards accepts, with one createUser.
  * **The connections are clean:** 10 concurrent transactions on the pool (10 distinct backends) all read `lock_timeout = 0`, and none is idle in a transaction. **Main's pool guards stayed silent:** no `platform_pool_open_transaction` line and no "query after COMMIT/ROLLBACK" refusal.

### The interactions asked about
* **walledPool / oneQueryPerCaller.** All of #3479's transactions are interactive (no array batch, so M2's refusal does not apply). `set local lock_timeout …` and `… to default` are not transaction ends for `endsTransaction` (firm-scope.ts:542), so M1's guard leaves them alone. After a 55P03 the callback throws, Prisma's ROLLBACK returns the connection 'I' and idle, and the checkout and release checks pass. The `set local` value dies with the transaction, and the pool's session-level `set_config` for firm and role is untouched. The probe above shows all of this.
* **The four new tables with a foreign key to platform_staff** (msg_mailbox, plat_import_batch/mapping/attestation). `endSessions` takes FOR UPDATE on the person's row (service.ts:69). That conflicts with the FOR KEY SHARE their inserts take and with the attestation trigger's FOR SHARE. Under #3479 the wait is now bounded: 503 FIRM_BUSY in about 1.5 s, before any provider call. Without #3479 it would have waited unbounded, past the provider change. That is the intended direction, and nothing breaks. No API code writes these tables yet (grep), so today this is latent. A note for the PF-10/PF-19m builders, not a finding here: a long import or mailbox transaction will make that person's reset and sign-out-everywhere answer "try again" for as long as it runs.
* **Web sign-out (`signOutHere`, frame.tsx:91).** It is client-only: it broadcasts and forgets locally before the same POST. Other windows only end locally (drafts.tsx:76) and send no extra server sign-out, so nothing new hits the unbounded path.
* **accept-page.tsx's 503.** The file is unchanged by main. A 5xx goes to `setError` and keeps Continue, while a 4xx closes the link (:74-75). Journey 2 (below) confirms this on 53e603a8.

### Blockers
None.

### Majors
None.

### Minors (carried, unchanged since round 2; not caused by the merges)
* **R2-m1 is still open, and reconfirmed through main's real pool.** When accept meets a busy firm row, the invitee is shown the staff wording: "Someone else in your firm is changing staff right now…".
  * Why: `lockFirm` maps its own timeout with the default words (firm-lock.ts:46). Accept's outer `busyOnLockTimeout(e, BUSY_WORDS_INVITEE)` (service.ts:155) then gets an HttpException and passes it on unchanged. The invitee's words appear only for later lock waits (the invitation row: probe), a room refusal or a P2028.
  * Fix as in round 2: pass the words through `lockFirm` from service.ts:116, and pin `detail` with the firm row held.
* **R2-m2** (the room check's fail-closed behaviour and its per-transaction clock are not pinned) and **R2-m3** (an own sign-out behind a firm-lock holder of more than 15 s gives a 500 and leaves the token live): both unchanged.

### Dimensions
These are as in round 2. Main's merge changes none of them.

### Journey score: 9.5/10, a pass (none at 0)
Re-walked on 53e603a8 on an isolated copy on :4436, twice. Details are under "Round 3" in `screens/PF-4bc-minors/journey-test-reviewer-2026-11-24.md`.

### Could not check
A live Cognito pool; a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); pf4dn, pf4r, pf11c and pf6m2 on my side. Six `xr_studio_pf4b_scratch_*` databases are on :54329. That test drops its own database on exit, and I cannot tell whose these are, so I left them for `tools/prune-test-dbs.sh`. `break-report.md` in this folder was being changed by another session while I worked. I did not touch it.

Verdict: Approve 53e603a8ed33169ebbf4f2f704c9f60d8f855f96

Reviewer: Approve 53e603a8ed33169ebbf4f2f704c9f60d8f855f96
