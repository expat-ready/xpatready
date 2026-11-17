# R1.77 evidence: result lines (qa, 16-17 Nov UTC)

Commit tested: main `6933695372a54ca5a159ac8764061d7d1ba25909` (holds CS-C1a #1818, merge `4ac5c3199`, and CS-C1b #2002, merge `f7d23b61a`). Cloud qa worktree (Linux). Isolated copies only (ports 4470, 4471, 4474, 4475), each started and stopped in the same command; live AI off; US$0. Local runs: no GitHub-runner run (P-339). Lines are copied from run 2's output (run 1 gave the same lines); a long detail after " — " is cut. Raw logs are not committed (AGENTS rule 1).

## 1. CS-C1a builder test: `tsx --tsconfig api/tsconfig.json tests/check_csc1_close.ts` (from studio/)

Run 1: exit 0, `55 passed, 0 failed`. Run 2: exit 0, `55 passed, 0 failed`.

```
PASS  CS-C1 M1 pass: the migration has its own stamp, later than every one before it (newest before it: 20261115120000_pf6b_permission_catalogue)
PASS  CS-C1 M2 pass: on a copy with existing (OPEN) cases the migration applies; they stay OPEN with no closing fields
PASS  CS-C1 M2 fail: the migration does not apply twice
PASS  CS-C1 M3 pass: migrate diff from the migrated database to the schema names nothing of this row
PASS  CS-C1 M3 pass: every function this migration adds is named case_*
PASS  setup: the app starts with this row's routes (the platform guard's start-up rule passes)
PASS  CS-C1 H1 fail: a declared case route with no token is 401 NOT_SIGNED_IN on all four routes (PF-4's guard still runs)
PASS  CS-C1 H1 fail: the simulated-person header alone (x-actor: user-R) gives nothing on a declared case route (401)
PASS  CS-C1 H2 fail: a link-session token on a declared case route is refused (401 TOKEN_REFUSED), also with a simulated person beside it
PASS  CS-C1 H3 fail: an undeclared /api/runtime/* route with a staff or link Bearer token still gives 403 link-only
PASS  CS-C1 H3 pass: the same undeclared route with the simulated-person header (a configuration person) behaves as before (200)
PASS  CS-C1 H3 fail: a declared case route in other letter case is never answered: a staff token → 403 link-only (as before the hook), no token → 401; the case unchanged
PASS  CS-C1 H3 fail: on /api/runtime a Bearer route declaring AnyStaff or StaffSignIn is still refused 403 link-only; only PermissionKeys passes to PF-4's guard
PASS  CS-C1 H4 pass: core.ts's hook is one line with its why comment naming CS-C1a and Lead 58's comment on #1818
PASS  CS-C1 DW1 pass: a decision on a submitted filing → 201 and one case_decision row
PASS  CS-C1 DW1 fail: a decision on an unsubmitted filing → 409 NOT_SUBMITTED; no row
PASS  CS-C1 DW1 fail (break m1, m2, m4): year 0000, a NUL in a note or reason, an invisible-only reason → 400, never a 500
PASS  CS-C1 DW1 fail: an outcome outside the Sample list or an impossible date → 400 on its field; another case's filing → 404
PASS  CS-C1 DW1 pass: a second decision on the same filing is a correction, a new row (AG-7-33 §10), never an overwrite
PASS  CS-C1 DW1 pass (idempotent create): the same key again, also twice at once, returns the first decision; one row, one audit line
PASS  CS-C1 DW1 fail (idempotent create): the key with another decision → 409 IDEMPOTENCY_KEY_REUSED; a malformed key → 400; still one row
PASS  CS-C1 DW2 fail: decision, withdraw and close without agent/case:record-decision (READ_ONLY, BILLING_FINANCE, CASE_OFFICER) → 403 MISSING_PERMISSION (PF-4's guard's code); nothing written
PASS  CS-C1 DW2 pass: with the key (OWNER, ADMIN, CASE_MANAGER) decision 201, close 200, withdraw 200
PASS  CS-C1 DW3 fail: withdraw after every filing has a decision → 409 HAS_DECISION; the case stays OPEN, no withdrawal row, no event
PASS  CS-C1 DW3 fail: withdraw while one filing already has a decision → 409 (AG-7-50 rule 4: it is not closed WITHDRAWN)
PASS  CS-C1 DW3 fail (review m2): a decision on a filing later set inactive still blocks withdrawal → 409 HAS_DECISION
PASS  CS-C1 DW3 fail: withdraw without a reason → 400 REASON_REQUIRED; without a date → 400 on withdrawnOn
PASS  CS-C1 DW3 pass: withdraw before any decision → the case closes WITHDRAWN, withdrawn_at and the reason set, one WITHDRAWAL row with the date
PASS  CS-C1 DW4 fail: close before every filing has a decision → 409 NOT_DECIDED (AG-7-34 rule 2: before the decision, withdraw)
PASS  CS-C1 DW4 fail: close without a reason (none, empty, spaces) → 400 REASON_REQUIRED; the case stays OPEN
PASS  CS-C1 DW4 pass: close with a reason → CLOSED, CLOSED_BY_STAFF, closed_from_stage set to the stage it was at
PASS  CS-C1 DW4 fail: a closed case has no moves (AG-7-34 rule 4): close, decision and withdraw → 409 CASE_CLOSED
PASS  CS-C1 DW5 fail: reopen without agent/case:reopen (ADMIN holds record-decision, not reopen) → 403; without a reason → 400; the case stays CLOSED
PASS  CS-C1 DW5 pass: reopen with the key and a reason → OPEN at closed_from_stage; the closing fields are cleared
PASS  CS-C1 DW5 pass: the reopen's audit line keeps the old close values (outcome, reason, closed at, stage) and the reopen reason
PASS  CS-C1 DW5 fail: reopening an open case → 409 CASE_OPEN
PASS  CS-C1 DW5 pass: reopening a withdrawn case clears withdrawn_at and the withdraw reason; the WITHDRAWAL row stays (insert-only)
PASS  CS-C1 DW6 pass: case.closed written once, on the case's platform firm, its payload the shared type (ids and facts: a CORPORATE pathway's case says CORPORATE; no reason words)
PASS  CS-C1 DW6 pass: case.reopened written once, with the stage it returned to and the outcome it had
PASS  CS-C1 DW6 fail: a forced rollback after the close writes none: no event, no audit line, the case still OPEN
PASS  CS-C1 DW6 fail: a forced rollback of a reopen writes no case.reopened; the case stays CLOSED
PASS  CS-C1 DW6 fail: four closes at the same instant → one 200, the rest 409; one case.closed (the case row is locked first)
PASS  CS-C1 DW7 fail: UPDATE on case_decision is refused by the database
PASS  CS-C1 DW7 fail: DELETE and TRUNCATE on case_decision are refused by the database
PASS  CS-C1 DW7 fail: a filing with a decision cannot be deleted on its own
PASS  CS-C1 DW7 fail: the database refuses a decision naming another firm, another case's filing, or a filing on a withdrawal
PASS  CS-C1 DW7 fail (break m6): the database refuses a decision on a filing not recorded as submitted
PASS  CS-C1 DW7 fail: the database refuses a closed case without its closing fields, or an open one keeping them
PASS  CS-C1 DW7 fail: a DELETE from inside another trigger is refused while the case exists (only the case's own cascade passes)
PASS  CS-C1 DW7 pass: deleting the case itself (as the demo reset does) removes its decisions with it
PASS  CS-C1 DW8 fail: firm B's token on firm A's case → 404 NOT_FOUND on all four routes; firm A's case unchanged
PASS  CS-C1 DW8 pass: firm B's own case answers firm B (201) and firm A's token on it → 404, firm B's case unchanged by A
PASS  CS-C1 DW8 fail: a malformed case id → 404, never a 500
PASS  CS-C1 W1 pass: open → submit (C8.2 record) → decision → close → reopen → close again; the outbox holds case.closed twice and case.reopened once, in that order
PASS  CS-C1 W1 pass: each step left one audit line on the case (decision, close, reopen, close)
```

Harness note: the file's usage line (`tsx studio/tests/check_csc1_close.ts`), run without `--tsconfig studio/api/tsconfig.json`, stops after M3 with "Parameter decorators only work when experimental decorators are enabled" (qa's first two attempts: 5 PASS, then the crash). It also leaves its two scratch databases behind (`xr_studio_csc1_<pid>`, `xr_studio_csc1_demo_<pid>`); qa dropped them.

## 2. CS-C1b builder test: `tsx --tsconfig studio/api/tsconfig.json studio/tests/check_csc1_count.ts 4470 xr_studio_qa77c`

Copy qa77c, :4470. Run 1: exit 0, `40/40 passed`. Run 2: exit 0, `40/40 passed`.

```
PASS  setup: the configured checkpoint (the copy's own server opens a case on it: startable), both Sample firms on the platform, the in-process app on the copy's database
PASS  CS-C1 DW9 fail: a case with one of two filings decided still counts (its count does not drop)
PASS  CS-C1 DW9 pass: the count drops by one when every filing of the case has a decision
PASS  CS-C1 DW9 fail: closing the decided case changes nothing more (after-decision work never counts)
PASS  CS-C1 DW9 pass: reopening it counts it again (+1), though its old decisions stay
PASS  CS-C1 DW9 pass: after the reopen it ends again only when every filing has a new decision (one new: still counts; both: -1)
PASS  CS-C1 DW9 pass (breaker M3): a decided case whose next stage has started counts again (its new stage has no decision)
PASS  CS-C1 DW9 fail (breaker M3): the ended stage's decided filing alone never ends the new stage: only a decision on the current stage's filing does (-1); the other case, on its new stage with no filing, still counts
PASS  CS-C1 DW10 pass: a case on a CORPORATE pathway counts as corporate (and not as individual)
PASS  CS-C1 DW10 fail: an individual and a family case count as individual, never corporate
PASS  CS-C1 DW14 fail: a withdrawn case does not count
PASS  CS-C1 DW14 pass: reopening the withdrawn case counts it again
PASS  CS-C1 DW12 fail: firm A's new cases never reach firm B's count
PASS  CS-C1 DW12 pass: firm B's case counts in firm B's count only
PASS  CS-C1 DW12 pass: firm B's decision moves firm B's count, not firm A's
PASS  PF-0c DW2 CaseCountPort fakeCaseCount: counts are whole numbers by group; an individual or family case adds to individual, a corporate one to corporate
PASS  PF-0c DW2 CaseCountPort fakeCaseCount: a decision on every filing or a withdrawal ends a case's count; a reopen counts it again
PASS  PF-0c DW2 CaseCountPort fakeCaseCount: another firm's adapter never counts this firm's cases
PASS  PF-0c DW2 CaseCountPort fakeCaseCount: a read inside a transaction gives the count that transaction sees (the same as outside with nothing pending)
PASS  PF-0c DW2 CaseCountPort fakeCaseCount: passes its contract (4 of 4 cases)
PASS  PF-0c DW2 CaseCountPort PgCaseCount: counts are whole numbers by group; an individual or family case adds to individual, a corporate one to corporate
PASS  PF-0c DW2 CaseCountPort PgCaseCount: a decision on every filing or a withdrawal ends a case's count; a reopen counts it again
PASS  PF-0c DW2 CaseCountPort PgCaseCount: another firm's adapter never counts this firm's cases
PASS  PF-0c DW2 CaseCountPort PgCaseCount: a read inside a transaction gives the count that transaction sees (the same as outside with nothing pending)
PASS  PF-0c DW2 CaseCountPort PgCaseCount: passes its contract (4 of 4 cases)
PASS  CS-C1 DW13 pass: the fake and the real adapter pass the same contract
PASS  CS-C1 DW13 fail: an adapter whose count ignores openings and endings fails the contract (its first two cases)
PASS  CS-C1 DW11 pass: with the allow-all fake (the default binding) opening behaves as today: 201 with a case number
PASS  CS-C1 DW11 pass: at limit N=12 with N−1 active, two openings in parallel → exactly one 201 (the Nth)
PASS  CS-C1 DW11 fail: the other parallel opening → 409 PLAN_LIMIT_REACHED with the metric and the limit
PASS  CS-C1 DW11 fail: with N active, one opening → 409 PLAN_LIMIT_REACHED
PASS  CS-C1 DW11 fail: the refused openings leave no case, no party and no case number (the counter and the party rows unchanged)
PASS  CS-C1 DW11 pass: the check ran with the opener's firm key, the individual metric and the count read in the opening's transaction
PASS  CS-C1 DW11 pass: ten openings at once from N−1 active → one 201, nine 409 PLAN_LIMIT_REACHED
PASS  CS-C1 DW11 pass (review M1): two openings with the same idempotency key at once, one below the limit → both 201 with the same case (one created, one replayed), never a 409
PASS  CS-C1 DW11 fail (review M1): now full, the same key again still replays its case (201), while a new opening is refused (409)
PASS  CS-C1 DW11 fail: on a CORPORATE pathway the opening is checked against active_corporate_cases (full → 409)
PASS  CS-C1 DW12 pass (API): firm A at its limit does not stop firm B: firm A 409, firm B 201 on its own count
PASS  CS-C1 DW11 pass: back on the allow-all fake, the next opening takes the next number with no gap
PASS  CS-C1 DW11 fail: the allow-all fake refuses nothing, at any count
```

## 3. C8.2 acceptance pack through gate B

Command: `AI_LIVE=off GATE_B_DATA=checkpoint GATE_B_NAME=qa77g GATE_B_PORT=4471 node tools/gate-b.mjs --title "C8.2" --kind code`

Run 1, exit 0:
```
Gate B: the PR names C8.2; claims Works for none (no bug check).
  packs: C8.2.test.ts
    C8.2.test.ts on the checkpoint: exit 0, 19/19 passed (248 s: copy 6, Load the configured checkpoint 115, run 128)
  packs took 249 s in all
Gate B: passed.
```
Run 2, exit 0:
```
Gate B: the PR names C8.2; claims Works for none (no bug check).
  packs: C8.2.test.ts
    C8.2.test.ts on the checkpoint: exit 0, 19/19 passed (269 s: copy 6, Load the configured checkpoint 127, run 136)
  packs took 270 s in all
Gate B: passed.
```

## 4. qa's check: `tests/qa/check_r177_case_decision.ts 4474 xr_studio_qa77a`

Copy qa77a, :4474, `PLATFORM_IDENTITY=local`, configured checkpoint. Run 1: exit 1, `45/46 passed`. Run 2: exit 1, `45/46 passed`. A diff of the line names between the runs shows none changed. The one FAIL is the screens Gap. qa's first draft run gave 43/46, because two of qa's own SQL reads were wrong (operator precedence, boolean text). Both were fixed in the check, not in the product.

```
PASS  setup: Demo › Load the configured checkpoint — 201
PASS  setup: the Sample firms' staff are on the copy (PF-3 seed) — {"firmsAdded":2,"staffAdded":4,"grantsAdded":6,"credentialsAdded":3,"subscriptionsAdded":2,"settingKeys":7,"unmatchedCaseFirmKeys":[]}
PASS  setup: owner, case manager, case officer and another firm's owner sign in (local stand-in, second step) — {"owner":true,"manager":true,"officer":true,"solo":true}
PASS  setup: the owner and the case manager hold agent/case:record-decision and agent/case:reopen; the case officer neither
PASS  R1.77 count (CS-C1b): a newly opened case is active (+1 individual) — {"before":1,"after":2}
PASS  C8.2 setup: case A's filing reaches Ready to file — ["1be9e753-6ccd-4631-a929-d740c82b6999"]
PASS  R1.77 fail: a decision on a filing not yet recorded as submitted is refused (409 NOT_SUBMITTED) — [409,"NOT_SUBMITTED"]
PASS  R1.77 / C8.2 pass: the submission is recorded with its application number (filing submitted, number shown) — [200,"submitted","V300177001"]
PASS  R1.77 / C8.2 data: filing_record keeps the number and the portal; the UCI is on the person
PASS  R1.77 fail: the case officer cannot record a decision (403 MISSING_PERMISSION) — [403,"MISSING_PERMISSION"]
PASS  R1.77 fail: x-actor alone (no staff session) is refused (401) — 401
PASS  R1.77 fail: another firm's owner gets 404 on this firm's case — 404
PASS  R1.77 fail: an outcome outside the list is refused on its field (400) — {"type":"https://expatready.local/problems/invalid","title":"Check the details","status":400,"detail":"One of APPROVED, REFUSED (Sample list).","message":"One of APPROVED, REFUSED 
PASS  R1.77 fail: close before every filing has a decision is refused (409 NOT_DECIDED) — [409,"NOT_DECIDED"]
PASS  R1.77 pass: the owner records a decision on the submitted filing (201) — [201,"APPROVED"]
PASS  R1.77 data: one DECISION row on the filing, with the outcome, date and who recorded it
PASS  R1.77 count (CS-C1b): with every filing decided the case is no longer active (-1) — {"before":2,"after":1}
PASS  R1.77 fail: a case with a decision cannot be withdrawn (409 HAS_DECISION) — [409,"HAS_DECISION"]
PASS  R1.77 data: the C8.2 record is unchanged by the decision
PASS  R1.77 fail: the case officer cannot close (403) — 403
PASS  R1.77 fail: close with a blank reason is refused on the reason field (400 REASON_REQUIRED) — [400,"REASON_REQUIRED"]
PASS  R1.77 pass: the case manager closes the case with a reason (200 CLOSED, CLOSED_BY_STAFF) — [200,"CLOSED"]
PASS  R1.77 data: the case row keeps the reason, the time and the stage it closed from
PASS  R1.77: the case read shows it closed (status CLOSED) — "CLOSED"
PASS  R1.77 fail: a closed case refuses a new decision (409 CASE_CLOSED) — [409,"CASE_CLOSED"]
PASS  R1.77 fail: the case officer cannot reopen (403) — 403
PASS  R1.77 fail: reopen with no reason is refused (400 REASON_REQUIRED) — [400,"REASON_REQUIRED"]
PASS  R1.77 pass: the owner reopens with a reason (200 OPEN), back at the stage it closed from — [200,"OPEN",true]
PASS  R1.77 data: reopened, the closing fields are cleared and the stage is still CURRENT
PASS  R1.77 count (CS-C1b): a reopened case is active again (+1) — {"closed":1,"reopened":2}
PASS  R1.77 fail: reopening an open case is refused (409 CASE_OPEN) — [409,"CASE_OPEN"]
PASS  R1.77 next step: after reopen a new decision is recorded (201, a second row) — 201
PASS  R1.77 count (CS-C1b): the new decision since the reopen ends its activity again (-1) — 1
PASS  R1.77 next step: the reopened case closes again (200 CLOSED) — 200
PASS  R1.77 audit: one line per step, each by a staff member, with its reason: decision, close, reopen, decision, close — ["case.decision.recorded|staff:d7c5c01e-6767-40d6-a884-2c7b9af59dce||","case.closed|staff:7c7e2dae-06f1-40b1-a948-6e96af962625|Visa appr
PASS  R1.77 audit: the reopen line keeps the old closing values (CLOSED_BY_STAFF)
PASS  R1.77 outbox: case.closed, case.reopened, case.closed, once each — ["case.closed:DECISION:CLOSED_BY_STAFF","case.reopened::CLOSED_BY_STAFF","case.closed:DECISION:CLOSED_BY_STAFF"]
PASS  R1.77 count (CS-C1b): case B opens active (+1) — 2
PASS  R1.77 fail: the case officer cannot withdraw (403) — 403
PASS  R1.77 fail: withdraw without a date is refused on its field (400) — {"withdrawnOn":"A real date as YYYY-MM-DD."}
PASS  R1.77 pass: the owner withdraws case B before any decision (200 CLOSED WITHDRAWN) — [200,"WITHDRAWN"]
PASS  R1.77 data: one WITHDRAWAL row (no filing) and the case keeps the withdrawal reason
PASS  R1.77 audit and outbox: case.withdrawn by staff with the reason; case.closed WITHDRAWAL — [["case.withdrawn|staff:d7c5c01e-6767-40d6-a884-2c7b9af59dce|Client withdrew before filing (Sample)|"],["case.closed:WITHDRAWAL:WITHDRAWN"]]
PASS  R1.77 count (CS-C1b): the withdrawn case no longer counts (-1) — 1
PASS  R1.77 next step: the withdrawn case reopens (200 OPEN) and counts again — [200,2]
FAIL  R1.77 person (Gap): a staff person can record a decision, close, reopen or withdraw a case from a screen (web/src calls none of the four routes: API only today) — []
45/46 passed
```

## 5. QA-397 retest: `tests/qa/check_qa397_draft_account_reaches_case.ts 4475 xr_studio_qa77q`

Copy qa77q, :4475. Run 1: exit 1, `5/6 passed`. Run 2: exit 1, `5/6 passed`.

```
PASS  setup: Demo › Load the configured checkpoint — 201
PASS  setup: the Visitor visa's released version names the APR Portal, as its draft does — {"released":"APR_PORTAL","before":"APR_PORTAL"}
PASS  setup: the author picks the PR Portal on the Forms tab (a draft change) — {"status":200}
PASS  setup: nothing was released; the released version still names the APR Portal — "APR_PORTAL"
FAIL  QA-397-1 fail today: the open case keeps the released account until the change is released (today: PR Portal at once) — {"portal":"PR_PORTAL","words":"Filed through PR Portal: set by the combination, not on the case"}
PASS  cleanup: the account is put back — 200
5/6 passed
```

On main, `api/src/case-prepare.ts` still reads `combination.portalKey` (lines 160, 177, 417, 718, 895), not the pinned release's `snapshot.combination.portal`.

## 6. Screens

A grep of `web/src` for `cases/${…}/(decisions|withdraw|close|reopen)` finds no file. The four routes (`POST /api/runtime/cases/:id/decisions|withdraw|close|reopen`) are API only. The case read (`GET /api/runtime/cases/:id`) gives `status` (OPEN/CLOSED) only: no reason, outcome or decision.
