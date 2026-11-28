# PF-11 part 1 (R1.22, the firm's full data export): review round 3 (diff-only, P-277)

PR #3411 · branch `claude/runtime-pf11-export` · reviewed head **b8ed397788405473096dac47a326393300f43fa2** (the PR's head per the REST API) · previous approved head 5efc94aa71d105315a404a82b78b66e2d13fbc99 (round 2, reviewer and breaker) · reviewer, 25 Nov 2026.

Scope: only what changed between 5efc94a and b8ed397. (1) Merge 0c0f84858 of origin/main 63f5cc913. Its one conflict was `prisma/schema/platform.prisma`. (2) HEAD renames `prisma/migrations/20261124120000_pf11_firm_export` to `20261125050000_shared__pf11_firm_export`.

## How it was checked

The shared checkout at /home/user/xpatready had **uncommitted edits from another session** while I worked: branch `claude/runtime-pf11-hygiene`, at b8ed397 plus modified `firm-export/service.ts`, `ports/firm-export.ts`, the test (DW8, part 1b), and a new `export.bypass.ts`. Every run below used a clean `git archive` of b8ed397 in a scratch folder, with the installed `node_modules` linked in. A first run in the shared tree picked up those edits and gave 53/3 (three DW8 failures). Those failures belong to the part 1b work in progress, **not to this commit**. The part 1b builder should know about them (see Notes).

| Check | Result |
|---|---|
| Merge's own contribution: `git diff 63f5cc913 0c0f84858 --stat` vs `git diff f0ec22b9d(merge-base) 5efc94a --stat` | Identical: 15 files, +792/-1. The merge added nothing beyond the branch's own files. |
| Conflict resolution, `platform.prisma` (`git show 0c0f84858 --cc`) | Both slots kept, each in one piece and in its own comment block. `PlatformFirm` has PF-11 `firmExports` and then PF-10a's three `platImport*` lists. `PlatformStaff` has PF-11 `firmExportsRequested` and then PF-10a's three. Against main, the diff adds only PF-11's two lines and their comments. Correct. |
| `npx prisma validate` (studio/) | "The schemas at prisma/schema are valid" |
| SQL byte-identical | `R100`. Blob `1511f02d766c745c4a79edbfb0e1230e20d8a378` at both 5efc94a (old path) and b8ed397 (new path). Only `migration.sql`, as before (the branch never had a `rollback.sql`). |
| `migration-slots.py check origin/main..HEAD` (origin/main = 63f5cc913) | PASS: 1 new migration after main's newest, 20261124170000. `shared` is right: the SQL writes `platform_firm_export` (area platform-firm-export) and `platform_permission_key`/`platform_role_permission` (area platform). |
| Stale references to the old name (`git grep` over every tracked file at HEAD, `sources/ code/ archive/` excluded) | **One:** `prisma/schema/platform-firm-export.prisma:3`, "Checks in migration 20261124120000_pf11_firm_export." (m1). The PR body also still names the old folder (m2). Tests, MODULE cards, row fragments, BACKLOG and the brief have none. The test finds migrations by globbing `^\d{14}_`, not by name. |
| `tests/check_pf11_firm_export.ts` (exact head) | **45 passed, 0 failed**: DW1-DW7 and the contract on fakeFirmExport, exportRegistry, PgFirmExport. Same count as round 2. |
| `check_pf12_walls.ts` | 110 passed, 0 failed |
| `check_pf3_platform_schema.ts` | 75 passed, 0 failed |
| `check_pf6b_permission_rules.ts` (catalogue after main's AUD-3 key rows) | 42 passed, 0 failed |
| `check_features_registry.ts` | 27 passed, 0 failed |
| `check_pf8b_f7_data_walls.ts` / `f4_migrations` / `f8_seeds_nobypass` (they read every migration, so the renamed folder is now last) | 17/17, 9/9, 15/15 |
| `product/tools/typecheck.mjs` | PASS: no new type errors (15 known, 0 fixed; web 0) |

## What came in from main and how it meets PF-11

- **Ports:** `ports/files.ts` and `ports/jobs.ts` did not change. `ports/audit.ts` changed only `OurStaffPlatformEntry`, which became a two-pair union for AUD-3. `SECRET_FIELD` and `AuditEntry`, which PF-11 uses, did not change, and DW7 passes.
- **`firm-scope.ts`:** main added P1 and M1, which destroy a pooled client released inside a transaction and refuse a query after COMMIT. It also added M2: array `$transaction([...])` batches are now refused. PF-11 uses only interactive `$transaction(async tx => …)` (service.ts lines 62, 84, 94, 126, 145; registry.ts line 12), so it is not affected. The tests pass.
- **Migration order:** PF-11's migration now runs after main's AUD-3 and PF-21d erasure migrations, and applying them all from scratch passes. PF-11's seed inserts into `platform_permission_key` and `platform_role_permission`. PF-8b F7's check of seeds into walled tables passes with it last.
- **New firm tables on main:** `plat_import_*` (PF-10a, `platform-import.prisma`), plus changes in `platform-register.prisma` and `front-office-*`. None of them is in `platform-sections.ts`'s TABLES. That matches the gaps part 1 already names ("import reports (PF-10…)", "the front office (part 2)") and the backlog row ("AG-16-34 and AG-16-39 list what the corporate and import parts add"). Not a defect in this diff. Note n1 is for the parts that follow.

## Findings

**Blockers:** none.
**Majors:** none.
**Minors:**
- **m1** `prisma/schema/platform-firm-export.prisma:3` still says `Checks in migration 20261124120000_pf11_firm_export`. Change it to `20261125050000_shared__pf11_firm_export` (it is a comment, so there is no schema effect). This is the only stale reference in the repository.
- **m2** The PR body's **Migration:** line still names `prisma/migrations/20261124120000_pf11_firm_export`. Update it to the new folder.

**Notes (no action in this PR):**
- **n1** Main now has PF-10a's firm-scoped import tables (`plat_import_batch`, `plat_import_mapping`, `plat_import_attestation`). They are firm data, so the import part of PF-11 (AG-16-39) should register them. Part 1 already names this as a gap.
- **n2** For the part 1b builder: the uncommitted DW8 work in the shared checkout fails 3 cases at present. They are "an open download still answers 200 after the change" (401: the session `tR3` was signed in before the fake clock moved 7 days on) and the two hold-sweep cases (`{"expired":1,"deleted":0}` and `{"expired":0,"deleted":1}`). This is not part of b8ed397.

## Journey test

Not run, and no score given. PF-11 part 1 has no screen: it is a route, a job, a port and a migration. The change under review is a merge and a folder rename with no user-facing effect. A browser walk would have nothing to test. The route behaviour is covered by DW1-DW7 above, which all pass at this head.

**Verdict: Approve.** There is no open Blocker or Major, so the `review: approved` label may go on b8ed397788405473096dac47a326393300f43fa2. Fix m1 and m2 when convenient. A comment-only commit for m1 would move the head, and then needs the usual diff-only look.
