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

---

# Round 2 (diff only, P-277): `78861110a..5fda25666`, prototype paths (reviewer, 22 Nov 2026)

Read: `git diff 78861110ae7926c0d6cea7289112503c9012eae6 5fda25666d9937f65d2c8165b10655fef9673af0 -- …/prototype` (migration +22/−14, service.ts, check_pf21b_holds.ts). Ran in a detached worktree of 5fda25666 (removed after); scratch databases dropped.

**Runs:** `check_pf21b_holds.ts` 67 passed, 0 failed, exit 0, **twice**. Exit 0: `check_pf8b_f4_migrations`, `check_aud_values`, `check_pf12_walls`, `check_pf4s_system_signin`, `check_pf21b_port`, `check_aud5_check`; static sweeps 16/16 (base 6492a25ec); `count-any` 416 = base; `check-port-contracts` 0 problems. A zod probe: `2026-02-30`, `2026-02-29`, `2026-13-01` refused; `2028-02-29`, `…T10:00+05:30`, `…Z` accepted.

| Round 1 | Fix at 5fda25666 | Status |
|---|---|---|
| **B1** RDS hand-over | `GRANT CREATE … TO xr_wall_reader` before one `DO $own$` block that now hands all six functions (`_active` moved in), `REVOKE` after; guard exit 0 | **Closed** |
| **M1** before/after | placed: `before: null`, `after` = scope, target, category, from, to, reason (full), placedBy, active, placedAt; released: re-read in the same tx after the update, `before`/`after` with active, releasedBy, releaseReason (full), releasedAt; summary names the scope and placement date; `.slice(0, 200)` gone. Values fit `AuditValues` (4000 chars). Tests read `*_after` / `active_before` from the stored line | **Closed** |
| **M2** list cap | `plat_legal_hold_list(firm, active, id, limit)` filters in SQL, clamps 1-501; service asks limit+1 → `truncated`; `limit` 1-500 (422 otherwise); `one()` reads by id. Test: 1 active behind 520 released is listed, `truncated` true/false as it should be, the old hold's release → 200 (the old code fails both) | **Closed** |
| **M3** date-only range | `RangeEnd`: a calendar date is the whole UTC day (`to` = 23:59:59.999), a full time must carry its zone, years 1900-9999, null/number/bool refused; error path on `to`. Test: a one-day hold holds 22:30 that day, not 00:00 next day; five bad inputs → 422, nothing placed | **Closed** |
| m1 contract on xr_app path | second `runContract` with `walled.$transaction` and a wrapper that only `set_config('app.firm_id', …)`; adapter and contract unchanged; 9/9 | **Closed** |
| m2 firm sees "The system" | unchanged; PR question (waits on an OUR_STAFF actor word) | Open, Minor, accepted as a question |
| m3 5 s timeout | `{ maxWait: 10 s, timeout: 60 s }` on both transactions | **Closed** |
| m4 wording | migration header now says the no-firm gate is the code's (PF-4s guard and key) | **Closed** |
| m5 firm key | asserts `/api/platform/me` keys include `agent/legal-hold:manage` | **Closed** |
| breaker m4/m5 | reason refuses C1 and bidi marks (tested); table actor pattern equals `AuditActor` (`ports/audit.ts:13`; `system:jobs/purge` tested) | **Closed** |
| breaker m3 duplicates | unchanged; safe direction (two releases needed, never a false release); PR question | Open, accepted |

**New in this diff, checked:** the release re-read runs inside the same READ COMMITTED transaction after the definer's UPDATE (sees its own write; the lock is still held, so no other release interleaves). `plat_legal_hold_list`'s new signature is the one handed over and granted (the DO list names `(uuid, boolean, uuid, integer)`). `ScopeBody` reuses the port's `LegalHoldCategory`, then `placeAs` re-parses through the port's `PlaceHoldInput`, so the port stays the final check. No SQL built from strings; the definer's `least(greatest(coalesce(p_limit, 501), 1), 501)` makes a direct caller's limit safe.

**New minors (optional, not blocking):**
- **r2-m1.** The DATE_RANGE words in the summary use the UTC date (`toISOString().slice(0, 10)`), so a range given with an offset (`…T23:00-05:00`) reads one day later in the firm's log; the before/after values carry the exact instants. Cosmetic.
- **r2-m2.** `ScopeBody` repeats the port's `HoldScope` shape, so a new scope kind in the port would need a line here too. The port's re-parse fails safe (422 or 500, never a wrong hold).

**Still outside this diff:** `check_pf21_complaints` stays red from #2927's `plat_system_*_fkey:rc` (#2927 to fix). Size is 875 changed lines, over P-610's 800 because of the review fixes, and the records under `screens/PF-21b-2/` (P-775); the builder asks the Lead, which is not a code finding. The four departures stay agreed; the Lead acknowledges departure 4 on the PR.

**Journey re-score (round 2 evidence, the suite's new journeys):** correct data ½→1 (M1, M2, M3 closed), plain words still ½ (m2), trust still ½ (m2): **7 of 8 applicable = 8.75/10, pass**, no criterion at 0.

No open Blocker or Major.

Verdict: Approve 5fda25666d9937f65d2c8165b10655fef9673af0

---

# Round 3 (diff only, P-277): `5fda25666..16da2b10e` (reviewer, 22 Nov 2026)

Read the 24-line diff the coordinator named (`git diff -M` over the migration folder, schema, `register/`, `MODULE.rows/PF-21b-2.md`, the test). I ran it in a detached worktree of 16da2b10e (removed afterwards) and dropped the scratch databases.

**What changed:**
- **(a) Re-stamp.** The migration is renamed `20261122070000` → `20261122180000_pf21b_legal_holds` (87 % similarity; the only body change is (b)). The four references (schema comment, adapter header, MODULE row, test `NEW`) all follow. On the branch it is the newest folder, after `20261122060000_pf4s_system_identity`. The test's "own stamp, later than every one before it" case still holds.
- **(b) Seed wrapped in a PF-8b F7 lifting statement.** The DO block is the same, line for line, as `origin/main:…/20261122060000_pf4s_system_identity/migration.sql:162-173`, with `walls` narrowed to `plat_system_role_permission`. It does nothing on a superuser or BYPASSRLS runner. Otherwise it:
  1. locks the table ACCESS EXCLUSIVE;
  2. lifts FORCE only if it was set, and disables the firm gate only if it is enabled;
  3. inserts the one row;
  4. restores both in the same statement.

  The migration is one transaction, so a failure rolls the lift back too. The seeded row is unchanged: Platform Owner only, P-601 (1).
- **(c) Merge of `origin/main`.** #2927 is on main, so `git diff origin/main...16da2b10e` is the row's 9 files.

**Runs on 16da2b10e:**
- `check_pf21b_holds.ts`: 67 passed, 0 failed, exit 0, **twice**.
- Also exit 0: `check_pf8b_f7_data_walls` (17/17), `check_pf8b_f4_migrations` (9/9), `check_pf4s_system_signin` (78/78).
- Not re-run by me (the builder reports them green on this head): `check_pf21_complaints` (main narrowed its FK filter, so round 1's #2927 note is closed), `check_forms_qa53` on :4432, and the other named suites.

**Findings:** none new. No code outside the stamp references and the seed statement changed. Rounds 1 and 2 stay as approved. Still open as PR questions: m2 (the firm sees "The system"), breaker m3 (duplicate holds), and the Lead's word on the size (now 894 insertions over 9 files against main) and on departure 4.

No open Blocker or Major.

Verdict: Approve 16da2b10e1375193240ce0108479c53be44a4359
