# PF-18a part 1 (offices): independent review

Commit `6ba0a5e69690229b8749bbe05713cd6cf7e7e838`, branch `claude/zealous-rubin-lxcmfs`, draft PR #2009 (12 files, 792+/4−, under P-610's 800 lines). The brief is `design/lead-b-briefs/PF-18a.md` on `main`, part 1 only. Requirements: AG-1-74, AG-16-68, AG-16-59 from the trace tool. API and schema only, no screen: the screen-review UI checks, the BIC scorecard (case-side screens only) and D8-D14 are N/A. The journey test is in `journey-test-reviewer-2026-11-16.md`.

**Re-run by me on this commit:**
* `tsx --tsconfig api/tsconfig.json tests/check_pf18a_offices.ts`: **71 passed, 0 failed** (24.7 s, Postgres :54329).
* `node tools/check-port-contracts.mjs`: 14 ports, OfficeClockPort ×2, **0 problems**.
* Isolated copy `rv18a` on :4433: API journeys and break pass, then stopped.
* The branch merges into `origin/main` (f7dde02c8) without conflict. The stamp `20261116190000` is later than main's newest migration (`20261116030000`).

The working tree holds the builder's uncommitted switch to real keys (made after Lead B's ruling). I did not review it; this verdict is for 6ba0a5e only.

## Done when (part 1 share)
| Line | Result | Evidence |
|---|---|---|
| DW1 | Met | Alberta gets `America/Edmonton` (201, `timeZoneFrom: province`). The zone can be changed and saved, and is audited before/after. `America/Toronto `, `Mountain`, `america/toronto`, `42`, `""` and `null` each get 400 "Choose a time zone from the list". No province, or abroad, gets the firm's zone. A code not on the list gets 400. The DB trigger refuses names `pg_timezone_names` does not know exactly. All 418 Intl zones are known to PG. |
| DW2 | Met | One implicit office with no `timeZone` key until a second is added. With none added, the port gives the firm's zone, hours and closed days. The first add writes the first office from the firm's settings in the same transaction (AG-1-74 §7); a later 409 rolls it back. |
| DW3 | Met | A new office's closed days start `[]` although the firm has a closed day. Office B's day closes neither A nor the firm (test, contract). |
| DW4 | Met | Firm B's PATCH, port read and staff placement all give 404 / OfficeNotFound. Case Officer and Case Manager POST/PATCH get 403. PF-12 policies and the firm gate are on both tables, and the walls cases pass as `xr_app`. |
| DW7 | **Partly** | Contract met: it runs on the real adapter and the fake, a broken adapter fails it, and check-port-contracts is green. The stamp check is correct. **Not met: rev 16.7's "measure right after its own migration"** (M2). |

## Design choices asked to judge
1. **Triggers instead of keys: not accepted.** On delete they hold nothing (M1). Lead B, the row owner, ruled real keys plus a `// back-relation slot: offices (PF-18a)` line, in this PR (#2009, 16:19Z).
2. **Staff→office by service method only: accepted.** The brief lists only `/offices`. The method is audited and firm-scoped (404 across firms) and tested by direct call. Lead B accepted it and put `PUT /api/platform/staff/:staffId/office` on PF-18s. The PR body should say so.
3. **No province stored abroad: accepted as a data rule.** The DB check enforces it, and AG-1-74 §12 needs only "abroad → firm zone". But the given value is dropped silently (m3).

## Findings
**Major**
* **M1. Firm and staff integrity holds only on insert.** `migration.sql:40-73` (`platform_office_write`, `platform_staff_office_write`). The triggers check that the firm and the staff member exist when a row is written. A later delete of the parent is not blocked.
  * Failing case, run on the isolated copy inside a rolled-back transaction: put a staff member in "Calgary HQ" (insert a `platform_staff_office` row), then `delete from platform_staff where id = <them>` → `DELETE 1`, and 1 orphan row remains. `OfficeClockPort.officeOfStaff` would still answer an office for a person who does not exist. The same applies to `platform_firm` (no key).
  * The precedent is FO-1b, FO-13 and PF-21: RESTRICT keys, with tests "a named staff member cannot be deleted".
  * Fix, as ruled: composite keys `(firm_id) → platform_firm` and `(firm_id, staff_id) → platform_staff(firm_id, id)`, RESTRICT, plus slot and back-relation lines in `platform.prisma`. Drop the write-check triggers. Add a fail test: a staff member or firm with an office row cannot be deleted. Add a pass test: one without such a row can.
* **M2. The migration test is not "parallel world" (DW7, rows rev 16.7).** `tests/check_pf18a_offices.ts:90-91` applies this migration *and every later one* (`x >= NEW`), then checks that the demo rows are unchanged.
  * Failing case: any later migration that writes a row in `audit_event`, `platform_firm_setting`, `platform_staff`, `platform_firm` or `runtime_case`. Once this PR merges, its suite goes red on main and on later PRs. That is exactly the PF-25 incident rev 16.7 was written for.
  * Fix: apply `NEW` only, run the line-91/92 checks, then apply the rest.

**Minor**
* **m1. Case-insensitive name uniqueness does not hold under a race.**
  * Where: `service.ts:126` (PATCH checks without the firm lock) and `migration.sql:20` (`(firm_id, name)` is case-sensitive).
  * Failing case: parallel PATCH of two offices to `Twin<i>` and `twin<i>` → both 200 in 10 of 10 runs.
  * Fix: a unique index on `(firm_id, lower(name))`, or take the same advisory lock in `change()`.
* **m2. The audit "before" is wrong under parallel PATCHes.**
  * Where: `service.ts:121` reads without `FOR UPDATE`, then lines 134-135 record "from" from that read.
  * Failing case: two zone PATCHes at once on Vancouver → two lines "from America/Vancouver", one of them false. AG-1-74 §9 requires before/after.
  * `writeSetting` shares this pattern. Fix: lock the row (`SELECT … FOR UPDATE`, or the firm advisory lock) before reading `before`.
* **m3. Silent drops and a misleading audit summary.**
  * Where: `service.ts:41`, `service.ts:124`.
  * Failing case 1: PATCH `{province: "BC"}` on a US office → 200, `province: null`, no field error. The same happens on POST with `{country: "US", province: "AB"}`.
  * Failing case 2: PATCH `{}` → an audit line "Office changed" for no change, where `writeSetting` writes "saved unchanged".
  * Fix: a 400 field issue (or an explicit `issues` note), and "saved unchanged" when before equals after.
* **m4. The fake's own copy of the firm defaults can drift.** `ports/offices.ts:43` `FIRM_DEFAULTS` copies `settings.ts`'s defaults, and no contract case covers "a firm that never saved its settings". Fix: add that contract case, comparing the real adapter's defaults with the fake's.

## Checked and holding
* Firm walls: `firmScope` on every query; PF-12 policy, gate trigger and `xr_wall_reader` functions.
* First-office materialisation runs under an advisory lock: two parallel adds give 3 rows and 1 `is_first`. A unique partial index holds one first office.
* Zone validation is the same in the code (`TIME_ZONE.schema`) and the DB. Hours and closed days use the firm settings' own zod schemas.
* PATCH: province and country are kept when absent; changing the province does not re-pre-fill the zone (AG-1-74: the pre-fill is on add); uppercase ids are accepted.
* Same-case duplicates get 409 (P2002). Every write is audited in its transaction.
* The module card: purpose, entry points, invariant, tables and tests are all updated.
* The pack's `zone1970.tab` quotes match tzdata 2026e on this machine, and our choices are labelled.
* No case-side or `engine/` import; `ports/` uses zod only.

## D scores (/5; N/A: no screen)
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | Every part-1 rule has a behaviour and a test; DW7 is partly met (M2) |
| D2 | 3 | No key on firm/staff (M1); the case-insensitive name rule fails under a race (m1) |
| D3 | 5 | Reuses the firm settings' schemas, `firmScope`, `AuditPort`, the problem shape |
| D4 | 5 | The pre-fill resolves for all 13 codes; there is no unreachable state |
| D5 | 5 | Double POST gives 201 + 409; a failed first add rolls back |
| D6 | 4 | Who and when on every change; the audit "from" can be stale (m2) |
| D7 | N/A | No AI |
| D8-D14 | N/A | No screen (PF-18s) |
| D15 | 5 | 7-73 ms per call; one query per list |
| D16 | 4 | Pass and fail per DW line; contract on both adapters; the M2 ordering is fragile; re-run by me |
| D17, D20 | simulated only | No intended user; stays with the founder |
| D18 | 5 | `timeZoneFrom` says province, firm or chosen; tzdata cited with release and date |
| D19 | N/A | Part 1 of a runtime row; callers come in part 2 and PF-18s |

**Journey score: 7 of 8 applicable (8.75/10), Pass.**

**Could not check:** a browser walk, axe, widths (no screen); the real callers of OfficeClockPort (part 2, case side); CI on the PR (draft, guard only).

**Fix list:** M1 (real keys, as Lead B ruled), M2 (measure right after the migration). The Minors are recommended in the same push.

Verdict: Changes requested
