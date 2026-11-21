# FO-9a won: independent review of e6e34790e (PR #2882)

Reviewer: the independent fresh-context Opus reviewer subagent (did not build this). Code reviewed at `e6e34790efe22821453dbd836de38512ea00fc61` (branch `claude/runtime-fo9a-warn`). API-only change, so no screen, no D1-D20 visual scores and no BIC table (nothing visible to walk).

## Verdict: Changes (Ship after fixes)

The read is correct, walled and equal to the check's definer functions. One Major: the stored event's schema depends on two Sample constants that can change, which would make stored `prospect.won` events unreadable. The fix is small.

## What the change does (checked against the requirement)
- Contract v0.1 §4 (`prospect.won`, F6) and the row "Front office (FO-9a)": the duplicate result travels on `prospect.won`. BACKLOG rev 14.1: "no `DuplicateCheckPort`". Met: `duplicates` is optional on `ProspectWonPayload` and is filled on every win by `wonPayload` (`sales/prospects.ts:112`), inside the win's transaction.
- Ids, score and reasons only. The subject is never listed. Warn only, nothing is written. Met (D1, D7).

## Findings

**Major 1: the event's validity depends on mutable Sample constants.** `ports/events.ts:250`: `reasons: z.array(MatchReason)` uses `MatchReason`, whose NAME similarity is `.min(NAME_THRESHOLD)` (`ports/matching.ts:36`), and the list uses `.max(MAX_MATCHES)`. Both are labelled Sample (0.6 and 10). If the founder raises the threshold (for example to 0.7) or lowers the cap, every stored `prospect.won` holding a 0.6-0.7 name match, or more matches than the new cap, fails the strict schema. The consumer reads the stored row with `.parse` in `case-clients/prospect-won.ts:75`, so catch-up never makes that client (it lands in `failed`). It reads it with `safeParse` in `prospect-won.ts:156`, so `offerOf` reports that client's "Open a case?" offer as `WITHDRAWN`. An event payload is a stored contract and must not move with a tuning value.
*Fix:* give the event its own reason schema with fixed bounds: NAME `similarity: z.number().min(0).max(1)`, and a fixed contract cap (a literal such as 50, not `MAX_MATCHES`). Keep the threshold and cap rules in the writer. Add a check that a stored payload with a 0.61 NAME reason still parses when the schema is built with a higher threshold, or simply that the event schema does not import `NAME_THRESHOLD` or `MAX_MATCHES`.

**Minor 1: threshold compared in `real`, while the definer function compares in double.** `duplicates/service.ts:98` (`>= ${NAME_THRESHOLD}::real`), and the company query's `where sim >= ${NAME_THRESHOLD}::real`. The definer's `%` compares the float4 similarity with the double GUC. At 0.6 they agree: float4(0.6) is above 0.6, and my probe matched on every row. At other Sample values they diverge. I ran it: a pair with similarity 0.7 gives `'ann lee' % 'anne lee'` = false at threshold 0.7, but `similarity >= 0.7::real` = true. The JS `personReasons` then drops the reason, but the row has already taken a LIMIT slot.
*Fix:* compare as `similarity(...)::float8 >= ${NAME_THRESHOLD}::float8`, which is the same as the definer function and the JS.

**Minor 2: a failure in a warn-only read now rolls back the win.** `sales/prospects.ts:112` has no savepoint. Any error in `wonDuplicates` (a missing `extensions` grant on some future role, a timeout) aborts Convert, Signed offline and FO-6's e-sign completion. Today both roles work (D8), so the risk is low.
*Fix:* run the read under a savepoint, and on error write `duplicates` absent (the case side already treats absent as unknown). Or keep it and state in the module row that the win depends on the read.

**Minor 3: test gaps (each rule is right by my own probe, but no check fails if it is removed).** `tests/check_fo9a_won_duplicates.ts`:
- No subject has a digit name key (for example 李明), so removing the digit-name exact branch (`service.ts:96-97`) fails nothing.
- `MAX_MATCHES` and strongest-first order are untested.
- The parity check (`:149-159`) covers people only, not companies, and 5 of its 7 subjects have empty results.
- D8's "wrong firm" check (`:143-147`) stops at the subject lookup under row-level security and never reaches the match query's `firm_id` filter. D5 covers that filter under the owner role, which is good enough, but D8's label claims more than it tests.

*Fix:* add two 李明 people (exact match) and 李明华 (no match), 11 matching people (10 returned, EMAIL/PHONE before NAME), and company parity with `fo_sales_company_matches`.

**Minor 4: misplaced doc comment.** `ports/events.ts:241-248`: the `WonDuplicates` JSDoc was inserted between `ProspectWonPayload`'s JSDoc and its `const`. The `ProspectWonPayload` doc now sits on top of `WonDuplicates`, and `ProspectWonPayload` has none in editors.
*Fix:* move the `WonDuplicates` block above line 241.

## The six questions
1. **Same result as the definer functions: yes, at the 0.6 threshold.** I compared the plain query (`service.ts:91-99`) with `fo_sales_person_matches` on a scratch database, as SQL, for 22 people in firm A with twins in firm B. The 22 included two 李明 and a 李明华 (the digit rule), "12 34" twice, null names, empty names, the same email, the same phone, accent folding, and near and far names. 22 of 22 were identical (ids, by_email, by_phone, sim). For 7 companies, `plain` equalled `fo_sales_company_matches`. On the digit rule: when the subject has no digit and the candidate has one, both functions give no NAME match. When the subject's key is empty, sim is 0 in both. A null candidate `name_key` matches only by email or phone in both. The order (email, phone, sim) equals score order, because EMAIL or PHONE scores 100.
2. **Firm wall: holds.** The subject is read with `firmScope`, and the match query filters on `p.firm_id = firmId` and `id <> subject` explicitly. Under the owner role (row-level security bypassed, the same as the bypass role) firm B's twins never appeared, in my probe or in D5. Under the app role, row-level security applies as well (D8).
3. **Risk to the win: low.** I measured 200,000 people in one firm: about 105 ms as the owner, as `xr_staff_bypass` and as `xr_app`. That is the same as the definer function (about 115 ms; it uses no trigram index either). It is a plain SELECT, so it takes no row locks, but it runs while the prospect's row lock is held. The error path is Minor 2.
4. **Ids of records the converter cannot open: acceptable, not a leak today.** No route returns a `module_event` payload to a browser. The timeline selects `id, type, occurredAt` only (`sales/timeline.ts:44`), and the only reader is the case side's code. This matches the check's own `hidden` signal (existence, no names). Condition for FO-8 / CS-K1s: before naming a match, apply the viewer's own access and use the `HIDDEN_LINE` wording for the rest.
5. **Compatibility: additive and optional.** Older events parse (D7). The consumer ignores the field. Future compatibility is Major 1.
6. **Test strength: good for email, phone (two spellings), the threshold (Lena Smith), unreadable phones, the firm wall, never-itself, ids-only and both roles.** Gaps are listed in Minor 3.

Scope note, not a finding: a Corporate win lists similar companies only, not duplicates of its contact people. The contract says "people for a person, companies for a company", so this is as written. The tech lead may want contacts covered when FO-9s or CS-K1s is shaped.

## What I ran (Linux, PostgreSQL 127.0.0.1:54329, own scratch databases only; never :4400 or xr_studio_demo; US$0, live AI off)
| run | result |
|---|---|
| `tsx tests/check_fo9a_won_duplicates.ts` | 19 passed, 0 failed, exit 0 |
| `tsx tests/check_fo13c_conflict.ts` | 46 passed, 0 failed, exit 0 |
| SQL probe, person parity: plain query vs `fo_sales_person_matches`, 22 subjects (scratch database `xr_studio_rev2882_*`, all migrations) | 22/22 identical |
| SQL probe, company parity vs `fo_sales_company_matches`, 7 subjects | 7/7 identical |
| SQL probe, firm B twins | never listed |
| Timing, 200k people in one firm: owner / bypass / app / definer | 113 / 104 / 104 / 115 ms |
| `%` vs `>= ::real` at threshold 0.7 | false vs true (Minor 1) |

Scratch database dropped afterwards.

## Not checked
`check_fo8_prospect_won.ts`, `check_fo2w_won_event.ts` and the other suites the PR lists (not re-run by me). The full CI. `tsc`. `graph.mjs`. FO-6's e-sign path end to end (covered only by reading: it goes through `winProspect` → `wonPayload`). The JS `personNameKey` vs the database's `name_key` (pinned by `check_fo9a_duplicates.ts`, not re-run). Behaviour on a C-ctype cluster beyond what the migration's B2 note says.

## Re-review (round 2): code at 63ffa78209232ac35761aee27ce92cba7b7ba4ba (diff from 19db5123f only, P-277)

**Verdict: Approve.** All round-1 findings are fixed. No new Blocker, Major or Minor.

| Round 1 | Status | Evidence |
|---|---|---|
| Major 1: Sample constants in the event schema | Fixed | `ports/events.ts` no longer imports `matching.ts`. It has its own `WonReason` (NAME similarity 0-1) and `WON_DUPLICATES_MAX = 50`. The writer still applies the live threshold and cap. The new D7 checks show that 12 matches at 0.55 still parse, and that 51 matches or a similarity of 1.2 are refused. |
| Minor 1: threshold compared as `::real` | Fixed | `service.ts:99` and the company query now compare `::float8`, the same as the definer function's `%` and the JS `personReasons`. At 0.6 the result is unchanged (float4(0.6) is above 0.6). |
| Minor 2: a failed read rolls back the win | Fixed | `prospects.ts:115-118`: a savepoint, then release; on error, rollback to the savepoint, then `logPort.error`. In my run, D9 printed one log line with the error name, code P2010 and stack frames only. It has no message and no ids (`safeError`), so it meets "never log record ids". The win goes on with `duplicates` absent, which the contract treats as not known. |
| Minor 3: test gaps | Fixed (one gap remains, a nit) | New checks: a firm-B twin under the bypass role (the query's own firm filter is the wall); 李明 → 李明 and never 李明华; parity with the definer function for 9 people, the digit rule included; company parity with `fo_sales_company_matches`; D9, a forced failure (`extensions.similarity` renamed inside a `finally`, on the suite's own database). Still untested: the `MAX_MATCHES` cap and strongest-first order. This is a nit; the round-1 probe showed the order equals the score. |
| Minor 4: doc comment placement | Fixed for `ProspectWonPayload` | Nit: the FO-9a block and the new "Fixed bounds" block are now two consecutive JSDoc comments above `WON_DUPLICATES_MAX` (`events.ts:240-247`). In editors `WonDuplicates` shows no doc. Merge the two blocks or move one down. Not blocking. |

**Ran:** `tsx tests/check_fo9a_won_duplicates.ts`: 25 passed, 0 failed, exit 0 (own scratch database, dropped by the suite; PostgreSQL :54329; US$0, live AI off).

**Not re-run by me:** fo13c, fo8, fo2w, fo2b, fo2p3, pf12_walls, graph, `tsc` (the builder reports them green). Round 1 already ran fo13c 46/46 on the earlier code; the only change in the win path since is the savepoint.
