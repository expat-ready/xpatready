# CS-C1b break report (PR #2002, head 41afe0364, branch claude/runtime-csc1b)

Breaker (P-278: permissions, plan limits). API only. Isolated copy `csc1b_brk` on :4592 (database `xr_studio_csc1b_brk`, configured checkpoint, both Sample firms seeded); stopped and removed afterwards. Openings went through an in-process app on that database with a test `EntitlementPort` bound by `runtime.useEntitlements(...)`, the same harness as `tests/check_csc1_count.ts`. Count fixtures were SQL cases moved by CS-C1a's `CaseClose`. Scratch scripts are in `/tmp/claude-0/brk/brk{1..5}.mts`. No model calls (US$0). Nothing fixed, nothing committed.

## Findings

**M1 Major: an idempotent retry at the limit is refused with "Nothing was created" even though its case was created.**
Steps: firm A has N−1 active cases and the limit is N. Send 6 `POST /runtime/cases` in parallel, all with the same body and `idempotencyKey: "brk-…"`.
Expected (STANDARDS §4, as without a limit): one 201 `created:true`, and the other five return the same case with `created:false`.
Actual: one 201, then five 409 `PLAN_LIMIT_REACHED` saying "…so this case was not opened. Nothing was created." Only one case id exists.
Control: the same 6 requests on a free plan give one 201 and five replays (`created:false`).
Mixed run (3 requests with key K plus 3 with no key, at N−1): `K409 K201 K409 -409 -409 -409`, so the K retries are told nothing was made.
Why: `replay()` runs before the transaction (`api/src/runtime.ts:263`). The second replay only runs on a unique-key clash (`runtime.ts:333`). Under the new lock (`runtime.ts:302`) a waiting retry counts the winner's case first, so the limit check refuses it before its insert can clash.
This is the client's "lost answer, retry" path. The client is told something false and may open the case again under a new key.
(A retry sent after the first commits does work: 201 `created:false`.)

**M2 Major: the count gets slower as the event outbox grows, and openings then fail with 500.**
`case-count.ts:34` runs `max(e.occurred_at) from module_event e where e.subject_id = … and e.type = …` once for each active filing. `module_event` has no index on `subject_id`, only `(firm_id, seq)`, and the read covers every firm's events. The table is insert-only: its trigger refuses DELETE ("module events are never changed or removed"), so it only ever grows. The count runs inside the per-firm lock, so every opening for that firm waits behind it.
Measured with about 355 firm-A cases, 356 filings and 197 decisions:

| Extra outbox rows | `activeCounts()` | 3 parallel openings |
|---|---|---|
| none | 2–7 ms | — |
| 60k | 2.9 s | all 201, 8.3 s in total |
| 300k | 10.5 s | **one 201, two 500** ("Internal server error"), after 20 s |

The 500s are from the 15 s transaction timeout (`runtime.ts:331`).
With the sample data it is well inside budget (STANDARDS §9), so judge the severity. No migration is allowed in this row, so the fix may need a question for the tech lead.

**M3 Major: multi-stage cases are counted wrongly, because the count reads every active filing of every stage.**
`case-count.ts:30-33` uses "every active filing has a DECISION", with no stage filter. Starting the next stage (`case-stages.ts:214`) ends the old stage but leaves its filings active.
(a) Stage 1's filing is decided (count goes from 326 to 325). The officer starts stage 2, which has no filing until Prepare. The count stays at 325, so a case that is actively working stage 2 does not count: the firm is under-counted and can open past its limit. `CaseClose.close` also accepted that case.
(b) Stage 1 ends with an unrecorded filing, which `case-stages.ts` allows when a reason is given. Stage 2's filing is recorded and decided, but the count stays at 326.
The stage-1 filing can never be decided (409 `NOT_SUBMITTED`). Close then returns 409 `NOT_DECIDED` and withdrawal 409 `HAS_DECISION`, so the case counts forever and the firm loses that slot for good.
This follows the brief's wording ("every active filing") but not SA-3-47 ("until its decision"). The stage rule needs a ruling; this belongs in `challenge.md`.

**m1 Minor: a decision can be ignored because of timestamp order.**
`d.recorded_at` defaults to `now()` (the transaction's start). It is compared with the reopen event's `occurred_at` (`case-count.ts:34`). A decide transaction can begin before a reopen and record after it commits.
I simulated this: a transaction runs `select now()`, then the reopen commits, then the transaction inserts the DECISION. The decision's `recorded_at` is 11:25:23.177 and the reopen's 11:25:23.496. The count rose from 333 to 334, so the case still counts although its only filing was decided after the reopen. It stays that way until another decision. The window is narrow (from BEGIN to the `FOR UPDATE`).

**m2 Minor (judge it): the case group is read live from the configuration, not from what the case opened on.**
Moving the Visitor visa program under a CORPORATE Pathway (a configuration edit) moved every existing firm-A case at once: `{individual 335, corporate 0}` became `{individual 8, corporate 327}`. Putting it back restored the numbers.
One configuration change can push a firm over its corporate limit for cases already open. This follows the brief ("the same read as CS-C1a"), but the pinned release would be the stable source.

**m3 Minor: the `EntitlementPort` signature is not PF-15's.**
The BACKLOG row PF-15 says `check(firm, metric)`, with usage read by the adapter "through the case side's case-count read port". `ports/entitlement.ts:21` adds `used?`, and `firm` is the firm key, not the platform firm id.
The only thing keeping two parallel openings from both passing (P-588 (3)) is the caller's in-transaction `used`. If PF-15's real adapter reads usage itself on another connection, the DW11 race comes back. The brief asked for "exact name and signature", so this needs saying in the PR or in `challenge.md`.

## Attempts that held
* **DW11 under load.** With N−1 active and limit N, I sent 10, 25, 50, 100 and 200 parallel openings. Each time exactly one 201 and the rest 409 `PLAN_LIMIT_REACHED` (metric `active_individual_cases`, limit, used = N). Each burst added exactly 1 case, 1 party and 1 to the counter. No 500 (200 openings in 2.2 s).
* **Several free places.** With a limit of used+5 and 30 parallel openings: exactly five 201s. Firm-A numbers ran C-2026-00001 to 00011 with no gap.
* **Free plan.** 100 and 200 parallel openings: all 201 (3.4 s and 5.7 s).
* **Replays.** A replay sent after the case is created, while the firm is full, gets 201 `created:false` with the same case. The same key with a different body while full gets 409 key-reuse.
* **DW12 through the API.** With firm A full and firm B (`user-S`, `sample-solo`) at N−1, 10+10 parallel openings: firm A all 409; firm B one 201 and nine 409. Firm A's count was unchanged and firm B's went from 0 to 1. The new case has `firm_key = sample-solo`. The port was asked about each firm under its own key. Adding `firmKey`, `firm` or `firm_key` to the body is ignored: the opening is still checked and refused against firm A.
* **Corporate pathway.** With the individual limit at 0 and corporate at N−1, 5 parallel openings on a CORPORATE Pathway gave one 201 and four 409, all on the `active_corporate_cases` metric. An individual opening while individual is full gets 409.
* **Withdraw racing an opening at N** (5 runs): never over the limit.
* **Reopen racing an opening at N−1:** 2 of 5 runs ended at N+1. This is not a finding: reopen has no limit check by the brief, and doing it in sequence gives the same N+1.
* **Wrong actors.** `user-P` (client) and `user-A` (configuration) get 403. An unknown actor, an empty actor and `USER-O` get 401.
* **Malformed `combinationId`.** Not a uuid, `""`, 10,000 characters, SQL text, `null`, `42` or an array all get 400. The nil uuid gets 404. Broken JSON gets 400. No 500.
* **Count rules.** Reopen-then-decide, a correction (a second DECISION row), withdrawn and closed cases, and a case with one of two filings decided all behave as DW9 and DW14 name them.
