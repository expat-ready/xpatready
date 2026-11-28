# Review: FO-9b part 2b follow-ups (R1.29; the round-3 Minors left open on #3527)

**Verdict: Approve** (Ship). No Blocker and no Major. One Minor (a gap left in the m-r3-4 fix) and three Nits, listed below.

**Journey score (reviewer): 8.5 / 10, pass.** Report: `journey-test-reviewer-2026-11-25.md`.

* Reviewer: independent, Opus 5.5. I did not build this change. Date: 25 Nov 2026.
* PR #3710, branch `claude/runtime-r129-2b-followups`, **commit `518fec066eb14b4cef21eeccea7fd5760119edce`**, diff `origin/main...HEAD`: `at-arrival.ts` (+14/-8), `review.ts` (+10/-3), `check_fo9b_auto_merge.ts` (+61/-2).
* Scope: API only, no screen. So there is no BIC scorecard (front office, not case side) and no retrofit mapping. Findings are measured against `FO-9b-2b/review.md` m-r3-1 to m-r3-4 and `break-report.md` R3-m1 to R3-m3.

## Runs (mine, isolated, never :4400)
| Run | Result |
|---|---|
| `check_fo9b_auto_merge` (Postgres 127.0.0.1:54329, own scratch DB) | **38/38**, then 5 more runs, 38/38 each (no flake) |
| `check_fo9b_review` · `check_fo9b_pairs_model` · `check_fo9b_merge` | 82/82 · 24/24 · 88/88 |
| `product/tools/typecheck.mjs` | Only the known worktree errors: `ajv` / `@anthropic-ai/sdk` not resolved in `../p2`, `../contracts` (8 lines, all from that). **No other new type error** |
| `graph.mjs --check` | exit 0 (G1 0, G4 0); the change adds no route or page |
| j_33 on :4436 · j_28 on :4437 | 20/20 · 48/48 (I put back the screenshots the walks overwrote) |
| HTTP walk on :4438 (4 journeys, web form door) | See the journey report; H3 shows the Minor below |

## Each fix: correct and complete?
| Finding | Fixed | Mutation (each run on the suite) |
|---|---|---|
| m-r3-1 / R3-m3, tie order | Yes. `order by r.score desc, pt.created_at, pt.id`, where `pt` is the partner relative to the anchor (`case when r.low_id = anchor then high_id else low_id`, `at-arrival.ts:78`). Correct for both the first queue (anchor = job person) and the follow-up (anchor = survivor) | Old order (`first_seen_at, id`) back: **3 of 4 tie trials red** |
| m-r3-1 / R3-m3, window | Yes. Measured from `jp` = the job's own person (`:105-107`). `jp` is read by id with no `merged_into_id` filter, so it still works after the job person is merged away (rows stay, as tombstones). Probe P4: X 11 min before L stays out; P3: a job that ran late for the oldest person still joins its burst | Window back on the loser (`m.l`): the slide line red (O2 merged) |
| m-r3-2, clause has a fail line | Yes (`:282-290`): a pair stamped after the run's start is not followed | Clause removed: that line red |
| m-r3-2, database clock | Yes. `started` = `clock_timestamp()` (`:83`). Pairs' `first_seen_at` is `now()` of the writing transaction (raw insert, `review.ts:127`, default `now()`), and every merge transaction begins after this read, so the pairs this run writes are always later | `new Date()` back: **still green** (see Nit 2) |
| m-r3-3 / R3-m1, names | Yes. `NAMES` (`review.ts:227`) matches `MERGE_FIELDS.PERSON` spelling (`ports/person-merge.ts:22`); only language and time zone can fill | NAMES check removed: red ("Cher|Attacker"). Only `familyName` kept: green (Nit 3) |
| m-r3-4 / R3-m2, phones | Mostly (`review.ts:215-216`). Two readable: E.164. Otherwise the typed digits. The mixed case (readable on file, unreadable newcomer) is covered | Digits fallback removed: red (u 1, v 1). Fallback only when both unreadable: red (v 1). Raw-string compare: the "same digits" pass line red |

**No new way to merge two people who are not one.** Every merge still goes through `mergeIfSafe` with `arrival: true`; the order and the window only choose which pairs are tried. The new window can admit a partner up to 10 min *before* the job person (when the job person is the survivor), but such a partner's pair is at most as old as the burst, and it meets the same refusals. **No regression** of #3527: NEW_CONTACT (Vera, Ada/Bea/Zed), CONSENT (Cora), CONTACT_CONFLICT on emails, burst m1 (and its "no burst" fail), old pairs m-r3 (O1/O2), Undo m1, "Add as new" m3, the 2 s bound and the shutdown hook all pass, and j_28 W2 / j_33 W5 keep their pairs on To review.

## Findings (ranked)

**m1 (Minor, Should): two different phones with no digits still escape CONTACT_CONFLICT** (`review.ts:216`).
* `digits("ring the bell") === digits("call evenings") === ""`, so `phonesDiffer` is false. `text()` lets a phone with letters and no digit through (`sales/common.ts:21,36`), and it is stored unreadable.
* Steps (HTTP, :4438, web form): Pia sends `pia.h3@example.org` and phone "ring the bell". Pat sends the same email and "call evenings". **Expected:** as with any two different phones on one email, both stay and the pair waits on To review (the fix's own comment, `:214`: "an unreadable phone never escapes the check"). **Actual:** Pat is merged into Pia about 1.7 s later. Also reproduced in a suite probe (live 1, pair MERGED).
* Same severity as m-r3-4: the record on file keeps its phone, and Pat's phone goes to the snapshot only.
* Fix: compare `digits(v) || v.trim().toLowerCase()` (or treat two non-equal typed phones as differing when either has no digit), and add a fail line for it.

**Nit 1: two comments still say the window is measured from the merged-away record**: `at-arrival.ts:13` ("arrived within BURST of it") and `:98` ("who arrived within BURST of it"). Both should say "of the job's person", as `:102` does.

**Nit 2: the database-clock half of m-r3-2 has no fail line.** The test name at `check_fo9b_auto_merge.ts:289` says "(the database's clock)", but putting `new Date()` back keeps it green: the line proves the clause, not the clock. Clock skew is hard to stage; at least drop the claim from the line's name.

**Nit 3: the `givenNames` half of NAMES has no line.** No door writes an empty first name today (`public.ts:118`, `leads.ts:137` require it), so it is defence only; one direct `arrive()` call with an empty first name would cover it.

## D1-D20 (1-5; API evidence, no screen)
* D1 Requirement fit **4**: the four Minors closed, one gap (m1) · D2 Data integrity **4**: fail-safe in every case I tried; m1 keeps the record on file unchanged · D3 Reuse **5**: same `mergeIfSafe`, `MERGE_FIELDS` · D4 Rule integrity **4**: deterministic order, fixed window.
* D5 Security **4**: no new route; firm-scoped joins (`pt`, `jp`, `x` all on `firm_id`) · D6 Concurrency **4**: unchanged locking; `started` from the database.
* D7, D8, D9, D12, D13, D14: N/A (no AI, no screen).
* D10 Language **4**: comments plain; Nit 1 · D11 Feedback **4**: refusals returned and logged as before.
* D15 Speed **4**: posts answer in 23-44 ms; merges land in about 1.7 s; one extra `select clock_timestamp()` per run.
* D16 Testability **4**: 9 new lines; 7 of my 9 mutations red, the 2 green ones are Nit 2 and Nit 3.
* D17, D20 simulated only · D18 Provenance **4**: automatic, by and reason on each merge · D19 not yet (FO-9s parts 2-3).

## What I could not check
* An intended user's walk (D17, D20 stay with the founder); several API instances running jobs at once; real clock skew between app and database.
* The app does not start in this worktree as given (the tracked `prototype/node_modules` link points at `.tools`, which only the main checkout has). For the walks I linked `.tools` to the main checkout's for reading only, and removed the link afterwards. Nothing is committed; the worktree is clean apart from these two files.

Reviewer: Approve 518fec066eb14b4cef21eeccea7fd5760119edce

Verdict: Approve 518fec066eb14b4cef21eeccea7fd5760119edce
