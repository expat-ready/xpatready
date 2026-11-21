# J-5 part 1 review (R1.5: staff sign-in with two-step, lock-out on leaving), PR #2627

Reviewer: a fresh session that did not build it (screen-review + journey-test, reviewer role). Commit reviewed:
`032102334e97855232f3a41cf32cfa3657b3861f` on `claude/nifty-fermat-feao23`. Read: `shape.md`, `j_5.ts`, `j_6.ts`, `walk.mjs`,
concept `pf-6-staff` r2 (`origin/lead-b-front-office`), BACKLOG J-5 / PF-4b / PF-4bc, qa/CAPABILITIES R1.5,
`api/src/platform/identity/service.ts`, `web/src/modules/platform/{session,frame}.ts(x)`. Live AI off, US$0.
Journey test report: `journey-test-reviewer-2026-11-20.md` (score **8/10**, pass).

## Runs (isolated copies, never :4400)
* The header line as given: `j5r 4415`, fresh copy: **27/27, exit 0** (10 s).
* Kept copy `j5rv 4447`, run twice in a row: **27/27 and 27/27**; seats and the walk person cleaned up both times.
* Visible browser: `HEADED=1 xvfb-run`, `j5rh 4449`: **27/27, exit 0** (22 s, slowMo 250).
* A first kept-copy try on 4416 died mid-run: another session started `isolated.sh j5b 4416` on the same port. That was
  the environment, not the PR, but it showed m3 below (the real failure was hidden behind the `finally`'s error).
* My own walk (scratch script, copy `j5rw 4448`): keyboard sign-in, 1024 and 400 px, double-click Accept, a reused
  link, wrong role by URL, reload after deactivation, the dead token on other routes, "Sign in again here".
* The header line parses with `walk.mjs`'s pattern (`j5 4405 --ttl 30 PLATFORM_IDENTITY=local`); 44NN = journey number,
  like the other journeys.

## 1. Does j_5.ts prove what it claims?
* **W1-W4 (L5):** real screens all the way: sign-in card → Team → Invite → demo inbox link → Accept in a second browser →
  Signed in elsewhere → Person panel Sign out everywhere / Deactivate / Reactivate → refused sign-in in words → the walk ends
  on the Person panel's roles. Each step waits on a screen element with a timeout that throws. Met.
* **DW1 (L4):** not vacuous. `before` = 200 and `exp` in the future rule out expiry. The 401 must carry `STAFF_NOT_ACTIVE`
  and "deactivated". Without the status check (`service.ts:117`) the revocation answers `SESSION_REVOKED`, so DW1 fails.
  Without both, the answer is 200 and DW1 fails. The revocation query (`j_5.ts:166`) matches only the deactivation row:
  "another-device" rows are 1 ms before the sign-in, and the sign-out-everywhere row is older than the W2 re-sign-in.
  The audit line's actor, before and after are read, and the count rises by exactly 1. Met.
* **DW2 (L1, stand-in):** the pair does isolate the second-step rule. The person is ACTIVE again (W4), and the status
  check comes before the second-step check (`service.ts:162-163`). The email is the same and only `secondStep` changes.
  The with-step token resolves to this person on `/me`. Removing `service.ts:163` makes DW2's pass half fail, and
  loosening it to "truthy" is caught by the text `"true"`. What it does not do: it is a pass/fail pair on the stand-in's
  door, not a swap from fake to real (P-606). The real second step (Cognito) is part 2/3. The screen always sends `true`
  (`session.ts:96`), so L1 is not exercised on screen. Row L1 of the shape says so. See m2 for the label and the shape text.

## 2. Is the shape honest about L2/L3?
Yes. The concept r2 §2 puts password, second step and passkey on the identity provider's managed pages. PF-4bc says the
live proof (C21) is "not a merge gate". The J-5 row says "Cognito proof needs the founder's AWS". `shape.md:51-53` keeps
R1.5 Partial with no `Completes:`. Row L1 also says honestly that on Cognito the second step rests on the
`PLATFORM_POOL_MFA_REQUIRED` setting (`cognito.ts:43,49`), and part 3 checks the pool against AWS's pages.

## 3. Repeatability and conventions
New email per run; seats lent and given back; the walk person deactivated in `finally`; two runs on one kept copy pass.
Same shape as `j_6.ts` (recorder, `client().sql`, axe tags, `finally` clean-up, the page-error line). Waits throw on
timeout, with the one exception in m4.

## 4. What the walk reveals in the app: the builder's question
After **Sign out everywhere** or **Deactivate**, the person's tab shows a blank "Sign in to your firm" card with no
reason (screenshots `W2-signed-out-everywhere-1440.png`, `W3-deactivated-next-click-1440.png`; same after a reload).
`session.ts:82` keeps only the 401's code, and `frame.tsx:98` gives words only to `SIGNED_IN_ELSEWHERE`. The server's
"This session was ended" / "This staff account has been deactivated" never reach the screen.
**Judgement: a Minor to raise, not a Major for R1.5.** The R1.5 line (L4, "signed out of every device at the next
request") is met and proven by DW1. The concept specifies words only for Signed in elsewhere (§4). The gap is against
EXPERIENCE §2.7 [M] "Reasons everywhere" on PF-6 part 1's frame, which is on main and outside this PR's touch list
("app code only if the walk stops"). It needs its own screens item.

## Issues (no Blocker, no Major)
* **m1 (Should, raise as a screens follow-up):** the blank card after the session ends, as in §4: `session.ts:82`,
  `frame.tsx:98`. In this PR: `shape.md:26` ("shows the sign-in card in words") and `:28` read as if the screen gives the
  reason. Say "the sign-in card, with no reason yet (follow-up)". A comment at `j_5.ts:141`/`:168` naming the follow-up
  would help, so the step can be tightened when the fix lands.
* **m2 (Should):** `shape.md:34-35` says DW2 also checks a token whose `amr` lacks `otp`, with an `amr: ["pwd","otp"]`
  partner. `j_5.ts` does not do this; it hands that check to `check_pf4_identity.ts:141-144` (`j_5.ts:17`). Make the shape
  match, or run that check from j_5 as `j_6.ts` runs PF-6b's. The label "DW2 fail (the fake)" (`j_5.ts:199`) names the
  positive control, not a fake. Call it "DW2 control".
* **m3 (Should):** `j_5.ts:203-205`: the `finally` signs the Owner in before it gives the seats back. If that fetch
  throws, the seats are not given back and the first failure is hidden: on the dead copy the trace pointed at `:203`.
  Give the seats back first and guard the sign-in. Also, the seats are lent at `:57` and the browser starts at `:59`,
  both before `try`: a failed launch leaves the plan inflated on a kept copy.
* **m4 (Could):** `j_5.ts:75` `nextClick` swallows a failed click and falls back to `goto`. If the My account link goes
  missing, the step still passes. Let it throw.
* **m5 (Could):** `j_5.ts:139` checks `>= 1` but its label says "one revocation row". This is a fresh person, so use `=== 1`.
* **m6 (Could):** `j_5.ts:123` (claimed at `:5` and `shape.md:25`: "their name in the header") counts `[data-staff-name]`
  but does not read the name. Compare it with the staff row's `display_name`.
* **m7 (raise, on main, not this PR):** a Case Officer opening Team sees "Your roles do not include the permission this
  needs (agent/staff:manage)" (`api/src/platform/identity/guard.ts:112`). That is a permission key on the main path,
  against EXPERIENCE §5 [M].

## D1-D20 (this PR is a test; scores are for the walked screens and the proof)
D1 2/2 the walk follows concept §1 and the J-5 row · D2 2 one invitation, one staff row after a double-click Accept, audit
+1 · D3 n/a · D4 n/a · D5 2 reload, double click, reused link, sign in again, reactivate · D6 n/a · D7 n/a (no AI) · D8 2
breadcrumb kept · D9 1.5 next step unclear after session end (m1) · D10 1.5 m7's key · D11 1.5 m1 · D12 2 team look ·
D13 2 axe 0 at 1440/1024/400, no sideways scroll, keyboard sign-in, focus moves to the card · D14 2 · D15 2 walk 10 s ·
D16 2 DW1/DW2 fail when their rule is removed (by reading) · D17 simulated only · D18 n/a · D19 1.5 R1.5 Partial (L2/L3,
honest) · D20 simulated only.

## BIC (EXPERIENCE §6; staff platform screens, mostly n/a)
BIC-11 Met (one primary per card/panel) · BIC-13 Partly (refused sign-in in words on the card; a session end has no
reason, m1) · BIC-18 Partly (same) · BIC-19 Met (1440, 1024) · BIC-20 Met (keyboard sign-in, axe 0, 400/1024 no scroll;
200 % zoom not checked) · BIC-01..10, 12, 14..17 N/A (no case data on these screens).

## Could not check
A real screen reader; 200 % zoom; Cognito (L2, L3: part 3); an intended user's unaided walk (D17/D20 stay with the
founder); `walk.mjs` and the recording check (no ffmpeg in this container, known). `graph.mjs` does not index
`tests/journeys/` (j_6 is missing from it too), so it gives no J-5 line.

Verdict: Approve 032102334e97855232f3a41cf32cfa3657b3861f

## Re-review aff1fd011 (diff `032102334..aff1fd011` only; the review, journey-test and break-report files are records)
**Runs, my own ports:** the race suite on its usage line (`pf4rv 4444`): **5/5**. Burst sizes were
`tokensPerRound [5,18,18,17,18,18]`; the raced Deactivate took 101-174 ms, against 15-23 ms with no sign-ins running.
`check_pf4_identity.ts` (copy `pf4`, 4443): **120/120**. `check_pf4b_session_reads.ts` (4443): **57/57**.
`j_5.ts` on a kept copy `j5rx 4442`: **28/28 twice**.
I did not re-run the race on main's code: the builder's 1/5 is taken from the PR.

**Lock order: sound, and no deadlock path is left.**
* All writers of `platform_staff` now take the firm row first. They are `service.ts:154,294,312` and
  `session/service.ts:130`:
  * sign-in, local and Cognito: firm `FOR KEY SHARE` (`service.ts:146`), then the person `FOR UPDATE`;
  * identity `inFirm` (`service.ts:193`), session `inFirm` (`session/service.ts:47`), invitation accept (`:100`) and
    terms accept (`terms/service.ts:82`): firm `FOR UPDATE`, then the person.
* `KEY SHARE` conflicts with `FOR UPDATE`, so a sign-in and a staff change queue at the firm row before either touches
  the person. Nothing takes the person and then the firm.
* Inside the sign-in, the foreign-key inserts (revocation, audit) need only the `KEY SHARE` it already holds. It never
  upgrades its firm lock. `auditEvent.record` takes no lock of its own.
* `web-address` takes `FOR NO KEY UPDATE` on the firm (`web-address/service.ts:121,151`). That is compatible with
  `KEY SHARE`, and it touches no staff row.
* The Cognito path calls `recordSignIn` from the guard, on the `platform.identity.authenticate` bypass and outside any
  transaction. It holds nothing before the firm, and RLS cannot hide the firm row from the `KEY SHARE` select.
* **B2 is closed by this order.** Under READ COMMITTED a staff change waits for an in-flight sign-in to commit, then
  reads its `lastSignInAt`. The revocation is therefore at or after that sign-in (`:293`; `endSessions` already did this,
  `session/service.ts:65`). A sign-in that waited behind the change sees `DEACTIVATED` under its lock (`:149`) and is
  refused (`:176`; Cognito `:125`).

**Existing behaviour: nothing that PF-4 or PF-4b asserts changes, and both pass in full.**
* `"inactive"` is reachable only in the race: both callers check status before `recordSignIn` (`:121`, `:172`).
* Moving the revocation to `max(clock, lastSignInAt)` moves it only by the few ms the stand-in dates ahead.
* Cognito sign-in times are whole seconds and in the past, so `max()` gives the clock for Cognito.

**My Minors m1-m6:** all addressed in `j_5.ts` and `shape.md`.
* m3: seats are lent after the browser starts and given back first; the clean-up sign-in has its own `try`.
* m4: `nextClick` now throws.
* m5: `=== 1`.
* m6: the name shown is compared with the stored one.
* The new DW1 line (`j_5.ts:193`, the old token stays dead after reactivation) is sound.

**New Minors (no Blocker, no Major):**
* **n1 (Should): the race suite's power.** While sign-ins overlap, Postgres lets more `KEY SHARE` lockers in ahead of
  the waiting `FOR UPDATE`. The Deactivate therefore waited out most bursts: 18/18 tokens in 4 of 6 rounds and 17/18 in
  one, so most rounds raced little or nothing. Only round 0 clearly cut the burst (5 issued, 13 refused).
  `check_pf4r_lockout_race.ts:73` should also require at least one round where the burst was split (some issued, some
  `STAFF_NOT_ACTIVE`). Otherwise a green run can come from rounds that never raced.
* **n2 (note, no fix needed in this PR):** the same effect means a steady stream of sign-ins for one firm delays its staff
  changes; I measured about 150 ms here. Only the local door, which is demo-only, can be sent that fast. Cognito
  sign-ins reach `recordSignIn` once per real sign-in. Worth one line in the `recordSignIn` comment.
* **n3 (Could):** the race suite's `finally` gives the seats back (`:79`) after awaited deactivations. A throw there
  leaves the plan lent: the same order as m3, fixed in `j_5.ts` but not here.

Verdict: Approve aff1fd011a397ba221941836db8c5c56b132170e

## Re-review 6a71adf5 (diff `aff1fd011..6a71adf5`, code and test only)
**Run:** `check_pf4r_lockout_race.ts` on `pf4rv 4444`: **7/7**. Every round now splits around the change
(tokens `[5,3,4,3,4,6]`, refused `[31,33,32,33,32,30]`). Under a colleague's stream of sign-ins, Deactivate and Reactivate
each answer in 26-46 ms. Across the whole run, staff changes took 16-118 ms. I did not repeat pf4, pf4b or pf12, as you asked.

**Is any deadlock left between a sign-in and a staff change? None.**
* The sign-in takes the person `FOR UPDATE`, then its foreign-key inserts take `KEY SHARE` on the firm.
* `NO KEY UPDATE` (both `inFirm` helpers and the invitation accept) does not conflict with `KEY SHARE`, so a sign-in
  never waits on a staff change's firm lock. The two meet only on the person's row: the deactivate's update, or the
  `KEY SHARE` a role grant's foreign key takes on that row. Those waits run one way only, so there is no cycle.
* Staff changes still queue among themselves, because `NO KEY UPDATE` conflicts with `NO KEY UPDATE`.

**Did any guard rely on `FOR UPDATE` blocking foreign-key inserts? No.**
* The seat checks run in invite (`service.ts:348`, inside `inFirm`), accept and reactivate. All three take
  `NO KEY UPDATE`, so they still queue among themselves.
* The only other staff inserts are signup (a new firm) and the seed (at start).
* B2 now rests on the person's row, and that holds.

**(c) under Read Committed: correct.** The deactivate's `UPDATE` waits for a sign-in holding the row. Once that sign-in
commits, the next statement takes a fresh snapshot, so the `findFirst` sees the new `lastSignInAt`. A later sign-in's
`SELECT … FOR UPDATE` waits for the deactivation, then reads the deactivated row and is refused (`:149`).

**Terms accept still `FOR UPDATE` (`terms/service.ts:82`): one residual deadlock, Minor.**
* Terms accept holds the firm `FOR UPDATE`, then `createMany` takes `KEY SHARE` on the person's row through the
  `(firm_id, staff_id)` foreign key (migration `20261115180000_pf5_signup_terms:88`).
* The same person's parallel sign-in holds that row `FOR UPDATE`, then waits for the firm `KEY SHARE`. That is a cycle.
* It needs the same person accepting a new terms version during their own sign-in on another device. Postgres breaks it
  with one 500.
* It was already on main. aff1fd011's firm `KEY SHARE` closed it by accident; this head reopens it.
* **Should:** change it to `FOR NO KEY UPDATE`, one line in the same class as B1.

**`endSessions` (`session/service.ts:64`) reads `lastSignInAt` without the person's lock, Minor.**
* Sign out everywhere and two-step reset no longer wait for an in-flight sign-in. At aff1fd011 they waited, through the
  firm row.
* A stand-in sign-in dated a few ms ahead of the clock can therefore outlive a concurrent Sign out everywhere.
* Cognito sign-in times are in the past, so Cognito is not affected.
* **Could:** take the person's row `FOR UPDATE` first, as (c) does.

**n1 and n3:** fixed (`PER_LOOP` 12, the "race happened" line, seats given back first).

Verdict: Approve 6a71adf57bec32998ffca60ada390187099bbb61

## Re-review e0d6d891 (diff `6a71adf5..e0d6d891 -- '*.ts'`)
`endSessions` is called only inside session `inFirm` (signOut, signOutEverywhere, resetTwoStep). Its order is firm `NO KEY UPDATE`, then person `FOR UPDATE`. A sign-in takes person `FOR UPDATE`, then firm `KEY SHARE`, which `NO KEY UPDATE` never blocks, so only the staff change waits (on the person's row) and there is no cycle; nothing takes person then firm. Terms accept now takes `NO KEY UPDATE` and still queues with the other staff changes. Both Minors from 6a71adf5 are closed; the race suite's usage line is a test-only change. No runs: nothing here gives cause to doubt your results.
Verdict: Approve e0d6d891b4d12c40dfc4e280e340b922a20e9e39

## Re-review 9c5ec72e (diff only; the merge of origin/main, a817de42 and 9c5ec72e)
The three service files are unchanged since e0d6d891: `git diff e0d6d891 9c5ec72e` on them is empty. The builder's side of the diff is the `R1.5.md` → `J-5.md` rename (content identical) and `j_5.ts` W1 step 4. The other `MODULE.rows` files in that diff come from main through the merge. W1 step 4 now waits for `/home` (PF-18h) with a `waitForURL` that throws on timeout, then opens `/account` by its address and compares the shown name with the stored one. `landedHome` is always true once that wait has passed; the wait itself is the real check, and it fails loudly. No runs: nothing in the diff gives cause to doubt your 28/28 and the suites.
Verdict: Approve 9c5ec72e93fc397579d9771f6c262fd713512640
