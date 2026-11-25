# R1.60 part a1: independent review, round 7 (PR #3681, diff only: the re-stamp)

Head reviewed: `874ce4ce11289575a5b783ad42ecc0467d556947` (`claude/runtime-r160-a1`; the PR's head on GitHub matches). Last approved head: `703c3bdccc43798f9461b747de6d9bd752828e88`. Scope, as the Lead allowed in PR comment 7159934752: a diff-only review of the re-stamp in 874ce4ce1 (the rename and three name updates). Main's own changes are left out. API only: journeys, D8-D14, BIC, 1024 px, 200 % zoom and keyboard are N/A for this round. The journey score from round 2 (`journey-test-reviewer-a1-r2-2026-11-25.md`, 8.75/10) still stands because no behaviour changed. No new journey test was run.

**Verdict: Approve.** There is no Blocker and no Major. One Minor (m1, the PR body) does not block.

## What changed since 703c3bdcc
- `0026d32fd` merges main at `b5d86b807` (it brings #3654's `20261125140000_client-money__fo7w1_invoice_from_retainer`). The merge is clean and was not edited by hand: `git merge-tree --write-tree 703c3bdcc b5d86b807` gives `d28ab0344…`, the same tree as `0026d32fd^{tree}`.
- `874ce4ce1` (its only parent is `0026d32fd`) changes 4 files, +4 −4: the folder rename, and the new name in `rollback.sql` (2 comment lines), `MODULE.rows/R1-60-a1.md` and the test.

## Checks
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `migration.sql` is byte-identical | Pass | `703c3bdcc:…/20261125060000_…/migration.sql` and `874ce4ce1:…/20261125150000_…/migration.sql` are both blob `36227c3de2d6…`, with 100 % similarity in the rename. |
| 1 | `rollback.sql` differs only in its own name | Pass | Blob `9c547a627…` became `d3be0f12d…`. The old file with `20261125060000` replaced by `20261125150000` diffs empty against the new file. The only changes are comment lines `rollback.sql:1` (header) and `rollback.sql:7` (the hand-run `DELETE FROM _prisma_migrations … migration_name = '20261125150000_…'`), which needs the new name. |
| 2 | Every reference updated | Pass in code. m1 in the PR body | `git grep 20261125060000 874ce4ce1 -- prototype/studio` finds nothing, and neither does a repo-wide grep outside `product/screens/R1.60/`. The new name is in `api/src/client-money/MODULE.rows/R1-60-a1.md:2` and `tests/check_r160_deposit_prepare.ts:279`. The old review records (`review-a1.md:49,57`, `review-a1-r2.md:23,39`) keep their history, which is correct. `prisma/migrations/` at the head has no `20261125060000` folder, and the new folder sorts after `20261125140000_…fo7w1…`. |
| 3 | `migration-slots.py check origin/main..874ce4ce1` | Pass | `PASS  migration slots: 1 new migration(s) against main's newest 20261125140000 (20261125150000_client-money__r160_trust_request_prepared)`. Main has since moved to `3bac02a79`, but it added no migrations (only `acceptance/lib/browser.ts` and `tests/check_os73_vitals_browser.ts` changed), so the slot is still free. |
| 4 | Nothing else from the PR changed | Pass | The PR's net patch before the re-stamp (`git diff 72f35388d 703c3bdcc`, with the old name replaced by the new) matches the patch after it (`git diff b5d86b807 874ce4ce1`): 21 files, +996 −8 in both. The only differences are hunk offsets and context lines from main's changes in `front-office/retainers/service.ts` (QA-770 context after the PR's `retainerSigned` block), `front-office/signing/service.ts` and `prisma/schema/client-money.prisma`, plus the four old review records, which keep the old name. The PR's added lines are unchanged. |

## What I ran
I ran these in a detached scratch worktree at `874ce4ce1`, from its studio folder, against Postgres on 127.0.0.1:54329 (started with `pg_ctl`). I used scratch databases only (none left behind) and never :4400. I removed the worktree afterwards.
- `npx tsx --tsconfig api/tsconfig.json tests/check_r160_deposit_prepare.ts`: **47 passed, 0 failed**. This includes the M1 rollback-then-forward cases through the renamed folder's `rollback.sql`.
- `tests/check_pf8b_f4_migrations.ts`: **9/9 passed**.
- `tests/check_fo7ts_money_settings.ts`: **157 passed, 0 failed**.

## Findings
| # | Severity | Where | Finding | Fix |
|---|---|---|---|---|
| m1 | Minor | PR #3681 body, line 3 | The body still says "Migration: `20261125060000_client-money__r160_trust_request_prepared`". The migration is now `20261125150000_…`. This is the same kind of slip as round 1's m8. It does not affect the code or CI. | Change the PR body's migration name to `20261125150000_client-money__r160_trust_request_prepared`. |

**Verdict: Approve** for head `874ce4ce11289575a5b783ad42ecc0467d556947`. No Blocker and no Major. m1 is optional before merge.
