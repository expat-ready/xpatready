# PF-18a part 1 (offices): independent review

**Final head reviewed: `a83577be394ffb5aafeea84d338c689813b2b072`.** Branch `claude/zealous-rubin-lxcmfs`, draft PR #2009.

**Rounds:**
1. Full review on `6ba0a5e`.
2. Re-review of `git diff 6ba0a5e 081df1d` (real keys, as Lead B ruled on #2009).
3. Re-review of `git diff 081df1d 9b1dc85 -- prototype/studio` (P-277: review and break fixes). The records commits in between hold only this folder's files.
4. Re-review of `git diff 9b1dc85 a83577b -- prototype/studio` (breaker round 2, B4). The first-office insert is now wrapped in `zoneGuard` (`service.ts:96-99`): a firm whose stored zone PostgreSQL refuses gets 400 naming the firm setting, not 500. The test makes such a firm and expects 400 with "firm's own time zone"; without the guard it would be 500, so the test bites. I re-ran on a83577b: `check_pf18a_offices` 85/0, check-port-contracts 0 problems. Note only: that 400's `issues` line says `timeZone:`, a field the caller did not send; the detail is right.

**Scope:**
* Code size: 790+/4− against `main` (records excluded), under P-610's 800.
* The brief is `design/lead-b-briefs/PF-18a.md`, part 1 only. Requirements: AG-1-74, AG-16-68, AG-16-59 (trace tool).
* API and schema only, no screen. The screen-review UI checks, the BIC scorecard (case-side screens only) and D8-D14 are N/A.
* Journey test: `journey-test-reviewer-2026-11-16.md`. Breaker: `break-report.md`.

**Re-run by me on 9b1dc85** (checkout clean at that SHA, Postgres :54329, never :4400):
* `check_pf18a_offices` **85/0**, `check_pf0p_ports` 113/0, `check_pf12_walls` 100/0, `check_pf3_platform_schema` 75/0.
* `check-port-contracts`: OfficeClockPort ×2, 0 problems.
* Isolated copy `rv18b` on :4433 (PATCH semantics probes below), then stopped.
* Earlier rounds: 71/0 on 6ba0a5e and on 081df1d, journeys on copy `rv18a`.
* On 081df1d, on a scratch database: deleting a staff member or firm that an office row names is refused (RESTRICT).

## Done when (part 1 share)
| Line | Result | Evidence |
|---|---|---|
| DW1 | Met | Alberta gets `America/Edmonton` (`timeZoneFrom: province`); the zone can be changed and saved, audited before/after. `America/Toronto `, `Mountain`, `america/toronto`, `42`, `""`, `null` and `US/Pacific-New` each get 400 "Choose a time zone from the list". No province, or abroad, gets the firm's zone. `ZZ` gets 400. |
| DW2 | Met | One implicit office with no `timeZone` key until a second exists; with none, the port gives the firm's zone, hours and closed days. The first add writes the first office from the firm's settings in one transaction; a 409 rolls it back. |
| DW3 | Met | A new office's closed days start `[]` although the firm has one. Office B's day closes neither A nor the firm (route test and contract). |
| DW4 | Met | Firm B's PATCH, port read and staff placement get 404 / OfficeNotFound. Case Officer and Case Manager writes get 403. PF-12 walls on both tables. OfficeClock refuses under another firm's scope, never the defaults (B3). |
| DW7 | Met | Contract on the real adapter and the fake, now including "a firm that never saved → defaults"; a broken adapter fails it; check-port-contracts green. The stamp is unique and later than every migration before it. **The demo-copy check runs right after its own migration and before the rest** (`tests/check_pf18a_offices.ts:89-92`, rows rev 16.7). |

## Design choices asked to judge
1. **Triggers instead of keys:** not accepted on 6ba0a5e; fixed on 081df1d. Real keys `platform_office.firm_id → platform_firm` and `(firm_id, staff_id) → platform_staff(firm_id, id)`, RESTRICT. One line under `// back-relation slot: offices (PF-18a)` in each model. The write-check triggers are gone. A test now fails if RESTRICT is removed (m5).
2. **Staff→office by service method only:** accepted. It is audited, firm-scoped and tested. Lead B put `PUT /api/platform/staff/:staffId/office` on PF-18s; the PR body should say so.
3. **No province stored abroad:** accepted. A province sent for an office abroad is now a 400, not dropped (m3).

## Findings: status at 9b1dc85
**Major (both closed)**
* **M1 (closed on 081df1d).** On 6ba0a5e, firm and staff integrity held only on insert. Failing case: `delete from platform_staff` for a placed person gave `DELETE 1` and left an orphan row. Now refused by RESTRICT, and tested (`check_pf18a_offices`, "review m5" case).
* **M2 (closed on 9b1dc85).** On 6ba0a5e and 081df1d, the demo-copy check ran after every later migration (`x >= NEW`). Now it applies `NEW`, checks, then applies `x > NEW` (lines 89-92).

**Minor: earlier ones, all closed on 9b1dc85**
* **m1 closed.** Change takes the firm's advisory lock (`service.ts:125`), and there is a case-blind unique index `platform_office_firm_name_ci` (migration). The parallel `Twin`/`twin` test now gives 200 + 409, and the database refuses `CALGARY` beside `Calgary`.
* **m2 closed.** The lock plus a required `version`: a stale or missing one gets 409 with `current` (`service.ts:128`, STANDARDS §4). The parallel zone test writes one audit line with the true "from".
* **m3 closed.** A province abroad gets 400 (`service.ts:43`). A change that changes nothing writes nothing and audits nothing (`service.ts:133-135`).
* **m4 closed.** New contract case: a firm that never saved its settings gets the settings' defaults, on both adapters.
* **m5 closed.** "A staff member with an office, or a firm with offices, cannot be deleted; one with no office can."

**Minor: new on 9b1dc85 (none blocks)**
* **m6. PATCH changing only `country` away from Canada on an office that has a province gets 400** ("A province or territory is for an office in Canada… leave it empty"), although the caller sent no province.
  * Where: `service.ts:130`, which carries `before.province` into `provinceOf`.
  * Failing case (copy `rv18b`): Calgary AB, PATCH `{version, country: "US"}` → 400. `{…, country: "US", province: null}` → 200.
  * Nothing wrong is stored and the words say what to do. Fix (optional): when the country leaves CA and no province is sent, clear it, or word the issue as "clear the province too".
* **m7. `version` is `updated_at` to the millisecond** (`service.ts:53`, `:128`). Two committed changes to one office in the same millisecond would share a version, and a client holding the first would not get its 409. This is unlikely under the firm lock and with one person per screen; a counter column would close it. Note only.
* **Note.** The country rule `X[A-Z]` also refuses `XK` (Kosovo), which `Intl` names (`service.ts:26`). Out of scope, recorded only.

## Breaker items in this diff (`break-report.md`), checked
* **B2.** Version → 409, tested.
* **B3.** OfficeClock outside the firm's scope throws (`clock.ts:14-19`), tested.
* **B4.** A zone PostgreSQL refuses gets 400 through `zoneGuard`, tested: `US/Pacific-New` on add and change.
* **B5.** JSON-path checks on hours and closed days, plus a zone-shape check, tested (`Factory` refused).
* **B6.** NFC, invisible and direction characters refused, length counted in code points, tested.
* **B7.** `ZZ`, `QQ` and user-assigned codes refused, tested.
* **B9.** `REVOKE UPDATE` then a column `GRANT` on `platform_staff_office` to `xr_data`; `staff_id` cannot be updated as `xr_app`, tested.

## Checked and holding
* Firm walls.
* Advisory lock on add and change: two parallel adds give 3 rows and 1 `is_first`; a partial unique index holds one first office.
* Zone checked alike in code and database. Hours and closed days use the firm settings' schemas.
* Same-case duplicates get 409. Every write is audited in its transaction.
* The module card is updated.
* The `zone1970.tab` quotes match tzdata 2026e, and our choices are labelled.
* `ports/` uses zod only; no case-side or `engine/` import.

## D scores (/5; N/A: no screen)
| D | Score | Evidence |
|---|---|---|
| D1 | 5 | Every part-1 rule has a behaviour and a pass and fail test; DW1-DW4 and DW7 met |
| D2 | 5 | Real RESTRICT keys; case-blind unique names; stale changes get 409; column rights |
| D3 | 5 | Reuses the firm settings' schemas, `firmScope`, `AuditPort`, the problem shape |
| D4 | 5 | The pre-fill resolves for all 13 codes; there is no unreachable state |
| D5 | 5 | Double POST gives 201 + 409; a failed first add rolls back; parallel changes give 200 + 409 |
| D6 | 5 | Who, when and the true before/after; a no-op writes nothing |
| D7 | N/A | No AI |
| D8-D14 | N/A | No screen (PF-18s) |
| D15 | 5 | 7-73 ms per call; one query per list |
| D16 | 5 | 85 cases, pass and fail per line; contract on both adapters; re-run by me on the exact SHA |
| D17, D20 | simulated only | No intended user; stays with the founder |
| D18 | 5 | `timeZoneFrom` says province, firm or chosen; tzdata cited with release and date |
| D19 | N/A | Part 1 of a runtime row; callers come in part 2 and PF-18s |

**Journey score: 7 of 8 applicable criteria (8.75/10), Pass, no criterion at 0** (scored on 6ba0a5e). On 9b1dc85 the data and feedback findings behind its two ½ scores are closed, except m6.

**Could not check:** a browser walk, axe, widths (no screen); the real callers of OfficeClockPort (part 2, case side); CI on the PR (draft, guard only). Before the label, the builder pastes the suites of the shard that shares the demo database, run on `main` merged in (brief, rows rev 16).

No Blocker or Major is open. m6 and m7 are optional.

Verdict: Approve a83577be394ffb5aafeea84d338c689813b2b072
