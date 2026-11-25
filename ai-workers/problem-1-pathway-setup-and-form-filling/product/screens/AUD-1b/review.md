# AUD-1b review (reviewer, 18 Nov 2026), commit dac6a7a08fb581261dba82c8a278a18680c5d1da

**Scope:** runtime row, no screen. Reviewed the code against Build Lead C's brief (`build-lead-c-briefs/AUD-1b.md`, which wins) and the draft brief on `main`. Read only the files they name, plus the diff and the `auditEvent.record(` callers. Commits after dac6a7a08 (5e1180d9f, 2a9b67ffe) are **not** reviewed here; re-review reads only those (P-277).
**Skill verdict:** Ship after fixes. Journey score **9 / 10** (pass): `journey-test-reviewer-2026-11-18.md`.

## What I ran (exact commit, Postgres 127.0.0.1:54329, Nest on a random port, never 4400 or the builder's ports)
* `check_aud1b_adapter.ts`: **29 passed, 0 failed**. `check_pf0p_ports.ts`: **122 / 0**. `check_aud1a_insert_only.ts` Part A (scratch databases): 31 pass. Part B needs the isolated copy on 4606 (the builder's), so I did not run it: one `fetch failed`, nothing written (that copy database does not exist).
* **Mutations** (scratch worktree, one change each, then `check_aud1b_adapter.ts`):

| Rule removed | Result |
|---|---|
| the firm check (`audit-event.ts:41`) | DW2 fail and DW6 fail go red |
| the OUR_STAFF refusal (`:44`) | DW3 fail goes red |
| the correlation id | DW1, DW2 and DW5 go red (5 lines) |
| `caseId` written | contract and DW7 go red |
| the firm lower-cased | DW6 pass goes red |
| `writeAuditWithAlarm` bypassed | DW4 and DW6 go red |
| the SYSTEM context for jobs | DW2 pass goes red |
| **`{ attempts: 1 }` → `{ attempts: 3, retryMs: 1 }`** | **29 / 29: nothing fails** (Major 2) |
| **`?? jobFirm` dropped (`context.ts:29`)** | **29 / 29: nothing fails** (minor 2) |

* **My breaker run:** 500 interleaved staff requests across firms A and B, each with its own X-Request-Id and with `setTimeout` and `setImmediate` inside and outside the transaction, all 200. Every line had its own id, its own firm and FIRM_STAFF. From inside those requests, 20 real pg-boss jobs were enqueued (`PlatformJobs`). Every job line was `job:<key>`, its own firm and SYSTEM. No job context carried a request's actor or id. A token for firm A with an entry for firm B was refused and nothing was written. The separate breaker report (`break-report.md`) covers FO-1a's sales routes under a forced audit failure: rolled back, one alert, held.

## Callers on main that would now be refused
I checked every `auditEvent.record(`, `ports.audit.record(` and `this.audit.record(` caller: booking, booking types, retainers, sales, corporate, complaints, sign-up, session, invitation, terms, consent and web address. **None is refused.**
* Staff paths pass `ctx.firmId` or `actor.firmId` with `staff:<ctx.staffId>`.
* Every `system:` writer (`booking-page`, `booking-link`, `web-form`, `sign-up`, `invitation-accept`, `ses-notice`, `firm-created`, `complaint-ack-reminder`) is one of these:
  * a public door or webhook (no `req.platform`, so no firm and no actor in the context);
  * a job of the same firm;
  * the start-up catch-up (no scope).
* No guard sets `ourStaff`.
* Forward note for the PR body: `web-address/service.ts:135` `change()` (ExpatReady staff acting on another firm's address) has no route on `main`. Once PF-4s wires it, the firm check will refuse it unless that request's context firm is the target firm. Name it in the PF-4s follow-up.

## The builder's six decisions
1. **Agree.** Write the word's type, and refuse OUR_STAFF rather than mislabel it. The AUD-1a trigger refuses any type that differs from the word's, so "type from the context" can only fail anyway. This one refuses clearly, before the write.
   * It departs from the brief's wording ("actor_type from the context when present"). Record it in the PR body with the follow-up for PF-4s: our staff needs its own actor word and a mapping row. `hook.ts` gives our staff `staff:<id>`, which the trigger types FIRM_STAFF.
2. **Disagree as built** (Major 1). Inside a staff request, an entry whose actor is not the request's actor is written as-is (`system:x` → SYSTEM, `seed:x` → SEED, another staff member → FIRM_STAFF). The brief's reading, where the context type wins and the trigger refuses, would have failed closed. No caller on main needs the leniency (above).
3. **Agree.** Parse errors go through the alarm with ids only (`alertIds`), as the brief says ("every failure").
4. **Agree.** PF-4's role change writes through `identity/audit.ts`, which this row leaves direct. Sign-out goes through the port, so it is the honest PF route for DW1.
5. **Disagree that it proves "no retry"** (Major 2). After the first failed statement PostgreSQL aborts the transaction. A second try then fails at `platformAuditWorkspaceId` with 25P02, never reaches the trigger, and the sequence stays at 1.
6. **Agree.** The firm check compares lower-cased ids: the context's firm (`req.platform.firmId`, or the job's firm) against the entry's.

`check_pf0p_ports.ts`: the harness change is minimal (one mapped field, `caseId: e.caseId`). The touch list is respected; `guard.ts` is untouched (`req.platform` already holds the staff id). 339 changed lines, under 800.

## D1–D20 (runtime row)
* **D1 Requirement fit 4.** SA-11-2's firm, type and correlation are on every port line, and P-607 (3) fail-closed holds. The actor is not tied to the request (Major 1).
* **D2 Data integrity 4.** Cross-firm lines are refused (DW6, breaker). Mis-typed actors are possible within the firm (Major 1).
* **D5 Stability and recovery 5.** Rollback is verified (DW4, DW6, FO sales in the breaker report).
* **D6 Freshness and governance 4.** Who, when and correlation are on the line. Departures are recorded in a code comment, "Unconfirmed: no counsel".
* **D11 Feedback and state 4.** One alert, the metric line and the error line. The person gets a bare 500.
* **D15 Speed 5.** 500 requests in 2.5 s; no per-row requests added.
* **D16 Testability 3.** Two rules go untested when removed (the mutation table).
* **D18 Information provenance 4.** Actor type and correlation are on each line. Correlation can be set by the client (minor 1).
* **N/A (no screen):** D3, D4, D7–D10, D12–D14, D19. **D17 and D20:** simulated only.
* **BIC-01–BIC-20:** N/A, because this is not a case-side screen.
* **Graph:** not run. `graph.mjs` writes `qa/GRAPH.md`, and this check writes only `review.md` and the journey report.

## Issues
**Major 1 (Must): a staff request can write a line in another actor's name or type.**
* Where: `audit-event.ts:44`. It refuses only when `ctx.actor === e.actor`, so the comment at `:43` and the `AuditRefused` doc at `:31` promise more than the code does. Same as the breaker's M1.
* Fix: when the context names an actor, refuse an entry whose actor differs (an exact, case-sensitive match). Keep `system:` and `seed:` for scopes without an actor (jobs, doors).
* Fail test: in DW3's scope, and through the probe signed in as `user-R`, record `actor: "system:x"`, `"seed:x"`, `staff:<user-S id>` and `staff:<R's id in upper case>`. Each must be refused (`AuditRefused`) with 0 lines written.

**Major 2 (Must): DW4 fail does not test "no retry is attempted".**
* Where: `tests/check_aud1b_adapter.ts:152-162` (the rule is at `audit-event.ts:50`). With retries switched on (3 tries), DW4 still passes. The done-when (P-606) asks DW4 to fail as named.
* Fix: count tries where an aborted transaction cannot hide them. Either capture the log sink (`useLog`) and assert the `audit_write_failed` metric line has `attempts: 1`, or wrap `tx` in a Proxy that counts `auditEvent.create` calls.
* Fail test: the mutation above must turn DW4 fail red.

**Minor 1 (Should): the `job:` prefix is trusted.**
* Where: `context.ts:27`. A client's X-Request-Id `job:<x>` marks a request as a job (context SYSTEM), and that id is stored as the line's correlation. Same as the breaker's m1.
* Fix: mark jobs on the scope, never by the id's prefix.
* Fail test: a public request with `X-Request-Id: job:forged` has `auditContext().actorType` undefined.

**Minor 2 (Should): the job's own firm loses to a surrounding request's firm, and that branch is untested.**
* Where: `context.ts:29` (`scope?.firmId() ?? jobFirm`). Dropping `?? jobFirm` fails nothing, and DW2 runs `observed()`, not PF-14's runner. Same as the breaker's m2.
* Fix: the job's firm wins when `currentJobFirm() !== undefined`.
* Fail test: a handler registered on `PgBossJobs` directly, inside a firm-A `requestScope`, running a firm-B job, gets context firm B.

**Minor 3 (Should): the alert names the entry's firm, not the acting one.**
* Where: `audit-event.ts:50`. A refused cross-firm line is raised under the target firm and can mute that firm's real alert for 5 minutes. Same as the breaker's m4.
* Fail test: firm A refused for B, then a real failure in B: both alerts are raised.

**Minor 4 (Should): the firm is re-read from `req.platform` at write time.**
* Where: `hook.ts:57`. Code that rewrites `req.platform.firmId` mid-request would move the wall (breaker m3). No writer exists on `main`; note it for PF-4s.

**Minor 5 (Should): two follow-ups to name in the PR body.** Decision 1's departure and the PF-4s word and mapping, and the web-address `change()` note above.

## Not checked
* The full `ci` and the other done-when suites (the builder's regression run was going on).
* AUD-1a Part B (it needs the builder's copy on 4606).
* `check-port-contracts.mjs`, the module-card check, and a screen reader or person walkthrough (no screen).
* 5e1180d9f (it says it fixes Major 1 and minors 1–3; Major 2 is not in its list).

Verdict: Changes needed

## Round 2 (18 Nov 2026), head 62cd1a62541c4277eb12ca7246411eaf405f9036
**Read:** only `git diff dac6a7a08..62cd1a625 -- …/prototype/studio` (P-277): `audit-event.ts`, `context.ts`, `hook.ts`, `check_aud1b_adapter.ts`. The records commits touch only `screens/AUD-1b/`.
**Run:** `check_aud1b_adapter.ts` at the head gives **31 passed, 0 failed**. Mutations ran in a scratch worktree at the head, one change each.

| Rule removed or reverted | Result |
|---|---|
| `{ attempts: 1 }` → `{ attempts: 3, retryMs: 1 }` | DW4 fail (review M2) goes red: `tries4: 3`. **Major 2 closed.** |
| the exact-actor check | DW6 fail (review M1) goes red. **Major 1 closed.** |
| the OUR_STAFF refusal | DW3 fail goes red |
| `job:` refused in `correlationOf` | DW1 fail (breaker m1) goes red. **Minor 1 closed.** |
| the alarm's firm = the context's | DW6 fail (alert under firm A) goes red. **Minor 3 closed.** |
| **the entry's firm lower-cased** (`audit-event.ts:45`) | **31 / 31: nothing fails** (Major R2-1) |
| **the job's firm wins** (`context.ts:30`, back to `scope?.firmId() ?? jobFirm`) | **31 / 31: nothing fails** (Minor 2 stays open) |

**Callers re-checked against the exact-actor rule** (`e.actor !== ctx.actor` refused in a signed-in request):
* Every staff-path writer on `main` passes the request's own word:
  * sales and corporate use `actorOf(ctx)`;
  * booking uses `staffActor(ctx)`;
  * retainers and web-address `change` use `staff:${ctx.staffId}`;
  * complaints use `staff:${ctx.staffId.toLowerCase()}` (staff ids come from the database in lower case);
  * session and terms use `actorWord(staffOf(r).staffId)`;
  * manual lead arrival and its consent line use `actorOf(ctx)`.
* `system:` writers are public doors, webhooks or jobs, with no actor in the context.
* None is refused.
* No other test sends a `job:` X-Request-Id. `check_pf23_observability.ts` uses `job:` only inside a job's own scope. I did not run it: it defaults to port 4487, the builder's.

**Round 1's remaining minors:**
* **Minor 4: agree to leave by design.** `firmId` is lazy like PF-23's own, and only `guard.ts` writes `req.platform`. Keep it as a PF-4s note.
* **Minor 5: PR body.** Check it when the PR opens.

### Issues, round 2
**Major R2-1 (Must): DW6 lost its pass case, so the firm's lower-casing is untested.**
* Where: `tests/check_aud1b_adapter.ts`, about line 197. Commit d0a2311d8 replaced the `own` probe ("DW6 pass: the same entry naming the request's own firm (any letter case) is written, lower-cased, with its change") with the wrong-actor probe. DW6 now has fails only.
* Why it matters: the brief and P-606 ask for "a pass and a fail each", and the done-when says "DW1-DW7 each passing and failing as named". Dropping `.toLowerCase()` at `audit-event.ts:45` now passes the whole suite. Before, DW6 pass caught it.
  * With the lower-casing gone, a request entry whose firm id is upper case would be refused, because the context's firm is lower case.
  * Outside a context, it would keep the upper case in `detail.firmId`, which the PF-0c, PF-4b and PF-19a readers match by value.
* Fix: put the three lines back next to the new probe:
  * call the probe with token A, `firmId: FIRM_A.toUpperCase()` and `change: true`;
  * expect 200, a line `FIRM_A|FIRM_STAFF|…` and the workspace row present.
* Fail test: removing `.toLowerCase()` must turn it red.

**Minor 2 (Should, still open): nothing tests that the job's own firm wins inside a job.**
* Where: `context.ts:30`. The breaker's m2 fix is correct, but reverting it fails no test.
* Fail test: a handler registered on `PgBossJobs` directly, run inside a firm-A `requestScope` for a firm-B job, must see context firm B. A firm-A entry must be refused.

Verdict: Changes needed

## Round 3 (18 Nov 2026), head c74cb084378ce6e417d81d3f28fcbadfe34b07e2
**Read:** only `git diff 62cd1a625..c74cb0843 -- …/prototype/studio`, which touches `tests/check_aud1b_adapter.ts` alone. No product code changed since round 2.
**Run:** `check_aud1b_adapter.ts` at the head gives **33 passed, 0 failed**. Mutations ran in a scratch worktree at the head:
* Dropping `.toLowerCase()` at `audit-event.ts:45` turns **DW6 pass** red (500 on the upper-case own-firm entry). Restored, it is green. **Major R2-1 closed.**
* Reverting `context.ts:30` to `scope?.firmId() ?? jobFirm` turns **DW2 fail (review minor 2)** red: the context says firm A inside the firm-B job. **Minor 2 closed.**
* The new DW2 case uses the real `PgBossJobs`. Its handler is registered and the runner started inside a firm-A `requestScope`, so pg-boss's worker inherits that scope. That is exactly the leak the fix guards against. The runner is stopped in `finally` and the scratch database is dropped as before.

**Open:** no Blocker and no Major.
* Minor 4 (`req.platform` re-read) is left by design, which I agree with; note it for PF-4s.
* Minor 5 (decision 1's departure, the PF-4s actor word and mapping, the web-address `change()` follow-up) goes in the PR body. It is checked when the PR opens.

**Not run here:**
* the full `ci`;
* `check_pf23_observability.ts` and AUD-1a Part B (both default to the builder's ports 4487 and 4606);
* `check-port-contracts.mjs` and the module-card check.

These stay with the builder's regression run and CI on this sha (P-385).

Verdict: Approve c74cb084378ce6e417d81d3f28fcbadfe34b07e2

## Round 4 (main merge, diff-only), head 1b2defdba37db673d790159c2f22ad4da7b28804
This round covers the merge `1b2defdb` alone. Its parents are `4b74beb` (round 3's approved `c74cb084` plus review records only) and `origin/main` `628742f0`. It is a plain merge, with no rebase.

**1. Conflict and diff against main.**
* `git diff origin/main 1b2defdb` touches the same 15 files as AUD-1b's own diff (`git diff 15c75cd 4b74beb`, where `15c75cd` is the merge base). Both are 660 insertions and 27 deletions.
* With index and hunk headers stripped, the two patches differ only in the `MODULE.md` context lines. Main's Tables line now has `platformOffice, platformStaffOffice`, and its Tests line has `check_pf18a_offices.ts`. No AUD-1b code line changed, and no main line is dropped.
* `git show --cc` shows one combined hunk. Tables is main's line. Tests is main's line with `tests/check_aud1b_adapter.ts` appended. The AUD-1b invariant line is still there.
* The card is **39 lines**, so it is within the 40-line limit.
* PF-18a's Purpose, Entry points and Invariant lines from main are all present.

**2. New audit writers from main.** Main changed 16 files under `prototype/` since the base. The only new audit writer is `api/src/platform/settings/offices/service.ts`. It calls AuditPort 4 times, wired with `auditEvent` in `features/platform-settings-personal.ts`. Main adds no direct `tx.auditEvent.create`. `clock.ts`, `ports/offices.ts`, the contract, the migration and `check_qa507` write no audit line, and the migration adds no trigger on `audit_event`. Each AUD-1b rule holds:
* **Firm.** It is `firmScope(a.firmId).firmId`, where `a = staffOf(req)` is the guard's `req.platform`. That is the same source `hook.ts` `firmOf` gives `context.ts`, so the request's firm always equals the line's firm. `firmScope` lowercases, and the adapter lowercases both sides.
* **Actor.** It is `` `staff:${a.staffId}` `` (`service.ts:62`). `hook.ts` `auditOf` builds `` `staff:${req.platform.staffId}` `` from the same field, so the two match exactly. The type is FIRM_STAFF.
* **Case and our staff.** No `caseId` is passed. No `ourStaff` request exists on main.
* **Rollback.** Every call is inside the change's `$transaction` after the row write, so a refused line rolls the office change back.
* **`setStaffOffice`.** It has no route yet (PF-18s). Its callers in `check_pf18a_offices.ts` run outside any request scope, so the context is undefined and the line is written with the entry's own firm. That is still allowed. When PF-18s routes it, the same `staffOf` source keeps it valid.

So nothing from main would be refused at runtime, and no line is written without a firm.

**3. Evidence (the builder's run on the merged head in the cloud copy; I did not run any suite, because they share the database):**
* `check_aud1b_adapter.ts`: 33 passed, 0 failed.
* `check_pf18a_offices.ts`: 87 passed, 0 failed. It includes the zone-change line asserting `detail.firmId === firmA` through the AUD-1b adapter.

The wider suite and CI on this sha stay with the builder and CI (P-385).

**Journey test:** not re-run, because the merge changes no screen or route of AUD-1b's. The one journey score stays **9 / 10, Pass**, from `journey-test-reviewer-2026-11-18.md`.

**Open:** no Blocker and no Major. Minors 4 and 5 from round 3 are unchanged; they go in the PR body.

Verdict: Approve 1b2defdba37db673d790159c2f22ad4da7b28804


## Round 5 (second main merge, diff-only), 18 Nov 2026, head 3d507a2ed16da4fbd749984a98a1dd4b5fd0e047

Round 4 (commit 871c9465, on another branch) approved the first main merge 1b2defdb. Main then moved from 628742f0 to 2c9231ab (PF-18b support tickets, FO-1p FoPersonPort, PF-21s, PF-5t screens, journey recording) and conflicted again. 3d507a2e is a plain merge: parent 1 is 1b2defdb, parent 2 is origin/main 2c9231ab, the merge base is 2c9231ab. No rebase.

What I did: read code and ran git only. I ran no test suite, server or browser (another long run shares this machine). The suite results below are the builder's, from this copy, on 3d507a2e.

**1. The merge is still exactly AUD-1b's change.**
* `git diff --stat origin/main 3d507a2e` gives the same 15 files at +660/−27 as round 4's `git diff 1b2defdb^2 1b2defdb`.
* I diffed the two patches with their `index` lines removed. The only difference is in `api/src/platform/MODULE.md`: one hunk header moves (`-26` becomes `-27`), and the context lines are main's new ones.
* `MODULE.md` keeps both sides:
  * Tables has main's `platformSupportTicket, platformSupportMessage`.
  * Tests has main's `tests/check_pf18b_support.ts`, followed by AUD-1b's `tests/check_aud1b_adapter.ts`.
  * AUD-1b's one rule line stays.
  * The card is 40 lines, at the limit and not over it.
* No other file differs from what round 4 approved.

**2. How main's new audit writers interact with AUD-1b.**
* **No new line without a firm.** Since 628742f0, main added five `record(tx, …)` callers: three in `support.ts`, and two each in `fo-person-port.ts` and in `fakeFoPerson`. All of them go through `AuditEntry`, which requires `firmId`. Main added no new raw `tx.auditEvent.create`; the raw writers are the same files as before.
* **PF-18b `raise` / `addMessage`** (`POST /api/platform/support/tickets[/:id/messages]`, behind PF-4's guard). This is a signed-in FIRM_STAFF request, so the adapter applies two checks:
  * **Firm.** The line's firm is `firmScope(ctx.firmId)` for raise, and the ticket's firm for addMessage. `visible()` reads the ticket under `firmScope(ctx.firmId)`, so in both cases it is the request's firm. Both sides are lower-cased before they are compared, so this passes.
  * **Actor.** The line's actor is `staff:${ctx.staffId.toLowerCase()}`. The request's actor is `staff:${req.platform.staffId}` (hook.ts `auditOf`). `staffId` is `PlatformStaff.id`, a `@db.Uuid` that Prisma returns in lower case, so the two words are identical and this passes.
  * Nothing on this path is refused at runtime. OUR_STAFF cannot occur: `ourStaff: true` is not set anywhere on main.
* **PF-18b `replyAsSupport`** writes `system:support` with the ticket's firm. It has no route and no caller on main, so it is not refused today. When PF-17's console wires it under `/api/system` after PF-4s, AUD-1b as written will refuse it in one of two ways:
  * every line in an OUR_STAFF request is refused;
  * a signed-in request whose actor is not `system:support` is refused.

  That is the fail-closed rule the founder recorded (P-607 (3), "until PF-4s"), not a regression. See n1.
* **FO-1p `FoPersonPort`.** It is bound as `FO_PERSON_PORT` in `features/front-office-sales.ts`, but nothing on main injects or calls it. Only `tests/check_fo1p_person_port.ts` and the port contract use it. Its caller will be the case side's case opening (CS-K1 part 2, not on main). The firm is the caller's `a.firmId` and the actor is the caller's `a.actor`. No path runs it at runtime today, so nothing is refused. When CS-K1 calls it:
  * in a PF-4-guarded request, `a.firmId` must be the request's firm, and `a.actor` must be exactly that request's `staff:<id>`;
  * a `system:` actor, such as the test's `system:cs-k1.backfill`, is allowed only in a job or outside a signed-in request;
  * a case-side request that is not under PF-4's guard (no `req.platform`) carries only its correlation id, and nothing is refused.

  See n2.
* **Types.**
  * `AuditPort` is unchanged by AUD-1b. `AuditEntry` gains only an optional `caseId`, which is additive.
  * `SupportDeps.audit: AuditPort<Tx>` and `PrismaFoPerson(audit: AuditPort<Tx> = auditEvent)` take the adapter as it is.
  * `fakeFoPerson` takes `AuditPort<unknown> & { discard? }`, and `fakeAudit` fits it.
  * The tests' throwing stand-ins (`{ async record() { throw … } }`, PF-18b's `boom as never`) fit structurally.
  * The builder's port-contract run shows 0 problems over 21 ports, FoPersonPort included.

**3. Evidence on 3d507a2e (the builder's run, this cloud copy).**

| Suite | Result |
|---|---|
| check_aud1b_adapter | 33/33 |
| check_pf18b_support | 41/41 (after `prisma generate` for main's new tables) |
| check_fo1p_person_port | 35/35 |
| check_pf0p_ports | 122/122 |
| check_case_feed | 39/39 (sweeps the new callers: `platform_support_ticket`, `fo_person`, `fo_company` are all area entities) |
| check_pf18a_offices | 87/87 |
| port contracts | 0 problems (21 ports) |

**Journey score.** This round changes no screen or journey. The one journey score for this check is still round 1's: **9 / 10, Pass** (`journey-test-reviewer-2026-11-18.md`).

**Issues.** No Blocker and no Major. These notes are for later rows, not for this PR:
* **n1 (Note, for PF-4s / PF-17).** `replyAsSupport`'s `system:support` line will be refused under the OUR_STAFF rule, and under the exact-actor rule, once a console route calls it. Whoever wires that route has to give our staff an actor word, which is PF-4s's job.
* **n2 (Note, for CS-K1 part 2).** In a signed-in request, FoPersonPort's `a.actor` must be the request's own `staff:<id>`, and `a.firmId` must be the request's firm. The CS-K1 builder should pass `staff:<request staff id>`, not a `system:` word, in that path.
* **n3 (Note).** PF-18b's suite calls `SupportService` outside any request scope, so no test runs AUD-1b's actor and firm checks on the support routes. By reading, they pass (see 2). This is not a gap in AUD-1b's own tests: `check_aud1b_adapter` covers those checks.

Reviewer: Approve 3d507a2ed16da4fbd749984a98a1dd4b5fd0e047


## Round 6 (CodeQL fix, diff-only), 18 Nov 2026, local commit cdaa0fab2d250605d87c5913393197ec24def2ee
**Scope:** only `git show cdaa0fab` (parent 3d507a2ed16da4fbd749984a98a1dd4b5fd0e047, approved in round 5) and a scan of `git diff origin/main cdaa0fab` for timers. As asked, I ran no suite and edited no code. Rounds 4 and 5 are not recorded in this file; they live with the PR.

**1. Test-only, and the suite's behaviour is unchanged.**
* The commit touches one file, `prototype/studio/tests/check_aud1b_adapter.ts`: 5 lines added, 2 removed, all in `ProbeController.probe`. No product code changes.
* Before the fix, both awaits used `pause(b.waitMs ?? 0)`. Now they use `pause(waitMs)`, where `asked = Number(b.waitMs)` and `waitMs = asked > 0 && asked <= 250 ? asked : 0`.
* DW5 is the only caller that sends `waitMs`. It sends `(i * 7) % 23`, so 0 to 22.
  * 1 to 22 pass through unchanged.
  * 0 gives 0, as before.
* Every other probe call (DW6 and the actor cases) sends no `waitMs`. `Number(undefined)` is NaN, which fails both comparisons and gives 0, the same as `undefined ?? 0` did.
* `pause(0)` is still `setTimeout(r, 0)`. Each request still yields to the event loop before the transaction and inside it.
* So DW5's 100 requests still interleave across awaits on both sides of `$transaction`. That is what makes its own-correlation and own-firm assertions meaningful. The delays DW5 relies on are exactly the same, so the builder's 33/33 is the expected result.

**2. Will CodeQL accept the guard as a sanitizer?** Very likely yes, but I could not run CodeQL here.
* `js/resource-exhaustion` (`ResourceExhaustionCustomizations.qll`) has an upper-bound barrier guard. In a relational comparison taken as true, it treats the lesser operand as sanitized.
* `asked <= 250` puts `asked` on the lesser side. The ternary's true branch is reached only through the `&&` true edge, so that use of `asked` sits behind the guard.
* `asked` is a single-assignment `const`, so the barrier applies to the SSA use in the ternary. The false branch is the constant 0.
* `Number(...)` is a taint step for this query, so the unguarded form would still have been flagged. The guard, not the conversion, is what clears it.
* An explicit comparison is the safer choice than `Math.min`, which CodeQL does not reliably model as a barrier for this query.
* Confirmation is the CodeQL run on this sha after push: the alert on line 33 must close with no new one. If it stays open, raise it in the PR rather than dismissing it.

**3. Other user-controlled timers in the PR diff: none.**
* Every added `setTimeout`, `pause(…)` and `timeout:` in `git diff origin/main cdaa0fab` is in `tests/check_aud1b_adapter.ts`:
  * the `pause` helper itself;
  * the two probe awaits, now bounded;
  * `pause(5)` and `pause(250)` in the DW2 job loop, both constants;
  * `$transaction(…, { timeout: 20_000 })`, a constant.
* The product files in the diff (`audit-event.ts`, `context.ts`, `hook.ts`, `log.ts`, `settings.ts`, `identity/audit.ts`, `ports/…`) add no timers.
* The `setTimeout`/`setImmediate` mentions in `break-report.md` and earlier rounds of this file describe the breaker's scratch script, which is not in the repo.

**Open:** no Blocker, no Major, no new Minor. Earlier open items stand as recorded in round 3.

Verdict: Approve cdaa0fab2d250605d87c5913393197ec24def2ee (pending CodeQL closing the alert on this sha)

## Round 7 (third main merge, diff-only), 19 Nov 2026, head 85b92f81afeb627faaa1d034dce0a841006c7e36

Reviewer: Opus, high effort, diff only. The tech lead approved the merge of main 34c5e1e99, card only. No suite was run in the review; the builder's numbers are below.

* **Merge.** `85b92f81^1` is cdaa0fab (round 6) and `^2` is main 34c5e1e99.
  * Only `api/src/platform/MODULE.md` was resolved by hand. It holds main's card, AUD-1b's one rule line, and `tests/check_aud1b_adapter.ts` at the end of the existing Tests line.
  * The card is 40 lines, and no card in the tree is over 40.
* **The change against main.** `git diff 34c5e1e99 85b92f81` has the same 15 files as `git diff 2c9231ab cdaa0fab`, +663/−27. The hunks match in 14 files. The card differs only in context, where main's `check_pff4_file_type.ts` now appears.
* **Main's audit writers since 2c9231ab.**
  * FO-13i `identity.checked` (`front-office/compliance/identity/service.ts`) uses `firmId: ctx.firmId` and `staff:${ctx.staffId}` from `req.platform`, in a FIRM_STAFF-only route. A failed write is not swallowed: it gives a 500 and a rollback.
  * `retainer.sent` changed its summary and detail only.
  * There is no new direct `auditEvent.create` and no migration on `audit_event`.
  * Nothing would be refused at runtime, and no line is written without a firm.
* **Builder's evidence on 85b92f81:**

  | Check | Result |
  |---|---|
  | `check_aud1b_adapter` | 33/33 |
  | `check_pf0p_ports` | 122/122 |
  | `check_case_feed` | 39/39 |
  | Port contracts | 0 problems (21 ports) |
  | Module cards | PASS (15 cards) |

* **Findings.** No Blocker or Major, and no new Minor. Behaviour is identical to round 6, so the journey score of 9/10, Pass, stands.

Reviewer: Approve 85b92f81afeb627faaa1d034dce0a841006c7e36

## Round 8 (fourth main merge, diff-only), 19 Nov 2026, head b3b0b2a03b90f0abe6736b3a6fba18fb1876d684

Reviewer: Opus, high effort, diff only, no suites run. The tech lead (Lead 84) OK'd the push.

* **Merge.** Plain merge of main 9d440b2f (after #2157) into 85b92f81.
  * One conflicting hunk: the platform card's Tests line. The resolution keeps main's line (`check_pf19r_senders.ts`) and adds `check_aud1b_adapter.ts`. The card is 40 lines.
  * `git diff 9d440b2f b3b0b2a0` is the same 15 files, +663/−27. Its only difference from round 7 is the Tests line's context.
* **Main's audit writers since 34c5e1e99.**
  * FO-2 part 3 (`front-office/sales/prospects.ts`): every line has `firmId: ctx.firmId` and `staff:${ctx.staffId}` from `req.platform`, so it matches AUD-1b's actor and firm exactly.
  * #2157 (PF-19r part 1) writes no audit line. The complaint reminder still writes `SYSTEM_ACTOR` in a job with the job's own firm.
  * No new direct `auditEvent.create`.
  * Nothing would be refused, and no line is written without a firm.
* **Builder's evidence on b3b0b2a0:**

  | Check | Result |
  |---|---|
  | `check_aud1b_adapter` | 33/33 |
  | `check_pf0p_ports` | 122/122 |
  | `check_case_feed` | 39/39 |
  | `check_fo2p3_prospects` | 44/44 |
  | `check_pf19r_senders` | 24/24 |
  | Port contracts | 0 problems |
  | Module cards | PASS |

* **Findings.** None (no Blocker, Major or Minor).

Reviewer: Approve b3b0b2a03b90f0abe6736b3a6fba18fb1876d684
