# CS-W2 part review, round 4 (diff-only): PR #3831, head b6e7dc37cf522badbaf7fec9e630835b84615b69

Reviewer, fresh context, 27 Nov 2026. Rounds 1-3 approved 14a31867. This round covers only what changed since then that is
not a pure merge of main (P-277, P-303). That is the re-stamped migration, the reworked `tests/check_csw2_review.ts` and
`check_pf21d_fo_eraser.ts`. This part changes only the schema, so D1-D20 and the BIC table do not apply.

## Verdict: Ship (Approve). No Blocker, no Major. Three Minors below, none of them a merge condition.

## What I checked, and how
* **The rename is 100% and the contents are unchanged.** `git diff -M --summary f399dd854 HEAD -- prisma/migrations` shows
  `rename {20261126155300_… => 20261127005100_shared__csw2_review_firm_id}/migration.sql (100%)`. The only other change is
  main's `20261126160000_cases__csw1_firm_required` (new file).
* **Slots and file identity.** `migration-slots.py check origin/main..HEAD` passes ("1 new migration against main's newest
  20261126160000"). `check_pf21d_fo_eraser.ts` is byte-identical to origin/main's. Beyond the merge, origin/main gained
  only records commits (#3869).
* **The PR's diff against main** is unchanged in shape: the migration, three schema files, `check_csw2_review.ts`, a
  one-line regex widening in `check_csw2_filings.ts` and the seven lines in `check_pf12_walls.ts`.
* **The suite on :4494 (`xr_studio_rt_csw2r`) gives 27/27.**
* **Applying the migration after 20261126160000.** The isolated copy recorded both, in order (`_prisma_migrations`:
  `…160000_cases__csw1_firm_required | t`, then `…005100_shared__csw2_review_firm_id | t`). The scratch databases in the
  suite apply every migration before the stamp, 160000 included, then this one, then the rest. The migration never writes
  `runtime_case`, `case_stage` or `firm_case_counter`, so it cannot trip `case_firm_fixed`, the ALWAYS fills or NOT NULL.
  It replaces only c76/c83 guard functions, and 160000 does not touch those. Its backfill reads the case firm, which is now
  always present, so every case-derived review row is filled (`=2/1/0` in all seven tables). The `ON UPDATE RESTRICT`
  keys to `runtime_case(id, firm_id)` now sit behind `case_firm_fixed`. That is redundant but correct, and the suite sets
  the guard aside in a rolled-back transaction so that the key itself answers.
* **Mutation run: does each reworked check still fail without its trigger?** I ran a copy of the suite (part 1 only, from
  the scratchpad) against migration copies with one piece removed each time:

| Mutant (removed from the migration) | Result | Check that caught it |
|---|---|---|
| `case_review_firm_match` trigger | 24/25 | DW5.3 finding's filing (now same-firm case 3, no key on `filing_id`) |
| `case_review_same_case` triggers | 24/25 | DW5.3 breaker M1 (case 3 is case 1's firm, so the keys pass) |
| `case_review_case_fixed` trigger | 24/25 | DW5.3 round 2 M2 item move (`mv[0]` returned "") |
| `case_review_mark_fill` trigger | 23/25 | DW5.4 breaker M2 (backfill) and the by-hand variant (both returned "") |
| filing-side `case_review_firm_follow` | 24/25 | DW5.4 the follow (read before the backfill runs) |
| `SELECT case_review_firm_backfill();` | fails | DW5.1 pass (`0/0/3`) |
| the seven `case_review_firm_keep` | 24/25 | DW5.3 keep |
| runtime_case-side `case_review_firm_follow` | **25/25** | nothing; it is dead now (m2) |

  Every check that was reworked fails when the trigger behind it is removed, so none of them was made vacuous. The one
  exception is the DW5.1 "ghost" line (m1). DW5.1 still has a real fail: scratch B stops the migration on a cross-firm
  round row (`:202`).

## Minors (Should; none blocks the merge)
* **m1. The new DW5.1 fail line proves CS-W1 part 2, not this migration** (`tests/check_csw2_review.ts:81-82`). It passes
  even with the migration's backfill removed (mutant above). Its words "so no review row is left without a firm" are also
  untrue: on the copy, a replica-mode `review_finding` insert returns `firm_id is null = t` (rolled-back probe). Fix:
  relabel it as a precondition, or replace it with a fail that depends on this migration, such as "a filing review under
  a filing with no firm stays empty, never another firm's". This is possible because `filing.firm_id` is still nullable.
* **m2. The case-side follow is dead after 20261126160000** (migration `:22-23` header, `:334-335` trigger). `runtime_case.firm_id`
  is set on insert (ALWAYS fill plus NOT NULL), and `case_firm_fixed` (ALWAYS) refuses any change. The probe got
  "case_firm_fixed: a runtime_case row keeps its firm". The trigger is harmless: it returns early on an equal value and
  never sees a change. But the header still says "a case's firm arriving later fills these rows". The same-case rationale at
  `:14-16` and `:262-265` ("a case whose firm is still empty") is also out of date. The rule is still needed, now for
  same-firm cross-case rows, which no key catches. Fix: correct the words, or drop the runtime_case trigger and its
  rollback line.
* **m3. "NULLABLE until CS-W1 part 2" (`:9`) is now stale.** CS-W1 part 2a has merged and these columns stay nullable. The
  brief (CS-W2 "What to build") asks for `SET NOT NULL` in the same migration. This was accepted as #3811's precedent, and
  filings is still nullable on main, so it is not a behaviour finding. Name the row or step that sets NOT NULL. Related
  point, inherited (#3811 m1, links m5): the review fills are not `ENABLE ALWAYS`, and the case follow can no longer fire.
  A replica-mode insert therefore stays firm-less until someone runs `case_review_firm_backfill()` by hand
  (`api/src/firms.ts:38` calls only `case_firm_backfill`). CS-W1 part 2a closed the same gap for its tables with ALWAYS.
  This is the Lead's call, not a merge condition.

## Journey score (reviewer; journey-test as reviewer role): **9.5/10, pass, no criterion at 0**
Report: `journey-test-reviewer-2026-11-27-round4.md`. The full C8.3 representative-review walk ran in a browser on the
migrated copy: `check_c83_review_browser.cjs 4494`, 23/23. It covered send, the officer's read-only view, open, keyboard
approve with stamps, send back refused without a reason, "Changed while you were reading", re-approve, and solo
self-review. Afterwards there were 0 off-firm rows in all seven tables (2/8/10/30/90/5/0 rows) and 0 fill marks left.

## Could not check
No intended user walked it (D17/D20 not applicable: nothing visible changed). I did not run the wider CI suite. The
graph (`graph.mjs`: G1 0, G2 0, G4 0, G5 0) names nothing for this schema-only item.

Reviewer: Approve b6e7dc37cf522badbaf7fec9e630835b84615b69
