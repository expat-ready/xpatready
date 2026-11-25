# AUD-3b part 1: review (PR #3675, head a9243675e8d31ba46a07661fdc6cf09d0fb56477)

Reviewer role, fresh context (did not build it). Scope: the Lead's split, part 1: start a read-only session, the always-blocked actions, and a reason on each read (BACKLOG AUD-3b; SA-2-16, SA-2-17, SA-2-18, SA-11-11; P-607 (4)). Change mode, SA-2-41's end, SA-2-19's list, SA-2-29's email and the firm's own routes are stated later parts, so they are not findings here. There is no concept.md for this row, so the concept is the row plus the PR body. **API and migration only, no screen: the browser parts of screen-review and journey-test were skipped.** BIC-01 to BIC-20 are N/A (not a case-side screen).

## Verdict: Ship after fixes (one Major, small) → **Verdict: Block** until M1 is fixed
Everything else holds: the start rules, the one-firm wall, the read-only refusal, the 401/403 split, the reason on every in-session line, and the register's walls.

## What I ran
* From the PR worktree: `check_aud3b_support_session.ts` 22/0, `check_pf4s_system_signin.ts` 104/104, `check_aud3_access.ts` 49/0.
* From a scratch worktree of the same head (same node_modules symlink):
  * `isolated.sh rv187 4436` started the full API without trouble.
  * `probe_r187_firm_sees_our_read.ts`: P5 "a support session into firm A can be started (201)" PASS. P2 "reason" FAIL: the probe reads before any session, which is the PR's open question to qa. The P6 and audit-search failures belong to other rows.
  * The API journey: `journey-test-reviewer-2026-11-25.md`.
  * `check_pf12_walls.ts` 110/0: the builder's 5 environment failures do not happen in a fresh worktree.
* Slots and merge: `migration-slots.py check <merge-base>..HEAD` PASS; `mergify --check` exit 0; the branch merges cleanly with main (a1a086e3d).

## Migration (`20261125060000_shared__aud3b_support_session`)
* Name: SPD-2 `<stamp>_<area>__<name>`, area `shared` (the table plus platform-system's catalogue rows). The Mergify scope is added.
* Walls: RLS enabled and forced, 0 policies (pg_policy); xr_app reads 0 rows and cannot insert or update.
* `plat_support_session_start` and `plat_support_session_open` are SECURITY DEFINER, owned by `xr_wall_reader` (BYPASSRLS), `search_path = pg_catalog, public, pg_temp`, PUBLIC execute revoked, granted to xr_data. Both refuse inside a firm's session (run as xr_app with `app.firm_id` set: refused; with no firm: STARTED). This matches PF-21b.
* Triggers: database time, ends_at = start + 60 min, READ only; update only ends the session, once; delete and truncate are refused. The seed DO block uses the PF-8b F7 shape. It is additive only, and the rollback is written down.

## D1-D20 (1-5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 3 | Every part-1 rule is met except SA-2-17 "bulk export" (M1). |
| D2 Data integrity | 4 | Two starts at once give 201/409 with one row (advisory lock; M6 killed). The reason is not cleaned like the guard's (S6). |
| D3, D4, D7 | N/A | No fields, rules or AI. |
| D5 Stability and recovery | 4 | The race held. Minute 61 → 401. A wrong-firm start locks the person out for 60 min (no end in part 1: S4 wording). |
| D6 Governance | 4 | Who, when and why on every in-session line. The start line's `support_session_id` is null (S3). |
| D8, D9, D12-D14 | N/A | No screen. |
| D10 Language | 4 | The refusals are plain. "Finish it first" offers no way to finish (S4). |
| D11 Feedback and state | 4 | Distinct codes: 201, 401 SUPPORT_SESSION_ENDED, 403 SUPPORT_SESSION_REFUSED, 409, 422, 401 STEP_UP_REQUIRED. |
| D15 Speed | 5 | 14-41 ms per call over HTTP; one definer query per in-session call. |
| D16 Testability | 4 | 10 of 13 valid mutations killed. M1 (GET-only rule), M7 (definer firm-session refusal) and M13 (reason changed at end) survive (S1, S2). |
| D17, D20 | simulated only | No intended user walked it. |
| D18 Provenance | 4 | The reason sits on every line, but the firm sees it only in Raw detail as `supportReason`. |
| D19 Closure | 3 | The API half of "firm sees our read with why" works. The banner (PF-6sb) and the owner's history are later. |

## Standards [M] (those that apply)
* Server authorisation, deny by default: met. Key `system/firm:impersonate` (Own, Sup). A route with no declaration is refused in a session; any non-GET is refused.
* Problem Details: met.
* Migrations additive, with rollback: met (the counts are wrong, S5).
* Indexed reads, no N+1: met.
* Module card: met (`MODULE.rows/AUD-3b.md`).
* A rule's test fails when the rule is removed: partly met (S1, S2).
* Idempotent create: 409 with the open `sessionId`, so a retry can reuse it.

## Issues (ranked)
1. **Must (Major), M1: a "Bulk export" (SA-2-17) answers 200 in a read-only session, and it writes.**
   * Scenario (J8): the Platform Owner starts a session on firm A, then calls `GET /api/system/firms/A/access-report/export` with `X-Support-Session` → 200 CSV, plus a new `audit.exported` line.
   * The start answer's `alwaysBlocked` (`service.ts:39-42`) and the header comment (`service.ts:11-12`) both say it is refused.
   * Cause: `refusalInSession` (`service.ts:95-98`) allows any `@ReadsFirm` GET on the session's firm. `audit/access/report.ts:184` needs `system/audit:export`.
   * Fix: in a session, refuse a route whose `@SystemKeys` include an export key (or one marked "not in a support session"), and add a pass/fail SS3 line. If the Lead rules that this export is not SA-2-17's bulk export, record that in `challenge.md` and reword the list.
   * The breaker found the same thing independently (`break-report.md` M1).
2. **Should, S1:** the GET-only rule (`service.ts:93`) has no failing test. Removing it leaves 22/22, because the hold POST is `@ChangesFirm`. Add a non-GET `@NoFirmData` call in a session (for example `POST /api/system/staff`, which is refused today: J7).
3. **Should, S2:** the definers' "refused inside a firm's session" check has no test (M7 survives). PF-21b has one at `check_pf21b_holds.ts:136`.
4. **Should, S3:** the `platform.support_session.started` line has `support_session_id` NULL (`service.ts:63`). The id is in `detail` only, so a query of the trail by session misses the start. The firm sees "ExpatReady staff" as who, but "ExpatReady support started…" as the action.
5. **Should, S4:** the 409 text says "Finish it first" (`service.ts:61`), but part 1 has no way to finish. Say when it ends. Also, a start sent with an ended session's header answers 401 "Start a new one" (breaker m5).
6. **Should, S5:** the migration header and rollback say "five functions… three definers" (`migration.sql:4,24`). There are six functions and two definers. A rollback done by hand from that text leaves one function behind.
7. **Should, S6:** `StartBody` (`service.ts:44`) only trims. The guard cleans the reason, so the stored text differs from the audited one (bidi and zero-width characters reach the firm's trail). A NUL reason answered 404 "removed by a reset" here; the breaker saw a 500. It should be 422 (breaker m2/m3).
8. **Should, S7:** a change sent with `If-Match` in a session is refused 422 by the If-Match interceptor before the session check, so no refusal line is written (verified: 0 lines). Fail-closed. Refusal lines are not throttled either (breaker m4).

## Notes for the Lead (not findings)
* The session applies only to calls that send the header. A person with a session open can still work without it. This is consistent with the row's separate-token design; please confirm.
* PF-6sb: the console ends the sign-in on any 401 (`web/src/modules/system/session.ts:83`), so it must exempt SUPPORT_SESSION_ENDED, as `staff/step-up.tsx:18` does for STEP_UP_REQUIRED.
* The graph lists the new route with `testedBy: []`, because the suite builds the path through `START()`. The route is tested.

## Newer head, not reviewed
While this round ran, the branch moved to 3ea0a46ab ("round 1 (breaker)").
* What its diff appears to cover: M1 (an `:export` key is refused in a session), S3 (the start line carries the session), S6 (`reasonOf` cleaning; a 422 for a bad reason) and breaker m5/m6.
* What it leaves open: the 409 "Finish it first" wording (S4), the counts in the migration header (S5), and the S1/S2 tests.
* This verdict is for a9243675e only. The new head needs its own round.

## Not checked
Browser, keyboard, 1024 px and 200 % zoom (no screen); the BIC scorecard (not case-side); a screen reader; D17/D20.

Reviewer: Changes a9243675e8d31ba46a07661fdc6cf09d0fb56477

---

# Round 2 (diff-only, a9243675e..517ea9daf; reviewer, fresh context)

## Verdict: Ship after fixes → **Verdict: Block** until R2-M1 is fixed
Every round-1 finding is fixed or stated, and all 10 mutations of the new rules are killed. The reason fix (S6/m3) opens one new hole: a valid non-English reason gets a 500.

## What I ran
* PR worktree at 517ea9daf:
  * `check_aud3b_support_session.ts`: 26/0.
  * `check_pf4s_system_signin.ts`: 104/104.
  * `check_aud3_access.ts`: 49/0.
  * `migration-slots.py check origin/main..HEAD`: PASS (1 new migration, after 20261124170000).
* Scratch worktree (node_modules symlinked): 10 mutations, 26 probes on the PR's harness, and the full API (`isolated.sh rv2187 4437`, stopped afterwards). Journey: `journey-test-reviewer-2026-11-25.md`, Round 2.

## Round-1 findings
| Finding | State | Evidence |
|---|---|---|
| M1 bulk export in a session | Fixed | `service.ts:104`, keys from SYSTEM_ACCESS (`:130`). GET and HEAD of the export → 403 "bulk export is never allowed", 0 `audit.exported` lines. The on-screen report → 200; outside a session → 200. |
| S1 GET-only untested | Fixed | `POST /staff/:id/reactivate` (@NoFirmData) in a session → 403 plus one line (test :173). Mutation M3 is killed. |
| S2 definer wall untested | Fixed | `refusedAsApp` (test :205-206). M8 (start) and M9 (open) are each killed. |
| S3/m1 start line's column | Fixed | `service.ts:71`. The column is the new session's id, even when another person's open header is sent. Its detail also carries `supportReason`. |
| S4 409 words | Fixed | `:69` "it ends by itself then… start the next one after it ends". |
| S5 migration counts | Fixed | Six functions, two definers. Counted against the SQL (started, ended, kept, system_only, start, open). |
| S6/m2 reason cleaned | Fixed, but see R2-M1 | `:61` `reasonOf`. NUL → 422 REASON_REQUIRED, never 500. A bidi reason is stored, guard-logged and start-logged as the same text. |
| m3 two limits | Partly | See R2-S1. |
| m5 ended header on start | Fixed | `:136`. An own open header still → 403 "starting another session", plus a line. |
| m6 HEAD as read | Fixed | `:102`. HEAD on the firm → 200. There is no @Head route under /api/system. |
| 8689fe5 card row | Fixed | `features/MODULE.rows/AUD-3b.md` names the entry points and the suite. |
| S7 If-Match first, refusals not throttled, the tag needs the header | Stated | Header comment `service.ts:16-18`. Not yet in the PR body (R2-S2). |

## Is "a key ending `:export`" the right rule today? Yes.
* System keys in code and catalogue (22): audit-log:list, audit:export, billing:manage, billing:refund, breach:manage, breach:read, compliance:dsr-manage, compliance:legal-hold, firm:address, firm:impersonate, firm:read, firm:reinstate, firm:suspend, plan:approve-change, platform-user:list, platform-user:manage, platform-user:remove, platform-user:show, settings:manage, signup-link:manage, support:list, support:manage.
  * Only `system/audit:export` ends in `:export`.
  * It gates exactly one route: `GET /api/system/firms/:id/access-report/export` (`audit/access/report.ts:184`).
* No other /api/system route returns a file or writes on a GET (every route listed with its method and keys).
  * The file routes elsewhere are firm-plane (`/api/platform/audit/export`, support attachments, billing stand-in), where the header is ignored in part 1.
* The GETs still allowed in a session: `/me`, `/switches` (@NoFirmData), `/firms/:id`, `/firms/:id/access-report` (paged, on screen). None writes beyond its access line.
* Every export key the requirements name ends in `:export`: `system/audit:export`, `system/analytics:export` (not built), `agent/case:export` (firm plane, a later part).
* Note for the Lead (not a finding): this is a naming rule. Nothing at start-up ties a file answer to an `:export` key, so a later export under another key name would pass in a session.

## Mutations (scratch, each reverted): 10/10 killed
Export rule removed; keys never passed; GET-only removed; HEAD not a read; start-line column dropped; reason not cleaned; ended header blocks start; start definer's firm check removed; open definer's firm check removed; code-point limit removed. Output: `scratchpad/r2mut-out.txt`.

## Issues (ranked)
1. **Must (Major), R2-M1: a reason of up to 200 characters with supplementary-plane characters answers 500 and raises the BR-5 `audit_write_failed` alarm.**
   * Scenario, on the full API: our Support starts with `"Sample 工单 " + 110 × 𠀀` (CJK Extension B; 120 characters) → 500 "Something went wrong". With 90 such characters → 201.
   * Harness: 105 code points (201 UTF-16 units) → 500 plus an alert; 104 (199 units) → 201.
   * Cause: `StartBody` now allows 500 units (`service.ts:48`) and `:62` counts code points. The start line's `detail.reason` goes through AuditDetail's `z.string().max(200)` (`ports/audit.ts:17`), which counts UTF-16 units. The PR body says "AuditDetail allows 200". At a9243675e the route's `max(200)` counted units, so this input got 422.
   * Effect: fail-closed (no session is opened). But a field error becomes a 500 with no field message ([M] Problem Details with field-level messages). Anyone with the key can fire the integrity alarm at will. The SS4 test's name says "never a 500".
   * Fix: count the 200 the way the line does (UTF-16 `reason.length`; the database's `char_length` check is then always met), or make the detail's limit and `audit-event.ts:67`'s `slice(0, 200)` code-point safe. Add a test with an astral-plane reason at the boundary.
2. **Should, R2-S1: the 422 for a long reason has three codes and two limits.**
   * 201-500 characters: INVALID "A reason of 1-200 characters."
   * Over 500: the guard's REASON_TOO_LONG "A reason is at most 500 characters."
   * One letter plus 600 zero-width characters: zod INVALID "This is too long: at most 500 characters." This reason cleans to "a".
   * Status, title and `fields.reason` are consistent. But a person told "at most 500" who trims to 450 is then told "1-200". Fix: the route's own words, with 200, for every length.
3. **Should, R2-S2: the PR body is out of date.** It says "22 passed" and does not list the stated round-1 Minors (no throttle, If-Match first, the tag needs the header). WAY-OF-WORKING step 4 asks for Minors to be fixed or listed in the PR.

## D1-D20 changes from round 1 (the rest unchanged)
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | SA-2-17 bulk export is now refused (M1 fixed). |
| D2 | 4 | The cleaned reason is the same in the register, the guard line and the start line. R2-M1 is fail-closed. |
| D6 | 5 | The start line carries the session in its column. |
| D10 | 4 | The 409 says when it ends. The length words disagree (R2-S1). |
| D16 | 5 | 10/10 mutations killed. The boundary R2-M1 needs has no test. |

Journey (reviewer, round 2): **8.1 / 10, a pass, no criterion at 0** (`journey-test-reviewer-2026-11-25.md`). A Major still blocks.

Not checked: browser, keyboard, zoom and BIC (no screen); a screen reader; D17 and D20; the firm Owner's view of the start line (J9: the firm stand-in was not switched on in my copy, and that part is unchanged in this diff).

Reviewer: Changes 517ea9dafb8c20bcfbad13c1da29366723066f99
