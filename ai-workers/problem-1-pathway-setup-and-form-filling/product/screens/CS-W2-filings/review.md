# Review: CS-W2 part `filings` (PR #3811, head 9d0b3417ececa13becaf9c94fa20315a2a6aa132)

Reviewer (Opus, fresh context, did not build it), 26 Nov 2026. Scope: BACKLOG row CS-W2 (R1.3), brief `design/briefs/CS-W2.md`
part 1, contract v0.1 §8 steps 2 and 2a and conditions 1 and 3, CS-W1's `case_firm_fill`. This is a schema-only part with no screen,
so D1–D20 and the BIC table do not apply (nothing visible changes). The journey score is in `journey-test-reviewer-2026-11-26.md`: **7/10 (below the bar), held back by M1.**
Ran on an isolated copy `rt_rev` on :4498 (the caller's port; never :4400) and scratch databases on 127.0.0.1:54329. No code edited.

**Note:** at 07:12 UTC, partway through this review, someone else's *uncommitted* edits showed up in this same checkout
(`migration.sql`, `check_csw2_filings.ts`, `fixtures/csw3/csw3-spike-walls.sql`; they appear to answer the breaker's M1 and m2).
This review covers only 9d0b3417. All evidence below comes from runs made before those edits, or from databases migrated before them. Push the fix and
I will review only that diff.

## What I ran (all on 9d0b3417)
| Check | Result |
|---|---|
| `tsx tests/check_csw2_filings.ts 4498 xr_studio_rt_rev` | 21/21, exit 0 |
| `node product/tools/typecheck.mjs` (after `prisma generate`) | api 15 known errors, 0 new; web 0. The six back-relations on `cases.prisma` break no TypeScript |
| `prisma validate`; `tests/check_prisma_schema.ts` (M: `migrate diff --exit-code`) | valid; 8/8, **0 differences** |
| `tests/check_csw1_firm_id.ts` | 47/47 |
| `check_c617_stages_migration.ts` · `check_csc1_count.ts` · `check_qa329_filing_change_order.ts` | 23/23 · 40/40 · 7/7 |
| `check_c69_runs.ts` · `check_d1_reset_to_six.ts`, on a **fresh** copy | 94/94 · 25/25 |
| API-made rows on the fresh copy (c69, qa329, W1) | 1 group, 4 filings, 4 applicants, 20 items, 46 assessments, 2 overrides, 2 reviews, 6 filing changes: 0 mismatched, 0 null |

The c69 and d1 suites failed (90/94, 13/25) only when run after other suites on the same copy. The server log shows the cause:
CS-W1's `case_firm_backfill()` fails at commit with `case_stage_current: the case's combination is its current stage's`. CS-W1's
own update of `case_stage` fires the deferred `trg_case_stage_current`; this PR's follow never touches `case_stage`. That is on main
already, not this PR: one for the Lead (below).

## Judgement on the asked points
* **Backfill order:** correct. Parents go first; the three same-file children fill from their parent; the backfill runs before the fill
  triggers and keys exist; a second run gives 0. The pre-key `DO $chk$` stops with the PR's own words when both parents carry a firm (see m5 in the break report).
* **Follow trigger:** sound. Order inside the case follow is group, filing, item, so each key finds its parent already filled; no loop.
  It can only write the parent's firm, because the composite keys check it. P15 confirms this.
* **Composite keys and ON UPDATE RESTRICT:** all 12 refuse a cross-firm parent on insert and on a plain update (the suite, plus my probes P17 and P1–P9).
  A case's firm cannot move while children name it. `ON DELETE RESTRICT` on filing → group copies the existing key. Case delete
  still cascades (P16). The only firm-owned parents left out are `case_stage` (two keys), and the PR says so, for part `keys`.
* **Guard exceptions:** I could not use them to change anything but an empty firm (P10, P11), nor to fill a wrong firm.
  Every filled value is checked by a composite key: null → firm B under an A case is refused (P1, P3, P4, P8, P9); null → any firm under a ghost case is refused (P5–P7, P12).
  The one hole is jsonb number equality (break report m2): narrow, and reachable only through M1 or m1.
* **SECURITY INVOKER / search_path:** the three new functions are INVOKER with `search_path` pinned and `pg_temp` last. The backfill is revoked from PUBLIC. See m-R1.
* **Deviations:** (1) **Nullable `firm_id`:** acceptable while `runtime_case.firm_id` is nullable, *but only with M1 fixed*. With MATCH SIMPLE keys, a null firm switches every key off.
  (2) **Five guards edited:** acceptable. The bodies are unchanged apart from the one line before them, and the exception is needed for the backfill and the follow.
* **Test quality:** good overall, with a pass and a fail for most rules. Gaps: M1 has no fail case, and the minors below.

## Blockers
None.

## Majors
**M1. Setting `firm_id` back to null switches off every composite key, so a firm A row can be moved under a firm B parent in one statement.**
I reproduced the breaker's M1 on 9d0b3417 as `xr_app`:
`update filing_applicant set firm_id = null, filing_id = '<firm B filing>' …` gives UPDATE 1; the same with `filing_item` gives UPDATE 1.
The control (the move without `firm_id = null`) is refused by `filing_item_filing_id_firm_id_fkey`.
Affected tables: `filing_applicant`, `assessment_override` and `assessment_review` always; `submission_group`, `filing` and `filing_item` while their stage is current.
This breaks contract §8 step 2a ("a child cannot point at another firm's row") and makes DW1.3's claim untrue.
**Fix:** a `case_filings_*` BEFORE UPDATE trigger on the nine tables that refuses `firm_id` going from a value to null (or to another value). Add a DW1.3 fail case for each kind of parent (case, filing, assessment), plus a pass showing the backfill and follow still work.

## Minors (fix or list in the PR)
* **m-R1** The five rewritten guards (`assessment_frozen`, `c613_no_update`, `filing_form_addition_mark_only`, `runtime_stage_row_current`,
  `runtime_stage_row_via_filing`) now call `case_filings_firm_fill_only` unqualified, with no pinned `search_path`. A function
  earlier on a caller's path would replace the exception. Pin `SET search_path = pg_catalog, public, pg_temp` or qualify the call (`public.`).
* **m-R2** The stage-guard exception already covers ten tables of later parts (`checklist_line`, `review_finding`, `case_task`, `sign_step`,
  `entered_section`, `signed_scan`, `filing_person_record`, `readiness_pass`, `filing_review`, `filing_record_correction`; the last four
  have no `case_id`). It becomes live on each one as soon as that table gets `firm_id`. Say in the PR, and in the "keys"/later-part lists, that every one of
  them needs its composite key and M1's null guard in the same migration that adds the column.
* **m-R3** The test's "case's firm cannot move" check accepts any error matching `/foreign key|violates|case_firm|refused/`. Assert the
  constraint name and `RESTRICT`.
* **m-R4** W1 only opens and prepares a case. The brief asks for "open a case, add a filing, fill a form". Assessment, filing change and form addition are not
  driven through the API here (c69 and qa329 cover them on the copy, 0 mismatches above, but the PR's own W1 does not).
* **m-R5** DW1.4's "earlier migrations still apply to a copy of the demo data" is replaced by synthetic scratch data plus `check_prisma_schema`.
  My fresh-copy d1 run (25/25) covers loading the six; say this in the PR.
* **m-R6** `case_filings_firm_backfill()` under-counts once the follow triggers exist: 18 returned for 27 filled, because the follow fills applicants and override/review. Either drop the comment that it "returns the number of rows filled" or count after the follow.
* From the break report (agreed): m1 (race leaves a permanent null), m2 (jsonb numeric equality in `fill_only`; compare text), m4 (one
  cross-firm ghost row fails CS-W1's backfill for every case), m5 (the pre-key check skips a one-side-empty parent), m6 (the header and rollback name a
  follow trigger on `submission_group` that does not exist), m7 (an explicit null bypasses the session firm). m3 belongs to CS-W1 part 2.

## For the Lead (not this PR)
CS-W1's `case_firm_backfill()` can fail at commit for every case if any one case's combination is not its current stage's. The cause is
the deferred `trg_case_stage_current` on its `case_stage` update. This was seen on a copy polluted by earlier suites. The demo reset logs `case_firm_fill_failed` without the
message (P2010; `rule` empty), so it is hard to see.

## Could not check
CI on the head (still running when this review was written). A browser walk (nothing visible changes). The migration on a copy of the real demo database (:4400 is off-limits).

Verdict: Changes 9d0b3417ececa13becaf9c94fa20315a2a6aa132
