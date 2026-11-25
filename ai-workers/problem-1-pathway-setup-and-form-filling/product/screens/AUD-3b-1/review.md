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

---

# Round 3 (diff-only, 517ea9daf..8a8de4bca; reviewer, fresh context; the Lead's "round 3: diff-only")

## Verdict: Ship after fixes → **Verdict: Block** until R3-M1 is fixed
The length part of R2-M1 is fixed, and its test kills the round-2 code. But the fix says a reason that passes "is never refused there" (`service.ts:60-61`), and that is not true. A reason with an email address in it still passes this check, is refused by the start line's AuditDetail, and answers 500 with a BR-5 alarm.

## What I ran
* PR worktree at 8a8de4bca: `check_aud3b_support_session.ts` passes 26/0.
* Scratch worktree of the head (node_modules linked; the PR worktree untouched):
  * 24 boundary probes in the PR's harness (`scratchpad/r3probe.log`, `r3probe2.log`).
  * 5 mutations (`scratchpad/r3mut-out.txt`).
  * Journeys on the full API (`isolated.sh rv3187 4437`, stopped afterwards; `journey-test-reviewer-2026-11-25.md`, Round 3).

## R2-M1: is a passing reason always accepted downstream?
Order of checks: guard `reasonOf(raw)` (≤500 code points, cleaned) → zod `trim().min(1).max(500)` (UTF-16) → `reasonOf` → `reason.length ≤ 200` (UTF-16) → the database CHECK → the start line's AuditDetail.
* **Guard (REASON_MAX 500): holds.** The guard runs first. 200 UTF-16 units is at most 200 code points, which is under 500. `reasonOf(trim(raw))` equals `reasonOf(raw)`, because `lineText` trims after cleaning.
* **Database CHECK `char_length(btrim(reason)) BETWEEN 1 AND 200`: holds.** UTF-16 units are never fewer than code points. `reasonOf` needs a letter or digit, and JS trim already removed the spaces `btrim` would strip. P10 (spaces) and P11 (NBSP) → 201, stored as 200 code points.
* **AuditDetail `string().max(200)`: holds for length.**
  * 8 + 96 wide characters (200 units, 104 code points) → 201; the start line equals the register.
  * 7 + 97 wide characters (201 units) → 422 with `fields.reason`.
  * 200 Latin → 201; 201 Latin → 422. 199 Latin + 1 wide (200 code points, 201 units) → 422. 198 + 1 wide → 201.
  * 100 × e + combining acute (200 units) → 201.
  * Cleaning that shortens the text: "a" + 299 ZWSP + 199 "b" (499 raw, 200 clean) → 201. RLO + 200 x → 201. 50 Hangul fillers + 200 x → 201.
* **AuditDetail's email refine: does not hold (R3-M1).** Lone surrogates do not hold either (R3-S2).

## Mutations (scratch, each reverted)
| Mutation | Result |
|---|---|
| Count code points (`[...reason].length`, the round-2 code) | **Killed** (the new "wide" case) |
| Length check removed | Killed |
| Limit 201 | Killed |
| `>=` (exactly 200 refused) | **Survived**: no test sends exactly 200 (R3-S3) |
| Count `raw` instead of the cleaned text | Survived: same result for every test input, and it only refuses more (not a finding) |

## Issues (ranked)
1. **Must (Major), R3-M1: a reason that names someone by email answers 500 and raises the BR-5 `audit_write_failed` alarm.**
   * Scenario, full API: our Support starts a session on sample-firm with "Sample: ticket 4821, client.a@sample-firm.example cannot see invoices" → 500 "Something went wrong on the server". One alarm in `rv3187-api.log`; nothing opened. The short form "ticket a@b.co" does the same (harness E1, E2).
   * Cause: `service.ts:63` checks only the length. The start line's `detail.reason` (`:75`) goes through AuditDetail, whose refine `ports/audit.ts:23` (EMAILISH, `:16`) refuses any email-shaped string.
   * This is R2-M1's class: input a person would really type, a 500 with no field message ([M] Problem Details with field-level messages), and an integrity alarm anyone with the key can fire. It contradicts the fix's own comment (`:60-61`) and the Lead's check ("can never fail the start line's AuditDetail").
   * Fix: before the transaction, check the line's own detail (`AuditDetail.safeParse({ reason })`, or the email shape). Answer 422 with `fields.reason` in plain words, e.g. "Leave out email addresses: give a ticket reference." Add a test with an email-shaped reason, plus a mutation check.
2. **Should, R3-S2: a lone UTF-16 surrogate answers 500 and raises the same alarm.**
   * Scenario: `{"reason":"Sample ticket \uD800"}` (and `\uDC00`) → 500. Postgres jsonb refuses it ("invalid input syntax for type json", P2007).
   * Only a crafted request can send this; nothing a person types produces it.
   * Fix, in the same place: refuse a reason that is not `isWellFormed()` (422). Or drop `\p{Cs}` in `lineText`, which also covers the guard's other lines.
3. **Should, R2-S1 (still partly): the new zod message never shows.**
   * `words()` in `http/input.ts:41` replaces every `too_big` message, so the custom `.max(500, "A reason of 1-200 characters.")` at `service.ts:48` is dead.
   * "a" + 600 ZWSP (cleans to "a") still gets INVALID "This is too long: at most 500 characters." (P9). Over 500 after cleaning, the guard answers REASON_TOO_LONG "at most 500" (P14, P15).
   * 201-500 is one message ("1-200"), as it already was at 517ea9daf.
   * Fix: drop zod's `.max(500)` (the guard already bounds the size), or map it in the service. Otherwise list it as a stated Minor.
4. **Should, R3-S3: the accept side of the boundary has no test.** The `>=` mutation survives. Add exactly 200 units (for example 8 + 96 wide characters) → 201 next to the 201-unit case.

R2-S2 (PR body) is fixed: it says 26 passed and lists the stated round-1 Minors.

Note, not a finding (round-1 cleaning, outside this diff): `lineText` drops ZWJ (`\p{Cf}`), so a family emoji is stored as three separate people (P20: 91 code points → 55).

## D1-D20 changes from round 2 (the rest unchanged)
| D | Score | Evidence |
|---|---|---|
| D2 | 4 | The reason is the same in the register and on the start line at every length tested. An email-shaped reason is fail-closed (R3-M1). |
| D10 | 4 | One "1-200" message for 201-500, but still "at most 500" above it (R2-S1). |
| D16 | 4 | The new test kills the round-2 code. `>=` survives (R3-S3), and R3-M1 has no test. |

Journey (reviewer, round 3): **8.1 / 10, a pass, no criterion at 0**; R3-M1 still blocks (`journey-test-reviewer-2026-11-25.md`, Round 3).

Not checked: browser, keyboard, zoom and BIC (no screen); a screen reader; D17 and D20; whether other routes put free-text reasons into AuditDetail (outside this diff).

Reviewer: Changes 8a8de4bcafc7ae8067c30daedfc83d212e19f73d

---

# Round 4 (diff-only, 8a8de4bca..82081ec02; reviewer, fresh context; the Lead's "round 4: diff-only check of the reason's AuditDetail.safeParse/isWellFormed check and its tests")

## Verdict: Ship after fixes (one Major, one line) → **Verdict: Block** until R4-M1 is fixed
The new check works at runtime. Every reason that passes it is accepted by the start line, by the in-session and refusal lines' `supportReason`, and by Postgres. The new tests kill every mutation the Lead asked about. But `String.prototype.isWellFormed` is ES2024, and the api project compiles to es2023. So tsc reports a new error, and the `types` CI job fails (R4-M1).

## What I ran
* PR worktree at 82081ec02 (run only, nothing changed): `check_aud3b_support_session.ts` passes 26/0 (`scratchpad/r4_head.log`).
* Scratch worktree of the head (`scratchpad/r4wt`, studio and prototype node_modules linked; the PR worktree untouched):
  * 25 probes added to the PR's harness (`scratchpad/r4probe.log`). For each reason accepted: the start line equals the register; an in-session read gives 200, and its `supportReason` equals the register; a refused nested start gives 403, and its `supportReason` equals the register. The run had no 500 and no `audit_write_failed`.
  * 5 mutations (`scratchpad/r4mut.py`, `r4mut-out.txt`).
  * tsc and `product/tools/typecheck.mjs` on the changed files (`api/tsconfig.r4.json`, scratch only).
  * The API journeys on the full app (`isolated.sh rv4875 4437`, runtime-lane port, stopped afterwards; `journey-test-reviewer-2026-11-25.md`, Round 4).

## Does every reason that passes the check pass downstream?
* **Start line AuditDetail: holds.** The line's other values are a uuid, "READ" and two ISO times. None contains "@", and the refine tests each value on its own. So `AuditDetail.safeParse({ reason })` passing means the full detail passes. The field names are fixed and valid.
* **In-session and refusal lines' `detail.supportReason`: holds.** `audit-event.ts:67` adds it after `AuditEntry.parse`, so AuditDetail never sees it. Only Postgres JSON does. It is the register's text, at most 200 units, so `slice(0, 200)` cuts nothing and never splits a pair.
* **Postgres jsonb: holds.** Every lone surrogate is refused (U1-U5).
* **The check runs on the cleaned text, the text that is stored.**
  * An email split by a ZWSP or an RLO (E8, E9) → 422.
  * A pair split by a ZWSP (U7) is well formed after cleaning → 201, stored as the emoji.

| Probe | Result |
|---|---|
| E1 the round-3 sentence; E2 `ticket a@b.co`; E3 upper case; E4 `x@y.z`; E10 `mailto:a.b@firm.example`; E11 an email ending at unit 200 | 422 INVALID, `fields.reason`, nothing opened |
| E8 `a@` ZWSP `b.co`; E9 `a` RLO `@b.co` | 422 (the cleaned text is an email) |
| E5 `a@b`; E6 `user@localhost`; E7 fullwidth `＠`; E12 `@support team.example` | 201; every line accepted (EMAILISH needs `x@y.z`) |
| U1 lone high; U2 lone low; U3 high at the end; U4 two highs; U5 a reversed pair | 422, nothing opened |
| U6 a valid pair; U7 a pair split by ZWSP | 201; every line accepted |
| U8 lone high + 200 Latin | 422 "1-200" (the length check runs first) |
| L1 exactly 200 Latin; L2 8 + 96 wide (200 units); L3 198 + a pair (200 units) | 201; every line accepted |
| L4 199 + a pair (201 units); L5 201 Latin | 422 "1-200" |

## Mutations (scratch, each reverted)
| Mutation | Result |
|---|---|
| `isWellFormed()` dropped | **Killed** (SS1 fail: the lone case) |
| `AuditDetail.safeParse` dropped | **Killed** (SS1 fail: the email case) |
| `>=` (exactly 200 refused) | **Killed** (the `exact` case: 422, not 409) |
| The whole new check dropped | Killed |
| AuditDetail on `raw` instead of the cleaned `reason` | Survived (see R4-S1) |

## Issues (ranked)
1. **Must (Major), R4-M1: the new check fails the type check, so CI's `types` job is red.**
   * Where: `service.ts:67`, `reason!.isWellFormed()`.
   * The error: `TS2550: Property 'isWellFormed' does not exist on type 'string'. Do you need to change your target library?` (`api/tsconfig.json` has `"target": "es2023"`, and `@types/node` does not declare it).
   * `node product/tools/typecheck.mjs --project api=<a tsconfig of service.ts plus the check>` gives `FAIL 1 new type error(s) (not in typecheck-known.txt)` and exits 1. The known list only shrinks, so this error cannot be added there.
   * The `types` job was skipped on this commit, so it fails later, in the merge queue. Runtime is fine (Node 24.21.0 in `.nvmrc` and the Dockerfile).
   * Fix: use the project's existing shim in `ports/files.ts:22-23`, `(String.prototype as unknown as { isWellFormed(this: string): boolean }).isWellFormed.call(s)`. Exporting it and reusing it is best. Then rerun tsc on the api project.
2. **Should, R4-S1: no test catches the check moving to the raw text.** The mutation `AuditDetail.safeParse({ reason: raw })` passes 26/0. With it, E8 (an email split by a ZWSP, which can come in with pasted text) passes the check. The cleaned line is then refused: the round-3 500 and alarm again. Fix: add one email with an invisible character inside to the SS1 fail case.
3. **Minor, R4-m1: a lone surrogate gets the email words.** The field says "A ticket reference or plain words, with no email address." Only a crafted request sends one (R3-S2), so this is a stated Minor or a nit. A neutral "in plain text" would cover both cases.

Round-3 findings: **R3-M1 fixed** (E1-E11, J14). **R3-S2 fixed** (U1-U5). **R3-S3 fixed** (the `>=` mutation is now killed). R2-S1 ("at most 500" above 500, J13b) is unchanged and was not in this diff.

The comment at `service.ts:60-62` ("a reason that passes here (and the check below) is never refused there") is now true for everything I probed.

Outside the round, not findings: the guard's own reason handling (`system-identity/guard.ts:122-145`), and other routes that put free text into AuditDetail.

## D1-D20 changes from round 3 (the rest unchanged)
| D | Score | Evidence |
|---|---|---|
| D2 | 5 | The reason is the same in the register, on the start line, and on the read and refusal lines for every reason probed. Every refusal opens nothing. |
| D10 | 4 | J14 gets a field message; "at most 500" remains above 500 (R2-S1). |
| D16 | 4 | The new tests kill all four required mutations. The raw-text mutation survives (R4-S1). The build has a type error (R4-M1). |

Journey (reviewer, round 4): **9.4 / 10, a pass, no criterion at 0** (`journey-test-reviewer-2026-11-25.md`, Round 4). R4-M1 still blocks the merge.

Not checked: browser, keyboard, zoom and BIC (no screen); a screen reader; D17 and D20; the full api and web tsc run (12 GB heap; only service.ts and the check, with everything they import).

Reviewer: Changes 82081ec02068072dce40086907bf548be9b0adb9
