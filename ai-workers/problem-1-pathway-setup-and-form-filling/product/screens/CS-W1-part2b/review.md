# Review: CS-W1 part 2b (PR #3878, head 207402be591c14c125117892e33a33c2476dff55)

Reviewer role. I did not build this. Scope: this part's own diff, `origin/claude/runtime-csw1-part2...207402be59` (7 files, +158/-20), stacked on #3870 (part 2a, approved). Read against BACKLOG CS-W1 and brief `design/briefs/CS-W1.md` "Part 2" (DW3, DW4, the five firm-identity comparisons, `case-close.ts:71`, "any merged CS-K1/CS-NT1 lookups by key"). Worktree `/home/user/wt-csw1b`. Ports: suites on rvb_* copies (+34000), my own copy `rvbj` on :4436 (runtime lane range). :4400 was not touched.

**Verdict: Ship (Approve).** No Blocker, no Major. Four Minors and one nit below; none lets another firm in or blocks the own firm.

## What I ran (head 207402be59)
* `COPY_PREFIX=rvb bash product/tools/run-suites.sh --only "check_csw1_part2b.ts check_csc1_close.ts check_a24_case_number_api.ts"`: **check_csw1_part2b 14/14 PASS, check_csc1_close 55/0 PASS (includes DW8: firm B's token on firm A's case gets 404 on all four close routes), check_a24_case_number_api 23/23 PASS**, exit 0.
* `node product/tools/typecheck.mjs`: api has 15 known errors and 0 new; web has 0. PASS.
* Reviewer journeys through the API on :4436 (report: `journey-test-reviewer-2026-11-26.md`): 11 of 11 checks held on the main state. On a fixture with no platform account, the 409 path worked through the API (details below).

## The questions asked
1. **Can another firm's staff reach, list, number or close a case? Is the own firm blocked?** No, and no.
   * `reach` (`runtime.ts:184`) compares the case's `firm_id` (NOT NULL) with `firmIdOfActor`. A null id (no firm, or no platform account) never equals a uuid, so the answer is 404.
   * `list` (`:1094`) filters by the platform id, or by a zero uuid when there is none, so nothing is listed.
   * `nextCaseNumber` (`:1066-1070`) reads the firm's own counter row by `firm_id`.
   * `case-close.ts` `locked` and `view` compare `c.firmId !== ctx.firmId`, and still pre-filter on `firm_key = ctx.firmKey`.
   * Activity (`studio.ts:1262`): the review duty still gets the whole feed. Case staff with no firm pass the key "none" (`main.ts:103`), which gives a zero uuid, so they see no case lines.
   * In my walk, user-S got 404 "No such case." and the list, activity and next number left out firm A's case, while the own officer and the client got 200 (J1, J2, J6).
2. **Are all the comparisons the brief names switched?** The five are switched: reach, list, activity, `createCase`'s two idempotency lookups, and the next-number read. So is `case-close.ts:71`, plus its twin at `:108`.
   * Not switched: **CS-NT1's `case-notes/service.ts:129`** (`platformFirm.findUnique({ where: { key: s.firmKey } })`). CS-NT1 is merged, and the brief's code bullet and touch list name this line. See m1.
   * Still on `firm_key`, outside the brief's list (it says "nothing else changes"):
     * pre-filters at `case-close.ts:55,100`, `case-notes/service.ts:126-127`, `case-document-reads.ts:59-61` and `features/case-milestones.ts:45-49`;
     * `createCase`'s advisory lock, `PgCaseCount` and entitlements;
     * `submission.ts:197,228`, `filing-record.ts:55` and `earlier-facts.ts:56`, which are same-firm duplicate scopes.

     These are all equivalent to the id while key and id stay one-to-one, and the data guarantees that:
     * `platform_firm_key_fixed` freezes a platform firm's key (seen on the copy);
     * `case_firm_from_key` refuses an id that is not the key's;
     * `case_firm_fixed` freezes both on the case.

     Not findings. The `firms.json` name, licence and phone reads stay, as the brief says.
3. **The 409 path.**
   * It sits at `runtime.ts:303-304` and `:1066-1067`. It runs after the role check and after `parse`, and before any read or write. The replay lookup now uses the same `firmId`.
   * I checked it through the API. On my copy I renamed sample-solo's `platform_firm.key`, with its guard off for that one statement, and restarted with `PLATFORM_SAMPLE_SEED=off` so the start-up seed would not recreate it.
   * Results: `POST /runtime/cases` as user-S answered 409 "Sample solo practice has no account on the platform yet, so it cannot open a case. Nothing was created." `GET /runtime/next-case-number` answered the same 409. Firm A's case and user-S's own earlier case were both 404. No case was written (sample-solo cases: 1 before, 1 after).
   * The list answered 403 "No firm" from CS-W3's `case-firm-door.ts:93`. That is earlier code, and the state is contrived. Not a finding.
4. **Is the migration safe?**
   * **Re-key on live data.** Part 2a refuses to finish while any row's `firm_id` differs from the lookup of its key (`20261126160000…:42-47`), and a platform firm's key cannot change. So `firm_id` determines `firm_key`, and uniqueness on `(ws, firm_key, x)` implies uniqueness on `(ws, firm_id, x)`. The three `CREATE UNIQUE INDEX` statements and the new counter PK therefore cannot fail on data part 2a accepted.
   * If they ever did fail, Prisma's multi-statement script runs as one implicit transaction, so nothing would be half done.
   * The old index names are dropped. The new names match Prisma's defaults, so `migrate diff` stays empty (PR: check_prisma_schema 8/8).
   * Locks: the PK swap and the index builds take ACCESS EXCLUSIVE / SHARE locks on small tables. That is acceptable here.
   * The rollback order is right: plpgsql does not check an `ON CONFLICT` target when the function is created.
   * **The function** keeps its signature and stays `SECURITY INVOKER`. It resolves the id through the one definer lookup and refuses in words for a key with no platform firm. It writes `firm_id` explicitly, so the from-key trigger accepts the row. Its `ON CONFLICT` matches the new PK, and `CREATE OR REPLACE` keeps its owner and grants. The scratch database showed gap-free numbering per firm, with the firms apart and the counter rows carrying the id.
5. **Test coverage.**
   * DW3 read, list, number and activity, and DW4 on both the database and the API, have pass and fail lines.
   * Removing a rule turns a line red. With the reach check gone, the read returns 200. With the list or activity filter gone, the id shows. A wrong firm in the replay lookup gives a second case or a unique error. Without the re-key, the index names are wrong.
   * DW3 "closing" is covered by check_csc1_close DW8.
   * Gaps: m2 and m3.

## Issues (ranked)
| # | Sev | Must/Should | Where | Issue | Fix |
|---|---|---|---|---|---|
| m1 | Minor | Should | `api/src/case-notes/service.ts:129` | The brief (Part 2 "Code", and its touch list "CS-NT1's `case-notes/service.ts` if merged") says merged CS-NT1 lookups by key read the row's `firmId`. This one still reads `platform_firm` by key. It is safe because it is stricter, but the PR body says the brief's list is done. | Read `s.firmId`: select `firmId` on `case` / `caseClient` (both NOT NULL by now) and compare it with `ctx.firmId`. Or name the line in the PR as left for later, with the reason. |
| m2 | Minor | Should | `runtime.ts:303-304, 1066-1067` | The API 409 is untested. **A fixture is feasible.** Mine was: rename the platform firm's key with `platform_firm_key_fixed` disabled for that statement, then `isolated.sh … restart PLATFORM_SAMPLE_SEED=off`. That gives 409 on both routes. A cheaper option: an in-process call of `Runtime.createCase` / `nextCaseNumber` with a `Db` whose `case_lookup` query returns `{id: null}` for a key not yet cached, asserting 409, the words and no `runtime_case` row. | Add one pass/fail pair (409 with nothing written; the own firm still 201). |
| m3 | Minor | Should | `tests/check_csw1_part2b.ts:64, 66` | The DW3 list line passes on any error answer: `list.status` is reported but not asserted to be 200. The "own sequence" line checks only the number's shape. | Assert `list.status === 200`. For the number, assert that it differs from or follows sample-firm's (the firms apart). |
| m4 | Minor | Should | `runtime.ts:1067` | A **read** (next case number) answers "...cannot open a case. Nothing was created." That is the opening's sentence, and on a read it is misleading. | For example: "…has no account on the platform yet, so it has no case numbers." |
| n1 | Nit | Could | migration `:43` | The custom refusal raises `ERRCODE 23502` (not_null_violation), so a log or error mapper will class it as a NOT NULL break. | `P0001`, or a check-class code, keeping the words. |

## D1-D20 (this is an API and schema part with no screen change; D17 and D20 are simulated only)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4/5 | The five comparisons, close and the four unique rules match the brief. The CS-NT1 line is open (m1). |
| D2 Data integrity | 5 | Uniqueness per platform firm. A double click with the same key made one case (J5). The same key in firm B opened B's own case (J4). |
| D5 Stability | 5 | Replay with the same key works. A different request under the key gets 409 (J3). Numbering under parallel openings is consecutive (suite DW4). |
| D10 Language | 4 | Refusals are in words. The next-number sentence is wrong for a read (m4). |
| D11 Feedback | 5 | 404 "No such case." is unchanged. The 409 says what is wrong and that nothing was written. |
| D15 Speed | 5 | The firm id is cached per process. The list and activity each still run one query, never one per row. |
| D16 Testability | 4 | 14 named lines, plus close DW8 and a24. The 409 is untested and the list status is not asserted (m2, m3). |
| D18 Provenance | 5 | The migration header cites the brief, contract §8, P-559 and P-588, with a rollback. |
| D3, D4, D6-D9, D12-D14, D19 | N/A | No screen, field, rule or AI change. |
| D17, D20 | simulated only | No intended user walked it. |

## BIC-01 to BIC-20 (EXPERIENCE.md §6)
All N/A. The PR changes no case-side screen and nothing visible on the demo, which the PR states and the diff confirms. The walls behind the screens (another firm sees 404) are unchanged in behaviour (J2).

## Could not check
* I did not run the full CI or the other suites the code switch touches (pf19r, csw3, csk1, csnt1, d1, …). The PR says they were running; CI on the head decides.
* The graph step (`graph.mjs`) was not run, because it writes `qa/GRAPH.md` and this check may write only this file and the journey report. No route or page was added.
* I did not re-run the brief's breaker items: odd keys to the lookup, a seed-off copy with both migrations.

Round 1: Reviewer: Approve 207402be591c14c125117892e33a33c2476dff55

## Round 2 (diff 207402be..ebefc4c4; e0e5e17a adds only the round-1 reports; remote head 678fffc1 merges main and touches none of this PR's files)
* m1 closed: `case-notes/service.ts:126-133` finds a case by `firmId: ctx.firmId` and compares the case's `firmId`. A case client still goes by key plus the platform lookup, which is fine because its `firm_id` is not required yet.
* m3 closed: the list line now asserts 200. The other firm's next number must equal that firm's own counter row (`check_csw1_part2b.ts:64-68`).
* m4 closed: "…so it has no case numbers." (`runtime.ts:1067`).
* The nit is closed: the function now raises with code `P0001`.
* Breaker m1:
  * `case-close.ts:55` now locks `firm_id = ctx.firmId::uuid` and `:100` reads by `firmId`. `ctx.firmId` is the session's platform uuid.
  * The csc1s fixture now moves `firm_id` and leaves the key, so its 404 line still tests the new comparison.
* Breaker m2: a `DO $chk$` check runs before any `DROP` / `ADD`. It groups by the new keys `(ws, firm_id, …)` for the three case rules and the counter, and stops with code 23505, naming the rows and the `migrate resolve` step.
* Still open (Minor, listed in the PR): m2, a test of the API 409. It does not block.
* I re-ran on 678fffc1 (the part 2b code is identical to ebefc4c4): check_csw1_part2b 14/14, check_csc1s_view 26/0, check_csnt1_notes 56/0, check_csc1_close 55/0. The typecheck has no new errors.

Reviewer: Approve e0e5e17a449d545daae811e48babb87023ceb75b

Verdict: Approve e0e5e17a449d545daae811e48babb87023ceb75b
