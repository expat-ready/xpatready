# PF-17 part 2 (R1.93): review round 3, 2026-11-24

Reviewer: a fresh reviewer, not the builder. Scope: only the diff since the round 2 Approve (58c79b84a; records added after it in 9dd41ea85), up to 98e5fc19c6db38f70682da387a5b24857cdb4c84 on `claude/runtime-pf17-support` (PR #3225). The PR's base is now `main`, after part 1 (#3155) merged as 0033a9737. Two commits:

1. 70a5abb53: origin/main merged in once (parents 9dd41ea85 and 0033a9737).
2. 98e5fc19c: the migration re-stamped from 20261123060000 to 20261124030000 (Lead B 4's stamp, Lead 16's instruction).

Not counted as a finding: there are no route declarations. Lead 16 ruled that #3209 declares them later. No journey score this round, because the caller asked for none; round 1's journey report still stands.

## What I checked and how

### 1. The merge (70a5abb53)

* **No hand change.** `git show --remerge-diff 70a5abb53` and `git show --cc 70a5abb53` are both empty. The committed result is exactly git's automatic merge: no conflict and no edit on top.
* **The tree is main plus this PR's own files.** `git diff --name-status 0033a9737 98e5fc19c` lists only the PR's 16 paths:
  * the records under `screens/PF-17-1` and `screens/PF-17-2`;
  * the two MODULE rows;
  * `features/platform-system-support.ts`;
  * `system-console/support{,-routes,.bypass}.ts`;
  * `support/support.ts`;
  * the migration;
  * `check_pf17_support.ts` and `check_pf4s_system_signin.ts`.

  Every other file matches main byte for byte. origin/main is still 0033a9737.
* **What main brought in since the old base.** The base was 98dccb3e2, the merge-base of 9dd41ea85 and 0033a9737. Main brought 73 files, and none of them is a file this PR depends on. Each of these has a zero-line diff from 98dccb3e2 to 0033a9737:
  * `platform/firm-scope.ts` (asBypass, touchFirm, touchPlatform, BYPASS_USES);
  * `platform/audit/audit-event.ts` (AUD-3a/3c);
  * `platform/system-identity/guard.ts` (the system guard);
  * `platform/identity/guard.ts`;
  * `platform/support/support.ts`.

  Main changed nothing under `prisma/`: no new migration, and no change to `plat_system_role_permission` or its CHECKs (`plat_system_role_permission_system_key`, `pf4s_system_identity/migration.sql:115`; the FK at :104). The platform files main did change are the PF-18n2 notification labels (`platform/notifications/{labels,routes,store}.ts`). The PR's support code never reaches notifications (grep: no match).
* **`replyAsSupport` was not combined silently.** `git log 98dccb3e2..0033a9737 -- api/src/platform/support/support.ts` is empty, so main never touched PF-18b's file. `git diff 0033a9737 98e5fc19c` on that file is exactly the round 2 change in `support.ts:221-236`: the doc comment, `actor = "system:support"` at :225, the guard at :226, and `actor` passed to `audit.record`. Nothing else in the file differs.
* **Other suites that read the permission table** (`check_pf21b_holds.ts:229`, `check_pf21b_requests.ts:108`, `check_pf21c_breaches.ts:135-136`, `:370`) each filter by their own key, so six more support rows cannot change their counts. `check_pf4s_system_signin.ts:301` compares every seeded key with its APPENDIX_A list, which already carries the two support keys. It passes (below).

### 2. The re-stamp (98e5fc19c)

* **A pure rename.** `git show -M --name-status 98e5fc19c` gives `R100 …/20261123060000_pf17_support_keys/migration.sql → …/20261124030000_pf17_support_keys/migration.sql`, at 100% similarity. Only two other lines change:
  * `tests/check_pf17_support.ts:41`: `MIGRATION = "20261124030000_pf17_support_keys"`;
  * `product/screens/PF-17-2/build-notes.md:10`: the new folder name, with "re-stamped from 20261123060000 on 24 Nov, Lead B 4 and Lead 16".
* **Later than every migration on main.** `ls prisma/migrations | sort | tail` gives `… 20261123150000_csd7_document_flags`, `20261123200000_pf21b_data_requests`, `20261123210000_pf21c_breaches`, `20261124030000_pf17_support_keys`. Main's own newest (`git ls-tree 0033a9737`) is `20261123210000_pf21c_breaches`, which sorts earlier than 20261124030000.
* **No code still names the old stamp.** `git grep 20261123060000 98e5fc19c -- . ':!*.md'` finds nothing. The only Markdown hits are:
  * build-notes.md:10, the intended note of the re-stamp;
  * two earlier review records (`review.md:36`, `review-round2-2026-11-24.md:40`). These are records and keep their facts (P-188), so they are not findings.
* **The seed applies in sorted order on a fresh database.** `check_pf17_support.ts:42-50` does the following:
  1. drops the database and creates it again;
  2. applies every `^\d{14}_` folder in sorted order with `ON_ERROR_STOP=1`;
  3. counts `plat_system_role_permission` right before and right after its own folder.

  DW8 (`:83-88`) then requires `afterOurs = beforeOurs + 6` and the exact role mapping. If the constant went stale, `beforeOurs` and `afterOurs` would stay `""` (0 = 6 fails) and `readFileSync(join(MIG, MIGRATION, …))` (:86) would throw. So the suite also guards against a stale constant. Both DW8 lines PASS.

### 3. The suites, run here

All run from the worktree's `prototype/`, against postgres 18 on 127.0.0.1:54329. Port 4400 was not used.

| Suite | Result |
|---|---|
| `check_pf17_support.ts`, run 1 | 29 passed, 0 failed (exit 0) |
| `check_pf17_support.ts`, run 2 | 29 passed, 0 failed (exit 0) |
| `check_aud3c_platform_line.ts` | 16 passed, 0 failed (exit 0) |
| `check_pf4s_system_signin.ts` | 104/104 passed, 0 FAIL lines (exit 0) |

These match the builder's numbers.

## Findings

### Blocker

None.

### Major

None.

### Minor

None.

### Note (no action asked)

* The seed's INSERT (`20261124030000_pf17_support_keys/migration.sql:27-30`) has no `ON CONFLICT`. A local scratch database where someone already applied this branch's old 20261123060000 folder through `prisma migrate` would fail on the primary key under the new stamp. Only a builder's own local database could be in that state: the old stamp never reached main or the demo. Dropping that database is enough, and the rename is still the right call. This matches PF-8b F7's shape and the other seeds (pf21b, pf21c), which do the same.

Verdict: Approve on 98e5fc19c6db38f70682da387a5b24857cdb4c84
