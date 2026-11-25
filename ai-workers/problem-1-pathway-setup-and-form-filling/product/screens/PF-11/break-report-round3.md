# PF-11 part 1: break report, round 3 (diff-only, P-278)

PR #3411 · branch `claude/runtime-pf11-export` · attacked head **b8ed397788405473096dac47a326393300f43fa2** · previous approved head 5efc94a (round 2) · breaker, 25 Nov 2026.

Scope: only what main's merge (0c0f84858, origin/main 63f5cc913) and the re-stamp to `20261125050000_shared__pf11_firm_export` could change. PF-11 code is byte-identical to 5efc94a (`git diff 5efc94a b8ed397 -- firm-export/ ports/firm-export.ts tests/check_pf11_firm_export.ts` is empty).

**Verdict: Changes at b8ed397.** CI job `fast` is red on this exact commit (B1). Commit fd7c3a46c, pushed on the branch after this head, adds the missing scope, and `migration-slots.py mergify --check .mergify.yml` passes at e067c5948. If `fast` goes green at the new head, nothing else here blocks: **Approve** at that head. I did not attack fd7c3a46c or e067c5948 beyond that check.

## How it was tested

The shared checkout had uncommitted edits from another session (service.ts with a sweep job, a new `export.bypass.ts`, ports/firm-export.ts, the test). During this pass its HEAD also moved to e067c5948. So every run used a clean `git archive` of b8ed397 in the scratchpad, with the installed `node_modules` and `.tools` linked in. The isolated copy was started from that tree: `isolated.sh pf11brk 4491 start --ttl 60`, then restarted with `PLATFORM_IDENTITY=local`. It never touched :4400.

## Findings

| # | What I did | Expected | Actual | Severity | Where |
|---|---|---|---|---|---|
| B1 | Ran `check-mergify-scopes.sh`, then the CI log of job `fast` on b8ed397 | Green: SPD-2 (#3035, merged by this merge) wants one `mig-<area>` scope per schema file | **FAIL**: `scope mig-platform-firm-export: not [...]`, `capacities: mig-platform-firm-export is not 1`. Job `fast` concluded `failure` (log 05:05:18Z), so the PR cannot merge. `migration-slots.py check` passes only because the folder is named `shared` | Major (merge-blocking; not a product defect) | `.mergify.yml` (no `mig-platform-firm-export`); new `prisma/schema/platform-firm-export.prisma`. Fixed by fd7c3a46c (+6 lines, `mergify --write`); `.mergify.yml` is Lead-read |
| m1 | Searched for the old stamp after the re-stamp | No reference to `20261124120000_pf11_firm_export` | The schema header still says "Checks in migration 20261124120000_pf11_firm_export" | Minor | `prisma/schema/platform-firm-export.prisma:3` (fd7c3a46c rewords it) |
| m2 | Listed every `firm_id` table added on main since 5efc94a's base (f0ec22b), then compared it with the export | A new platform table is either exported or named as a gap where the Owner reads it | PF-10a's `plat_import_batch`, `plat_import_row` (`before_image` holds a person's values before a merge), `plat_import_mapping` and `plat_import_attestation` are not in the zip. The gap is named only in a code comment ("import reports (PF-10, import-report viewers only)") and is missing from the MODULE row's reads. README.txt's only gap line is about client files, so an Owner reads "Full data download" with no hint that the import history is missing. Nothing leaks: the section list is explicit | Minor | `api/src/platform/firm-export/platform-sections.ts:4-5,15-21,47`; README from a real download |

Not re-raised (the same at the approved 5efc94a, outside this diff): the brief's amendment 6 asks for a "right after its own migration" test. `check_pf11_firm_export.ts:33` applies all migrations instead. The new `fo_dup_review` (fo9b) is a front-office table, so it belongs to part 2.

## What held

* **Migrations, fresh database, stamp order:** all 170 folders applied, none unfinished, the new one last. The only earlier migration naming `agent/firm-data-export` is PF-3's seed (20261114015002), which the DO block checks. No earlier migration depends on the new stamp. Nothing later conflicts: aud3 (20261124170000) inserts into `plat_system_role_permission`, a different table; pf21d switch and erasure touch only `plat_switch*` and `plat_data_request*`. Keys exactly OWNER=request, OWNER and ADMIN=list. RLS on and forced. `prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code` returns 0 (no drift after the platform.prisma conflict resolution). `migration-slots.py check` passes, with and without `--batch`. `shared` is the right area: the migration writes `platform_permission_key`, `platform_role_permission` and its own table.
* **Suites at b8ed397 (scratch DBs):** check_pf11_firm_export 45/0, check_pf3_platform_schema 75/0, check_pf12_walls 110/0, check_pf21d_switch 20/0, check_pf21d_erasure 31/0 (both apply later migrations, PF-11's included), check_aud3_access 49/0, check_pf6b_permission_rules 42/0, check_pf10a_import_schema 82/0.
* **Wrong role or firm, real app with main's guards:**

  | Caller | Ask | List | Download |
  |---|---|---|---|
  | Case Officer | 403 | 403 | |
  | Case Manager | 403 | 403 | 403 |
  | Admin | | 200 | 403 |
  | Other firm's Owner | | sees only `[]` | 404 |
  | No session | | 401 | |
  | Owner whose OWNER grant ended mid-token | 403 | 403 | 403 |
  | Deactivated Owner | 401 | | 401 |

  Upper-case id, a 5,000-character id and `..%2f` all answer 200/404 correctly. Array or text body: 422. 2 MB body: 413.
* **Held or locked firm:** PAYMENT_HOLD gives list 200, download 200 and ask 201 (@HoldOpen still wins after the merge). SECURITY_LOCK, ABANDONED and PROVISIONING give 409 on all three; DELETED gives 401. Exports queued while the firm was locked ended FAILED, "the firm's account is not open for a data download", and nothing was built.
* **Duplicates and concurrency:** 20 parallel POSTs with one operationId gave 1×201, 19×200 and one row. An upper-case uuid followed by its lower-case form gave 201, then 200. 20 parallel distinct operationIds gave 20 rows. Each of 24 builds ran on pg-boss with exactly one job and attempt 1 (single-build claim held). Main's pool changes (P1 idle check, M1 no query after COMMIT, M2 no array `$transaction`) do not trip PF-11, which uses only interactive transactions.
* **25 MB cap:** 3,000 complaints of 4,000 CJK characters (36.0 MB) gave FAILED "too large for one download", with nothing stored. Cut to 2,050 rows (24.6 MB) it gave READY: a 182,813-byte zip with a matching `X-Export-Sha256`, and a 25,206,299-byte complaints.csv that parses as 2,051 rows × 21 columns of intact UTF-8. `request_hash` is dropped as a secret-named column.
* **Expiry, real runner:** with `expires_at` moved into the past and the job's due time set to now, the row went EXPIRED, the zip was deleted (tombstone `.meta` only) and one `platform.firm_export.expired` line was written with `held=false`.
