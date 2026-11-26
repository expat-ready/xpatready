# Review: AUD-3 part 3 (R1.87), our audit search `GET /api/system/audit` (PR #3657)

Reviewed head **7cb4008a592178ac886b8344f910053019ce38de** (branch `claude/runtime-aud3-search`) only. The branch has since moved to 6435baab1 ("round 1 (breaker)"). I did not review that commit, and this verdict does not carry over to it.
Scope: BACKLOG row AUD-3 item (3); brief `design/briefs/AUD-3.md` (DW7); SA-11-8 and SA-11-12 (domain snapshot); STANDARDS [M] lines. This item is API-only with no screen. The browser walk, keyboard pass, 1024 px and 200 % zoom checks, axe, team look and BIC scorecard do not apply, and each is marked N/A below.

**Verdict: Block.** This is "Ship after fixes": one Major, and the fix is in the test only, because the code behaves correctly. `Reviewer: Changes 7cb4008a592178ac886b8344f910053019ce38de`

## What I ran
* `npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud3_access.ts` at 7cb4008: exit 0, **60 passed, 0 failed** (Postgres on 54329, a scratch database, US$0). The builder's result reproduces.
* **Rule removal** (STANDARDS §7 [M]). I made one change at a time to `search.ts` in a scratch worktree at 7cb4008 and reran the whole suite each time:

| Rule removed or changed (search.ts line) | Suite |
|---|---|
| `{ firmFilter: true }` (78) | 1 FAIL (the line names firm A) |
| firm uuid clause (51) | 2 FAIL |
| `firm=platform` clause (50) | 1 FAIL |
| correlationId clause (57) | 1 FAIL |
| action clause (54) | 2 FAIL |
| keyset `<` changed to `<=` (66) | 2 FAIL |
| keyset on `at` only (66) | 1 FAIL |
| **`ours` clause (53)** | **60 passed** |
| **`actorType` clause (52)** | **60 passed** |
| **`entity` clause (55)** | **60 passed** |
| **`entityKey` clause (56)** | **60 passed** |
| **`e.at < to` bound (49)** | **60 passed** |

* **Reviewer probes** (added to a scratch copy of the test, unmodified code):
  * a firm id in upper case is lowercased on the answer and on the line;
  * page 2 writes its own line;
  * 201-character action or correlationId, `ours=0`, `to` before `from`, a repeated `firm`, and `area` each answer 422 with nothing written;
  * `firm=platform&ours=1` stays consistent;
  * a firm token answers 403 FIRM_SESSION_REFUSED;
  * HEAD answers 200 and writes a line;
  * an unknown firm uuid answers 200 with 0 lines, and the line names that uuid;
  * 10 unnarrowed searches average 10.9 ms (291 lines);
  * `ours`, `actorType`, `entity`, `entityKey` and an earlier `to` each exclude the firm staff line on their own, so the code is right.
* Checked independently: `Date.parse("2026-02-30T00:00:00.000Z")` gives a number, and Postgres refuses `'2026-02-30…'::timestamptz` (see m1).
* `tsc --noEmit -p api/tsconfig.json`: no error in the touched files. `graph.mjs` ran (worktree): see "could not check".

## Issues (ranked)
1. **Major (Must): DW7 does not prove the "ExpatReady staff access" button or the actor-type, entity and entity-key filters.**
   * Where: `tests/check_aud3_access.ts:369-377` at 7cb4008.
   * What happens: you can delete each of the clauses at `search.ts:52`, `:53`, `:55` and `:56` and the suite stays at 60/60.
   * Why the test passes anyway:
     * The `ours` check reads only page 1 of `firm=A&ours=1`. Firm A's newest 50 lines are all OUR_STAFF lines, so the firm staff line is never on that page.
     * `sSess` and `sType` both carry an `action=` that alone narrows the result to one line.
   * Why it matters: SA-11-8 names the button, and the brief's DW7 says "the ExpatReady staff access filter returns only our staff's lines". The test's own name says "actor type, action, entity and entity key narrow to the one firm staff line", which is not true. This fails STANDARDS §7 [M] "a rule's test fails when the rule is removed".
   * Fix: give each filter a check where it alone excludes a line that matches everything else, for example:
     * `action=platform.aud3_test.firm_staff&ours=1` → 0 lines;
     * `…&actorType=OUR_STAFF` → 0;
     * `…&entity=other` → 0;
     * `…&entityKey=<other>` → 0;
     * a `to` before the line's time → 0.
2. **Minor (Should): a crafted cursor with an impossible date answers 500, not 422.**
   * Where: `access/report.ts:73`. `decode` checks the date with `Date.parse`, which V8 rolls over (30 Feb becomes 2 Mar), and Postgres then refuses the cast at `search.ts:66`.
   * Scenario: `cursor=base64url(["2026-02-30T00:00:00.000000Z","<uuid>"])` → 500. That breaks STANDARDS §6 [M] (Problem Details with field errors).
   * Fix: check the date with `realMoment`, as AUD-4's `decode` does. The breaker found this first; I confirmed the parse and the cast.
3. **Minor (Should): the row's named test "a firm token on `/api/system/audit` → 403" is not in DW7.**
   * It holds: my probe got 403 FIRM_SESSION_REFUSED, and PF-4s DW1 covers it for every keyed route.
   * Fix: add the one call to DW7.
4. **Minor (Should): HEAD writes a search line for an answer with no body.**
   * Where: `search.ts:78`. Express routes HEAD to `@Get`.
   * Scenario: with `firm=A`, firm A's access report then shows a search that delivered nothing. It over-logs and leaks nothing.
   * Fix: refuse HEAD, as part 2's export does.
5. **Minor: test wording.** At `:361` the test says "each search page wrote one line" but checks page 1 only. Page 2 holds (my probe); either assert it or reword the test.
6. **Nit: duplication.** `search.ts` copies `Row` and most of `line()` from `report.ts`. Export the type instead.

**Not counted as findings (scope, P-26):**
* No CSV of the search, and no `at`-only index. Both are stated in the PR. The row's Touch list has no schema change and item (3) names no CSV; SA-11-9's export stays open for a later part.
* SA-11-8's actor filter, and its separate "sensitive-event lens" filter (impersonation / cross-tenant), are not in row item (3). The `ours` button is in the row and is built.
* The breaker's M1 (a search aimed at one firm through `entityKey`, `correlationId` or an action unique to that firm names no firm on its line). SA-11-12 asks only "naming operator and scope", and the line does that. Whether the line should also carry the filters is a ruling for the Lead, not something this row asks for.

## Standards [M] (applicable lines)

| Line | Status | Evidence |
|---|---|---|
| §1 stack, no new tech | Met | NestJS, Prisma raw SQL, zod `query()` |
| §3/§6 server authorisation, deny by default | Met | `@SystemKeys(system/audit-log:list)`; Support 403, no token 401, firm token 403 |
| §4 modular, ports | Met | Reuses AUD-4's `parseFilter` and part 2's cursor; the line goes through the part 1 interceptor, on the port |
| §5 read paths indexed | Partly (stated) | Narrowed by firm or platform: `audit_event_firm_id_at_idx`. Unnarrowed: no `at` index (stated) |
| §5 personal data | Met | No before/after or name column is read; `detail` holds ids |
| §6 contract first (zod in shared package, OpenAPI) | Not met (as part 2) | No contract in `contracts/`. Same as merged part 2, not new here |
| §6 cursor pagination, Problem Details | Partly | Keyset by (at, id), proved with 120 equal-time lines. m1 gives a 500 |
| §7 a rule's test fails when the rule is removed | **Not met** | Issue 1 |
| §7 comments say why with numbers; module card | Met | Header cites SA-11-8/-12, AG-13-31; MODULE.rows/AUD-3.md line added |
| §9 search < 200 ms, no per-row request | Met | 10.9 ms average here; breaker reports 162 ms at 300k lines; one query per page |

## D1–D20 (1–5)
* D1 Requirement fit **4**: every filter in row item (3) is there, plus keyset and the self-logging line. The CSV is stated as a later part.
* D2 Data integrity **5**: the only write is the line, and a refused call writes nothing.
* D3 Reuse **4**: parser, cursor and AT_TEXT are reused; the `Row`/`line` copy is not.
* D4 N/A (no rules).
* D5 Stability **4**: bad input answers 422, except m1 (500) and m4 (HEAD).
* D6 Governance **4**: each search is logged with who, when and correlation id; its filters are not recorded.
* D7 N/A (no AI).
* D8, D9, D12, D13, D14 N/A (no screen).
* D10 Language **4**: field errors are plain and name the field; a firm is shown by its id only.
* D11 Feedback **4**: 422 answers carry `fields` and codes.
* D15 Speed **4**: fast on Sample data; the unnarrowed scan is stated.
* D16 Testability **3**: five rules can be removed with the suite green.
* D17 simulated only.
* D18 Provenance **4**: each line shows actor, actor type, trail, correlation id and support session.
* D19 N/A for this part: the console screen that reads it is a later item.
* D20 simulated only.

**BIC-01–BIC-20:** N/A. EXPERIENCE §6 applies to case-side screens, and this is our side's API with no screen.
**Scaffolding (P-33):** none. The route is the product's own; no demo step depends on a loader.
**Retrofit mapping:** the module-card row is recorded (`MODULE.rows/AUD-3.md`).

## Could not check
* Browser, keyboard, 1024 px, 200 % zoom and axe: no screen.
* CI for this head: GitHub shows `ci` and `types` skipped, and the PR says its suites are "to follow".
* `graph.mjs` does not list `GET /system/audit` at all, because the bare `@Get()` is not read, and it lists part 2's routes as untested although DW5 calls them. This is a limit of the tool, not something the builder missed, so the graph cannot confirm this route's test coverage.
* The breaker's NUL-byte 500 (shared `parseFilter`): I did not re-run it.
* D17/D20 stay with the founder.

Journey test: `screens/AUD-3-3/journey-test-reviewer-2026-11-25.md`, **8.75 / 10 (pass)**.

## Round 2 (diff-only: 7cb4008a5..179dd9a11)

Reviewed head **179dd9a11e10b31c397008d79622cca801411478** only (the diff from 7cb4008a5: `search.ts`, `report.ts`, `lines.ts`, `tracker.ts`, `declare.ts`, the test). During this review the branch moved again, to bf4f1dd87 ("round 3: a firm's read line names no route or scope"). I did not review that commit, and this verdict does not carry over to it.

**Verdict: Approve.** This is "Ship": every round-1 finding is fixed, and there is no open Blocker or Major. `Reviewer: Approve 179dd9a11e10b31c397008d79622cca801411478`

### What I ran
* The suite at 179dd9a (worktree, scratch database on 54329, random port, US$0): exit 0, **67 passed, 0 failed**. The builder's result reproduces.
* `tracker.ts`, `lines.ts` and `declare.ts` are byte-identical to PR #3660's head dd8df1ca7 (sha1 match). Both branches share merge base 63f5cc913, and `git merge-tree` of the two heads, and of this head with main, is clean.
* `tsc --noEmit -p api/tsconfig.json`: no error in the touched files. CI on 179dd9a: CodeQL passed; `ci` and `types` were skipped (as in round 1).
* **Rule removal.** I made one change at a time in a scratch worktree at 179dd9a and reran the whole suite each time:

| Removed or changed | Suite |
|---|---|
| `ours` clause (search.ts:56) | 1 FAIL (round-2 filter check) |
| `actorType` clause (:55) | 1 FAIL |
| `entity` clause (:58) | 1 FAIL |
| `entityKey` clause (:59) | 1 FAIL |
| `correlationId` clause (:60) | 2 FAIL |
| `e.at < to` bound (:52) | 1 FAIL |
| firm uuid clause (:54) | 4 FAIL |
| `noteFirmsRead(...)` call (search.ts:79) | 2 FAIL (SA-11-12 line, breaker M1 check) |
| per-firm `recordFirmRead` loop (lines.ts:178) | 2 FAIL |
| `realAt` put back to `Date.parse` (report.ts:75) | 2 FAIL |
| the whole NUL check (search.ts:69) | 1 FAIL |
| NUL check limited to `action`, `correlationId` | **67 passed** (minor 1 below) |
| HEAD refusal (search.ts:91) | 3 FAIL |
| `or e.support_session_id is not null` half of `ours` | 67 passed (an equivalent mutant: see note 2) |

* **Reviewer probes** (a scratch copy of the test, with the code unchanged):
  * 60 lines on 60 distinct firms: page 1 writes 50 firm-read lines on 50 distinct firms, plus one platform line; page 2 writes 10. A page therefore writes at most 50 firm lines, one per distinct firm on the page, never one for the look-ahead row.
  * That 50-firm page takes 82 ms on average over 10 calls; an unnarrowed page takes 75–97 ms (STANDARDS §9: < 200 ms).
  * Fail-closed: a trigger refused the firm-read line of only the 8th firm on the page. The call answered 500 with no lines in the body, and **0 rows were written** (the platform line rolled back with it).
  * Refused calls write nothing:
    * `entity=a%00` and `entityKey=a%00` → 422 BAD_FILTER;
    * cursors at 31 Apr, `0000-01-01` and `T24:00` → 422 BAD_CURSOR;
    * Support on `firm=A` → 403;
    * HEAD by Support → 403, and HEAD with no token → 401.
    * Valid edge cursors (29 Feb 2024, 1970-01-01) answer 200, and each writes only its own platform line.
  * `firm=platform` writes no firm line. `firm=<A in upper case>` writes exactly one firm-read line, on A.

### Round-1 findings
| Round 1 | Status at 179dd9a |
|---|---|
| Major: ours, actorType, entity, entityKey and `to` untested | **Fixed.** Test :393-401: each of them, plus `firm` and `correlationId`, alone excludes the one firm-staff line that `action` alone finds; each removal fails (table above) |
| m1 30 Feb cursor → 500 | **Fixed.** `realAt` (report.ts:70) round-trips the moment and refuses before 1970. Search and access report both answer 422; test :412-417 |
| m2 (row's test) firm token → 403 | **Fixed.** Test :402-404, no line |
| m3 HEAD wrote a line | **Fixed.** 405 SEARCH_HEAD_REFUSED, nothing written |
| m5 page 2 untested | **Fixed.** Test :430-438: three tie pages, three lines |
| Breaker M1 (narrowed by key, correlation id or action, firm not named) | **Fixed.** `noteFirmsRead` with the page's firm ids; one firm-read line per firm, in the platform line's transaction (lines.ts:175-179). Firm A's access report shows the entity-key search (test :368-371) |
| Breaker m2 NUL → 500 | **Fixed** for all four fields (search.ts:69); the test covers two (minor 1) |
| Nit: `Row`/`line` copy | Open (Nit; not blocking) |

### Issues (round 2)
1. **Minor (Should): the NUL refusal for `entity` and `entityKey` has no test that fails when it is removed.**
   * Where: `tests/check_aud3_access.ts:414`, which sends `action=a%00` and `correlationId=a%00` only.
   * Scenario: change `search.ts:69` to check `["action", "correlationId"]` only, and the suite stays at 67/67, while `entity=a%00` would answer 500 again. The code is right today (my probe: 422).
   * Fix: add `entity=a%00` and `entityKey=a%00` to the same check (STANDARDS §7 [M]).
2. **Nit: test wording.** The m1–m3 check says "none writes a line", but its own count (`all1b`, :417) is taken after the 30-Feb and NUL calls, so it covers HEAD only. The next check's `lines("true") === all1` does cover them, so the claim holds; only the wording is off.

**Notes, not counted:**
* Removing `or e.support_session_id is not null` from `ours` changes nothing that can happen: AUD-3b's support-session lines are `actor_type = OUR_STAFF` (BACKLOG AUD-3b), so no line reaches that half.
* A `firm=A` search page that holds A's lines now shows twice in A's access report: once as the platform line naming A, and once as the firm-read line on A's trail, under one correlation id. Both facts are true. Grouping them is the console screen's job.
* At 179dd9a, the firm-read line's detail carries `route` and `scope: "our audit search"`. #3660's breaker M1 (breach register) has the builder removing both in bf4f1dd87, which I did not review. On this head, the only caller of `noteFirmsRead` is the search, so what a firm learns from the line ("our audit search read your lines") is what SA-11-12 wants it to see. This is not a finding here.
* The unnarrowed page is slower than in round 1 (10.9 ms then, now about 80 ms on a bigger scratch database with up to 50 inserts). It is within budget.

### D1–D20 changes from round 1
* D5 Stability **5**: m1, m2 and m3 answer 422 or 405.
* D6 Governance **5**: each firm whose lines a page holds gets its own line.
* D16 Testability **4**: every clause and fix now has a failing test except minor 1.
* All other scores as in round 1.
* BIC, browser, keyboard and axe: N/A (no screen).

Journey test (round 2 appended): `screens/AUD-3-3/journey-test-reviewer-2026-11-25.md`, **8.75 / 10 (pass)**.

`Reviewer: Approve 179dd9a11e10b31c397008d79622cca801411478`
