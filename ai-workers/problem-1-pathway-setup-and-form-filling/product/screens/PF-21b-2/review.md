# PF-21b part 2 review: the legal-hold register over LegalHoldPort (reviewer, 22 Nov 2026)

Reviewed head **78861110ae7926c0d6cea7289112503c9012eae6** (branch `claude/runtime-pf21b-holds`), only `git diff HEAD~1 HEAD` (9 files, +794). HEAD~1 is #2927 (PF-4s part 1), which has its own review. Spec: brief `track-b/PF-21b-2.md` (098153d17), parent `lead-b-briefs/PF-21b.md` "Part 2", `ports/legal-hold.ts`, its contract, AUD-5 `keep-period/service.ts`, PF-12 walls, `MODULE.md`, WAY-OF-WORKING "Every PR".

**Left out (screen-only):** concept fit, the keyboard/1024 px/200 % walk, PRODUCT §3-§4 words, D1-D20, the BIC table, retrofit mapping. This row has no screen or concept (PF-21rs builds the screens). Checked instead: the migration, definer security, the lock rule, error answers, whether the tests can fail, the four departures, and CI guards that read this diff.

**Runs (this container, Postgres 18 on :54329):**
- `check_pf21b_holds.ts`: 47 passed, 0 failed, exit 0, twice (24.8 s each).
- Passed unchanged (exit 0): `check_pf21b_port`, `check_aud5_check`, `check_aud5_keep_periods`, `check_pf21i_idempotent`, `check_pf12_walls`, `check_pf12b_bypass_audit`, `check_pf4s_system_signin` (with its one new row), `check_features_registry`, `check_pf6b_permission_rules`.
- `check-port-contracts.mjs`: 0 problems, `LegalHoldPort ×2`. `graph.mjs --check`: G1 0, G2 0. `count-any`: 416 = base. `route-has-screen`: 0 with neither.
- **Red because of this commit:** `check_pf8b_f4_migrations.ts` (B1) and the static sweep `check_aud_values.ts` (M1).
- **Red, not this commit:** `check_pf21_complaints.ts` 107/108. Its FK list now includes `plat_system_*_fkey:rc`, which come from #2927's tables, not from this diff. #2927 must fix it before this branch's CI can go green.
- `check_pf28_inputs`: not run (it needs an isolated copy on :4487).
- API walk: an isolated copy on :4431 (runtime ports), stopped afterwards. Scratch databases dropped. No repo file changed except this review and the journey report.

## Findings

### Blocker
**B1. The migration fails on RDS, and CI fails with it.** `migration.sql:129` and the `DO $own$` block (`:191-200`) hand six functions to xr_wall_reader. There is no `GRANT CREATE ON SCHEMA public TO xr_wall_reader` before them and no `REVOKE` after.
- PF-8b F4 (`20261121230000_pf8b_f4_reader_create`) revoked that CREATE. Its header says: "A later migration that hands xr_wall_reader a function in public on RDS grants CREATE first and revokes it after." On a non-superuser migration role, `ALTER FUNCTION … OWNER TO xr_wall_reader` fails without it, so `migrate deploy` stops at this migration.
- `tests/check_pf8b_f4_migrations.ts` fails: "every migration after F4 that hands xr_wall_reader a function grants it CREATE … : ["20261122070000_pf21b_legal_holds"]".
- Locally xr_studio is a superuser, which is why the row's own suite passes.
- *Fix:* add `GRANT CREATE ON SCHEMA public TO xr_wall_reader;` before line 129 and `REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;` after the `DO $own$` block, as in `fo6_signing_tables:371/382`.

### Major
**M1. The audit lines have no `before`/`after` (QA-594, SA-11-2), and the static sweep fails.** `service.ts:105` and `:124` write `detail` only.
- `check_aud_values.ts` lists both lines: "(no before)". It passes on the base and fails with this change; it is a merge-batch sweep.
- In the walk, the firm's Activity log showed `changes: []` for every hold line.
- The release line's summary does not say which hold or scope was released.
- The reason is cut to 200 characters in `detail`, while P-687 asks for values in full.
- *Fix:* placed: `before: null, after: { scope, target, reason }`. Released: `before: { active: true }, after: { active: false, releaseReason }`. Then drop the `.slice(0, 200)`.

**M2. A list capped at 500 rows hides active holds, and a successful release can answer 404.** `migration.sql:188` returns at most 500 rows, newest first. `service.ts:86` applies `state` after that cap.
- Default view: with no firm filter (all firms, the Platform Owner's register), any active hold older than the newest 500 holds is left out of `state=active`. The response gives no sign that rows are missing.
- After a release, `one()` (`service.ts:138-141`) looks the hold up in that capped list. When the firm has more than 500 holds, the release commits and writes its audit line, but the caller gets 404 "No such legal hold" (a false failure). The breaker reports the same issue as M1.
- *Fix:* filter `state` in SQL (a `p_state` argument). Read one hold by id with its own definer, or have `plat_legal_hold_release` return the row. Add a `next` cursor or a `truncated: true` flag.

**M3. A date range given as dates protects less than it says.** The route accepts `{"from":"2026-01-01","to":"2026-03-31"}`. In the walk it stored `to` as `2026-03-31T00:00:00Z`, so a record dated 31 March 10:00 is not held. With `from` = `to` the hold protects only one instant.
- §3.5 says "a deletion that intersects the hold is suspended". Missing part of a day here means a held record can be deleted.
- The port compares instants (part 1); this row's route chooses which input forms it accepts. The breaker reports the same issue as M2.
- *Fix (no port change):* in `PlaceBody`, refuse a date-only string for `to` (and for `from`), naming the field. Or normalise a date-only `to` to 23:59:59.999 UTC and say so in the 201 answer. Add a pass and a fail test.

### Minor
- **m1. The contract runs only on the superuser branch of `isHeld`.** The harness `tx` is `owner.$transaction` (`check_pf21b_holds.ts:104`), so `s.passes` is true and the table is read directly. The production path (xr_app through `plat_legal_hold_active`) gets one PERSON match, two refusals and the placement-waits race. CATEGORY, DATE_RANGE, FIRM, ALL_FIRM_DATA and "a read waits for an open placement" never run on it.
  - *Fix:* run `runContract` a second time with `tx: (fn) => walled.$transaction(async (t) => fn(t))`, and wrap `holds.isHeld` so it first runs `set_config('app.firm_id', firm, true)` on `t`. The contract file does not change.
- **m2. The firm's view of our actions.** This follows from departure 2. The firm's log shows "The system", with no action words. `?ours=true` returned 0 lines for placements and releases that ExpatReady staff made. Record it as a follow-up for when PF-4s gives OUR_STAFF an actor word. Optionally, `AuditActionNames.register("platform", …)` the two actions in this row's own files.
- **m3. A placement that waits more than 5 s behind a deleter fails with a bare 500.** This is Prisma's interactive-transaction timeout (breaker m2). It is never a false success. Map it to 409 or 503 with "try again", or set `{ timeout }` on the two `$transaction` calls.
- **m4. Wording: the claim that a firm's request can never place, release or read a hold "whatever its code does" (`migration.sql:12`) is too strong.** The database refuses a firm session. Any firmless xr_app connection can call `plat_legal_hold_place` or `plat_legal_hold_release` directly; I verified this with a probe that sets no firm. The real gate is `@SystemKeys`, the same model as PF-4s's `plat_system_no_firm`. Reword it to "refused inside a firm's session".
- **m5. The DW3 firm-token case does not show that the token holds `agent/legal-hold:manage`.** user-R is a firm ADMIN, and PF-3 seeds the key to ADMIN, so the case is right. Assert it (or read it from the token) so the label proves itself. Duplicate holds from a double click (breaker m3) are safe, because they need two releases and are never a false release; no action needed.

## The four departures
1. **Definers instead of a new asBypass use: agree.** PF-12's OWN list requires forced RLS with no policy (`check_pf12_walls.ts:33`), and the bypass list sits outside the touch list. The definers are sound:
   - each is owned by xr_wall_reader, SECURITY DEFINER, with `search_path = pg_catalog, public, pg_temp` (pg_temp last);
   - each has `REVOKE ALL FROM PUBLIC` and EXECUTE for xr_data only;
   - all are parameterised; `format('%s')` is used only on a constant list, so there is no injection path;
   - `_active` fails closed when the session has no firm or another firm (probed);
   - the console definers refuse inside a firm session.

   Only B1's GRANT/REVOKE pair is missing.
2. **A `system:` actor with the staff id in `detail`: agree, as the least-bad choice.** `staff:` would be typed FIRM_STAFF (`audit-event.ts:52-56`). Record m2 as the visible cost.
3. **No relation to PlatformFirm: agree.** A RESTRICT key would block PF-11's purge after release. CASCADE would delete the legal record. The insert trigger catches an unknown firm (tested, 404 `FIRM_NOT_FOUND`).
4. **One Appendix A row in `check_pf4s_system_signin.ts`: agree.** The brief's own seed makes its "nothing else seeded" assertion fail. The new row quotes SA-07 Appendix A / SA7-D74 (a). The brief says "stop and ask" for files outside the touch list, so the Lead should acknowledge this on the PR.

## Correct as built (checked)
- **Rule 3:**
  - `isHeld` refuses the root client and RR/SERIALIZABLE, then takes the shared lock through `tx` before it reads.
  - Placement and release take the exclusive lock in the service, and again inside the definer (the lock is re-entrant).
  - Release reads the firm, locks it, then updates `WHERE released_at IS NULL` with a fresh READ COMMITTED snapshot. Two parallel releases give 200 + 409 with one audit line (test passes, and the walk repeated it).
  - The lock key `'legal-hold:' || lower(uuid::text)` equals `legalHoldLockKey`.
- **Triggers:** no delete or truncate, even for the owner; facts are immutable; release happens once with who and why; the times come from the database (`clock_timestamp`, a back-dated `placed_at` is replaced). The CHECKs on scope shape, reason and actors are tested.
- **Errors:** 401 / 403 (firm token `FIRM_SESSION_REFUSED`, Support/Admin/Auditor `MISSING_PERMISSION`) / 400 reason / 422 named fields / 404 firm or hold / 409 already released. No false success while held: DW4 with a real `KeepPeriods.check` keeps the row.
- **Seed:** Platform Owner only (P-601 (1)). `migrate diff` is empty. Measured right after its own migration on an empty copy and a demo-data copy. No firm route for holds.
- **Style:** a thin controller, the service does the checks, one feature file (P-214), `MODULE.rows/PF-21b-2.md`.

## Named tests (ticked on 78861110)
- [x] **PF-21b DW2 pass/fail:** the contract, 9/9, on the real adapter; the tool exits 0; the firm path; cross-firm and no-firm refusals; RR/SERIALIZABLE/root client. *Gap: m1.*
- [x] **PF-21b DW3 pass/fail:** firm token, Support, Admin, Auditor → 403; Owner → 200/201; one line per place and per release; second release → 409, nothing changed. *Gaps: M1, m5.*
- [x] **PF-21b DW4 pass/fail:** HELD with the reason and the row kept; it proceeds after release; firm A never holds firm B; the real adapter is under `KEEP_CHECK_HOLDS` in the app.
- [ ] **PF-21b DW6 / "full ci green":** the DW6 cases pass, but CI does not: B1 (`check_pf8b_f4_migrations`) and M1 (`check_aud_values`); also `check_pf21_complaints` (from #2927).

**Journey score:** 7.5/10 (6 of 8 applicable criteria; accessibility and visual quality N/A, because there is no screen). Below the pass mark of 8; see `journey-test-reviewer-2026-11-22.md`.

**Not checked:** a real RDS deploy (B1 is inferred from PF-8b F4's rule and its guard); CI on this head; `check_pf28_inputs`; an intended user's walk (D17/D20 stay with the founder).

To fix before Approve: B1, M1, M2, M3. The minors are optional; m1 and m4 are cheap while the files are open. The design does not need rework. Re-review reads only the diff. Under the agent definition's two-way rule this is Block: do not label.

Verdict: Changes 78861110ae7926c0d6cea7289112503c9012eae6
