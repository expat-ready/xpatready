# Review: AUD-1c part 2 (R1.97, map row 97): the chain checker, its alert, heartbeat and integrity reads (round 1)

Reviewer (Opus 5.5, independent; did not build it). Head `7d86eb32f00c18814a67abd9865132a45390c5a6` (branch `claude/runtime-aud1c-verify`), diff against `origin/claude/runtime-aud1c-chain` (part 1, #2129): six files, +372.
Not a screen: concept fit, keyboard/zoom, D1-D20, BIC-01..20 and the journey score are N/A. Graph tool not run (it writes GRAPH.md; this review writes only this file).

**Verdict: Block** (Rework of one query and the anchor rule; the rest is close).

## Runs (this head, in /home/user/wt-p2)
* `check_aud1c_verify.ts`: 17 passed, 0 failed. `check_pf0p_ports.ts`: 127 passed, 0 failed. `check-port-contracts.mjs`: 33 ports, 0 problems, exit 0.
* `check_pf23_observability.ts` on isolated copy `aud1c2rv` :4624 (`--ttl 60`, stopped after): 100/100 passed.
* Own probe (scratch database, not committed): the verifier on chains of 10+ lines, page 500 and page 3, tail truncation, a deep pass after truncation, two runners at once, a 100,000-line chain.

## Blocker
1. **Every chain of 10 or more lines is reported broken (a false gap at seq 2).** `verify.ts:42` selects `seq::text seq`; `verify.ts:85` then says `order by seq`, and PostgreSQL resolves a bare ORDER BY name to the output column first, so lines sort as text ("1","10","11","2"...). Shown: `select seq::text seq from (select generate_series(1,12) seq) t order by seq` gives 1,10,11,12,2. Probe: two 10-line chains both `BROKEN f=2 t=10` with `why: "gap"` on the first pass, one alert each; a 100,000-line chain read 12 lines and stopped on a false finding. On the demo database every firm chain over 9 lines would raise `audit_chain_break` at the first 30-minute run. The suite misses it because every test chain has under 10 lines and the default page (`check_aud1c_verify.ts:87,93`). **Fix:** `order by audit_event.seq` (or alias the text column `s`); add a case with a chain over 10 lines and `page: 3` (across a page edge), which fails on this head. With that one-word change my probe verified 100,065 lines with no finding at page 500 (1.0 s) and page 3 (12.3 s).

## Major
1. **A removed tail is cleared at the next pass, or never found at all; the anchor is dropped.** `found()` keeps `verified_seq`/`verified_hash` (`verify.ts:105-107`), but the full pass and the BROKEN re-read (`verify.ts:77`, decision 2) never look at them, and `verify.ts:96-99` then writes INTACT with a lower `verified_seq`. Probe, with the ORDER BY fixed: (a) newest 3 lines of a 10-line chain removed as the owner: the 30-minute run reports `missing 10..10` and alerts; the next run reads 1..7, finds nothing and writes `INTACT v=7`, so the integrity read says INTACT after an unresolved incident (BR-2). (b) newest 2 lines removed, then the weekly pass runs before any 30-minute run (03:40 between :30 and :00): `INTACT v=8`, no alert ever (SA-11-4 "removing any entry"). Line 95 covers only a chain emptied whole. The comment at `verify.ts:75-76` ("the break stays until the chain verifies whole") is not what the code does for `missing`/`verified-changed`. **Fix:** in every mode, when the check row has `verified_seq > 0`, the scan must reach that seq with `entry_hash = verified_hash` (else a finding), and `verified_seq` never goes down on a non-sample chain; add DW6 cases (a) and (b), a pass and a fail each.

## Minor
1. Truncation range: `verify.ts:81` reports `at..at`; the removed lines are `head+1..at` (probe: lines 8-10 removed, reported 10..10). SA-11-6 asks for the sequence range.
2. One chain's failure ends the pass: no per-chain catch (`verify.ts:57-61`), so a 120 s timeout or a lock wait behind a second runner leaves every later chain unchecked (correctly, no heartbeat). Measured about 100,000 lines/s locally, so the 120 s limit is about 10 million lines per chain: fine for the MVP; say it in the card.
3. The test checks DW9 on `fakeAlerts`, not on the alert line the brief names; one LogAlerts line check would cover `alertLine` (`metrics.ts:95`, which does write `fromSeq`/`toSeq`).
4. `GET /api/system/audit/integrity` and `POST /api/demo/audit-chain/check` have no test (401/403/404 outside the demo, the `cross_tenant.access` line, ids only). The app did start with them (the access-lines start-up check accepted `@ReadsAcrossFirms`).
5. On the demo, a Sample firm's lines are all on `sample:<workspace>` (part 1's key rule), so that firm's integrity read answers `NOT_CHECKED` / `verifiedSeq 0` forever. That is a correct wall but a confusing answer: say so in the card or the PR body.
6. Nothing raises the heartbeat-absence alarm yet. `deploy/cdk/lib/observability.ts` (PF-23c, metric filters, not EMF) has no absence alarm and no filter on `event: "audit_chain_verify"`. Not this row's touch list; it is a follow-up for the Lead (SA-11-6).

## Checked and sound
* Gaps (`seq !== last+1`, from seq 1 in full mode), link, hash recomputed by `canonical.ts`, never trusting the column.
* Concurrency: per-chain `pg_advisory_xact_lock(hashtextextended(...))` is in the int8 lock space, so it never meets the trigger's two-int lock. Two full passes at once in the probe: no error, one consistent row. The check row is read after the lock, in READ COMMITTED.
* BigInt and bytea: `seq`/`at`/`detail` read as text; bigint and Buffer parameters bind; `Number()` only for the alert.
* Repeat rule: an alert only when a new `failing_from_seq` appears (PF-23's 5-minute key also includes the chain).
* Firm walls: `forFirm(staffOf(r).firmId)`; the union query has only the session's key; no firm id from the request; DW7 holds.
* No line content: the alert carries rule, firmId, entity, entityKey (the chain), fromSeq, toSeq; the answers and the pass log line carry ids, seqs and counts only.
* Heartbeat after the loop only; a failed pass throws first (DW10). `AlertDetail` gained two optional positive ints, contracts green.

## The builder's decisions
1. Keeping `audit_chain_break`: agreed to ask, not rename silently. The rename now also reaches `deploy/cdk/lib/observability.ts:25,44` (the alarm's filter), `register/breaches/service.ts:53,157` and three tests, all outside the touch list. The Lead's answer should be in the PR before the label.
2. BROKEN re-read from 1: acceptable only with the anchor kept (Major 1).
3. A `sample:` chain re-read from 1 (P-571): acceptable for Sample lines. It would be tighter to accept only when seq 1 is a `chain.restarted` line by `system`.
4. Demo-only check route: acceptable (404 outside the demo, the author duty, ids only). Untested (Minor 4).
5. `@ReadsAcrossFirms` on the system route: correct (it reads every firm's chain status).

## Could not check
The PR body (contract-change notice P-584, the Lead question), full CI, `check_pf14_jobs`/reset/case suites, the module-cards PR check.

## Round 2 (diff-only, 7a9690d4)
Scope: `git diff 7d86eb32 7a9690d4 -- ':!*.md'` (verify.ts, check_aud1c_verify.ts). Not a screen: journey score N/A, as in round 1.
**Runs:** suite at the head 20 passed, 0 failed. Old verify.ts against the new test (scratch copy): 9 passed, 11 failed. Single-fix reverts on the new code: ORDER BY reverted gives 10 failed (the 25-line case among them); the old anchor rule gives 5 failed (the tail case among them); the old at..at range fails the tail case only; dropping the key filter fails the M3 case only. `tsc` (tsconfig.check): no errors in the touched files. Probe on a scratch database (page 3, not committed).
**Round 1 findings:**
* Blocker (text order): fixed (`order by audit_event.seq`). Pinned by a 25-line chain in both modes.
* Major (anchor): fixed. On every pass, a non-sample chain's verified place must still exist with its hash. `found()` keeps verified_seq/hash, so a removal or a re-chained rewrite stays BROKEN (probe: a forged whole chain stays BROKEN after 3 more passes). The weekly pass finds a removed tail. verified_seq never goes down.
* Major (M3): fixed. A key that is no chain's shape is skipped with no key in the line. Every other chain is still checked and alerted, then the pass throws with no heartbeat (probe: 2 bad rows, firm chain alerted, 0 heartbeats). A per-chain catch now also covers round 1 m2 (a timeout on one chain).
* Minor (range): fixed for a removed tail (10..12).
**The fix's own behaviour:**
* BROKEN for good: holds for `missing` and `verified-changed`. A changed line below the verified place that is later put back exactly verifies whole and is written INTACT (probe: BROKEN 4..12, then INTACT v=12). The comment at verify.ts:86 ("no run turns it back to INTACT") overstates this. See m2.
* Bad key: as required (skip, check the others, throw, no heartbeat).
* sample: path: kept separate and unchanged (P-571). A sample tail removal re-verifies silently (v=4) and a sample hash change is found by the weekly pass. Accepted in round 1.
**New Minors (none blocks):**
1. Inverted range: when the verified line alone is removed and later lines remain, the result is `missing 13..8` (verify.ts:93, head+1 > at). Use `min(head+1, at)`, or the highest seq below `at`, plus 1.
2. Restore clears: see above. Either keep BROKEN until a deliberate reset, or state the rule in the comment and the card (a Lead decision, not new scope).
3. Drift after re-appends: after a tail removal, new lines reuse seq 10 onward. Each pass then moves the range (10..12, 11..12, 12..12, 12..13) and raises a new alert each time fromSeq changes: 3 pages for one incident, and the row loses 10..12. Keeping the earliest fromSeq while BROKEN would fix both.
4. `raise()` wrapper (verify.ts:131-135): a failed raise commits BROKEN as raised, so the alert is never retried. The heartbeat is still written, and nothing alarms on `alert_not_raised`. No test pins it (removing it keeps 20/20). The per-chain catch alone would roll back and retry. With LogAlerts and the key filter, a failed raise is unlikely.
5. A bad check row stops every heartbeat until someone deletes it. `all()` (the system read) lists it as a chain. The error line does not say which row. Say how to find it in the card.
**Could not check:** CI and the PR body (still owed from round 1: the Lead's answer on `audit_chain_break`, P-584 notice).
**Verdict: Approve** (no open Blocker or Major; Minors 1-5 for the builder or a follow-up).
