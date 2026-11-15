# PF-21w review: the complaints record's routes (PR #1823)

Reviewer (Opus 5.5, did not build it), 15 Nov. Commit **d02865694cbed23717a303f561f6c1bf281886ff** on `claude/tender-cannon-wl91rj`, base `origin/main` d52b7274e. The diff is three new files: `routes.ts`, `features/platform-complaints.ts` and `tests/check_pf21w_routes.ts`. The later head 9fbdd3745 adds only `break-report.md`, so the code is the same. US$0, live AI off, no model call. :4400 was never touched.
**The bar:** brief `lead-b-briefs/PF-21w.md` @ 94f6a3389. A permissions row (P-608): I read it against `complaints.ts` (its "Who" lines), `keys.ts` and `guard.ts`. **No screen** (that is PF-21s), so D1–D20, the BIC-01–20 scorecard, keyboard use, 1024 px and 200 % zoom are N/A here. The brief's route table counts as "what gets built" (P-26).

## What I ran
* `check_pf21w_routes.ts`: **83 passed, 0 failed** (about 5 s), and the same on an isolated copy.
* `check_pf21_complaints.ts`: 107/0. `check_features_registry.ts`: 27/0. `check_pf23w_jobs_wired.ts`: 31/0.
* `check_pf4_identity.ts`: **118/118, parts A and B.** Part B ran against my copy of the **real `main.ts`** on :4438, with its own database, `PLATFORM_IDENTITY=local` and `PLATFORM_SAMPLE_SEED=on`. That run included the real demo reset. The copy is stopped and its database dropped.
* `tsc -p api/tsconfig.json`: 15 errors, all in older files; none in `complaints` or `pf21w`.
* Mutations, each run on a scratch copy of the code:

| Mutation | Result |
|---|---|
| POST / declared `@AnyStaff` | DW1 ×3 and DW9 red (79/4) |
| GET / declared `@PermissionKeys(read)` | DW2 ×2, W1 ×2 and DW9 red |
| `/handler` declared with `record` only | DW4 and DW9 red |
| `@HttpCode(200)` removed from close | DW3 and W1 red |
| DELETE left undeclared | start-up stops, naming `ComplaintsController.remove` |
| WeakSet check removed | the suite exits non-zero ("already has a handler") |
| `one()` removed for `view` | still green: the service refuses an array anyway, so this helper is a second guard, not load-bearing |

## Named cases (each ticked only if the test fails when the rule is removed)
- [x] **DW1.** 201 for OWNER, ADMIN and CASE_MANAGER; 403 `MISSING_PERMISSION` from the guard for the other three (`:118-129`). The code check separates the guard's 403 from the service's own (mutation 1).
- [x] **DW2.** Owner and Admin see all; the CASE_OFFICER handler sees their own. 404 "never 403" for four roles. Paging and six 422s (`:136-160`).
- [x] **DW3.** The handler with no key gets 200 on all four steps. BILLING_FINANCE, and CASE_MANAGER (record only), get 404 (`:163-172`).
- [x] **DW4.** OWNER and ADMIN get 200. CASE_MANAGER gets 403 while being the handler, the strongest case. Inactive and other-firm handlers get 422 (`:175-186`).
- [x] **DW5.** 405 `COMPLAINT_KEPT` for all six roles; the rows and the event count are unchanged (`:189-195`).
- [x] **DW6.** A second close gets 409; a closed step gets 409; a note adds one event and leaves the row as it was (`:198-206`).
- [x] **DW7.** 401 on all nine routes, and for a forged token (`:209-213`).
- [x] **DW8.** 404 on six `/:id` routes. Firm B's complaint is unchanged and never listed. DELETE: see reading (1).
- [x] **DW9.** The start-up check passes; one stripped route is refused by name. Each route's declaration matches the brief. Registration happens once per runner. A real fail line exists only through the crash (mutation 6), which is acceptable.
- [x] **W1.** open → acknowledge → step → response → close (RESOLVED) → closed. The outbox holds `complaint.received` then `complaint.closed`, in that order.

## The two readings the builder flagged
1. **DELETE answers 405 on another firm's id: accepted, and better than the literal brief.**
   * A 404 on DELETE would need a lookup: a rule in the controller, or `complaints.ts`. Both are excluded.
   * A lookup would also make *own-firm* ids answer 405 and missing ids 404. READ_ONLY could then probe which complaint ids exist in their own firm, against the "Who" rule that an id leaks nothing.
   * The uniform 405 is the same for own, other-firm, missing and malformed ids, and for every role: checked by the test (`:222-223`) and by me on the copy (`/zzz` → 405).
   * Lead B could reword DW8 to "every /:id route except DELETE (its uniform 405, DW5)".
2. **R3-m1 not taken: correct.** It changes `complaints.ts:57` and its comment, which is outside the touch list. It was optional in the PF-21 round-3 review, and the PR says so as the brief asks.

## The checks you asked for
* **`one` and `size` (`routes.ts:19-21`) cannot widen access or cause a 500.** Access comes only from `ctx.keys` and `handlerStaffId` in `list()`; the query never reaches the filter except through `view`, `cursor` and `limit`. On the real app:
  * `view=`, `limit=1e2`, `-1`, `9999`, repeated parameters, and a 199-character cursor all gave 422.
  * `view[x]=` and `cursor[]=` gave the default page: Express 5's simple parser keeps the brackets as part of the key's name.
  * A cursor carrying firm B's id gave firm A's rows only.
* **Once-per-runner registration is right for Nest's lifecycle.**
  * `ComplaintJobs.onModuleInit` (`features/platform-complaints.ts:29-32`) runs before `PlatformJobs.onApplicationBootstrap` starts pg-boss, and `PgBossJobs.handle` before start is applied at start.
  * On the real app, a complaint received 40 days earlier got `REMINDER_SENT` within 8 s, and `/api/health/ready` reported the job queue running.
  * The WeakSet matters only when two Nest apps share one runner, which happens only in tests. On a throw it deletes the runner from the set, so a retry is possible.
* **The wiring matches `features.ts` and `main.ts`.**
  * `registerFeatures` merges every feature into `AppModule`, so `Db` (`main.ts:225`) and `PlatformJobs` (`features/platform-jobs.ts`) are resolvable. The real boot and PF-4 part B prove it.
  * The pattern is FO-3's (`runtime-ports.ts`), plus an explicit `inject`.
* **The in-memory mail fake is acceptable as an interim.** It is the same as booking, it names PF-4b as the row that replaces it, and nothing leaves the machine. The breaker's m5 still applies: `REMINDER_SENT` and its audit line say "sent", and the reminder fires only once. PF-4b's row should re-arm the reminders recorded before it arrives.

## Findings
**Blocker:** none. DW2, DW3 and DW8 held on the real app. The breaker's attack on the same three found the same.

**Major**
* **M1. A double submit creates duplicate complaints, and they can never be removed (STANDARDS §4 [M] "Idempotent creates").**
  * Where: `routes.ts:27-28` exposes `ComplaintsService.record` (`complaints.ts:197`), which has no idempotency key and no natural key.
  * Failure: a retried or double-clicked POST from PF-21s, or any client, gives `201,201`. Each copy is a permanent entry in the regulated register (Code s. 24(3)(r)) with its own reminder. DELETE is refused, so the only way out is a false "WITHDRAWN" close.
  * Contrast: retainers refuse a second open draft (`retainers/service.ts:359-360`).
  * This PR makes the gap reachable. The fix needs `complaints.ts`, and maybe a column, which is outside the touch list. So per the brief: a "Question for the tech lead" PR comment. The answer is either a wider touch list (an `Idempotency-Key`, or a client request id that returns the first record) or a dated deferral naming the row that closes it before PF-21s/J-109. A recorded deferral closes M1 for this sha with no code change.

**Minor** (none holds the label)
* m1. Handler change is last-write-wins: no version check or 409. `complaints.ts:317-328`; the history keeps both events (breaker m1).
* m2. The 405 has no `Allow` header (RFC 9110 §15.5.6). `complaints.ts:348`. The fix is in the service or a filter, not here.
* m3. Upper-case paths: `/API/PLATFORM/COMPLAINTS` gets the SPA page (200) or ConfigReadGuard's 403. That is PF-4/core (`core.ts:92`, `main.ts:243`). No data leaks.
* m4. `complaints.ts:16` still says "routes wait for PF-4's @PermissionKeys", which is stale after this PR; outside the touch list.
* m5. A refused caller still takes the row lock before the read check (`complaints.ts:257-258`): contention only.
* m6. A test label typo, "stepss" / "response-sents" (`check_pf21w_routes.ts:168`).

## Journey score (reviewer role; API journeys over HTTP on the real `main.ts`, no screen)
**Journeys:**
* the main W1, as CASE_MANAGER and the CASE_OFFICER handler;
* the wrong role by id (CASE_MANAGER, READ_ONLY);
* the wrong firm;
* no or forged token;
* bad input (array, null and malformed bodies, a stray `firmId` key, `text/plain`);
* two people acknowledging at once: one 200, one 409, and one audit line;
* DELETE.

The audit lines (`complaint.record`, `.acknowledge`, `.reminder`) and the outbox were checked in the database.

| Criterion | Score | Evidence |
|---|---|---|
| Task done | 1 | W1 ends RESOLVED |
| Next step | 1 | 201 returns the record with `reminderScheduled` |
| Plain words | 1 | "No such complaint.", "Complaints are kept" |
| Feedback | 1 | status codes and field errors |
| Correct data | ½ | M1 duplicates |
| Recovery | ½ | a retry duplicates |
| Accessibility and widths | ½ | N/A, no screen (PF-21s) |
| Speed | 1 | 3–44 ms |
| Visual | ½ | N/A, no screen |
| Trust | 1 | Sample labels, audit, events |

**8/10, pass (no 0).** The two N/A halves are mine, since there is no screen. The most valuable fix is M1.

## What I could not check
* CI on this head: every job on d02865694 was skipped (draft).
* `graph.mjs`: it rewrites `qa/GRAPH.md`, which is outside what I may write.
* C10.1.
* A real screen reader, and an intended user's own walk (D17/D20 stay with the founder).
* The journey report lives in this file: the brief allows one file.
* Scratchpad: my `> api.log` truncated the breaker's shared log once, at 09:16. Their run had finished its checks.

**Verdict: Block.** To fix: M1, through a "Question for the tech lead" PR comment, closed by either a wider touch list or the lead's recorded deferral. Nothing else holds the label.

Changes requested

## Round 2 (head 172cc0da5, diff since d02865694 only, P-277)
* **Diff:** three commits. They add `break-report.md`, this `review.md` (identical to round 1) and one label line in `tests/check_pf21w_routes.ts:168`, which closes m6. `routes.ts` and `features/platform-complaints.ts` are unchanged.
* **Suite:** the head's test file, run on a scratch copy, gives 83 passed, 0 failed. The DW3 labels now read "on acknowledge, their own complaint → 200".
* **M1: closed by a dated deferral.** Lead B ruled in PR comment 6892355382 (15 Nov 09:30 UTC), choosing option 1: M1 moves to row PF-21i (records rev 16.24).
  * PF-21i's scope:
    * an `Idempotency-Key` header, required (400 without one);
    * `request_key` with a unique `(firm_id, request_key)`, in its own migration;
    * the same key and body give the first 201; the same key with a different body gives 422;
    * named tests, including two parallel posts.
  * PF-21i is ordered before PF-21s's build and J-109. Until then no screen calls these routes.
  * The PR body opens with the deferral line. The [M] standard stands and has its row; nothing is waived.
* **Minors:** m6 is closed. The rest are unchanged, and Lead B gave each a route:
  * the "sent" mail: demo data only, noted, no row;
  * m3: added to PF-4pc's tests;
  * the body-parser 500s: new row PF-0bp.

No Blocker or Major is open.

Approve 172cc0da5ddad09f3e9188130cf197e38c242f80
