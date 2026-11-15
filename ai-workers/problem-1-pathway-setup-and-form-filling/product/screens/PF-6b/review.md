# PF-6b review: own versus all, money and licence apart (PR #1808)

Reviewer: independent Opus reviewer, did not build it. Commit reviewed: `4e2fddb24d12333a701016615bf720ad49bcdc9b` (branch `claude/keen-feynman-kp5z54`, diff `origin/main...4e2fddb2`, 10 files, +423/-12, under P-610's 800). Read against Lead B's brief `design/lead-b-briefs/PF-6b.md` (rulings 1-4), the PR body, the three PR comments (Q1 settled as P-612; Q2, Q3 agreed) and SA-06 v3.15.

**Scope of this review:** API + schema row, no screen. The screen dimensions (D1-D20 screen parts, keyboard, 1024 px, 200 % zoom, PRODUCT.md §3-§4 menu words, BIC-01..BIC-20 scorecard, screenshots) are **N/A** and were skipped. The P-86 graph was not regenerated (it writes `qa/GRAPH.md`, outside this review's two files).

## What I ran (on the PR head, Postgres 127.0.0.1:54329, scratch databases; never :4400)
* `tests/check_pf6b_permission_rules.ts`: **22 passed, 0 failed**.
* Existing suites, unchanged: FO-5 retainers 232/232 · PF-4 identity 113/113 (part B against an isolated copy of the real `main.ts` on :4436, so the guard's new start-up catalogue read and money check boot cleanly) · PF-3 75/75 · PF-21 107/107 · PF-25 68/68 · FO-13 76/76 · FO-1a 124/124 · FO-1b 80/80 · PF-19a 76/76 · FO-3 125/125 · PF-1 28/28.
* API journey on an isolated copy (:4437): see `journey-test-reviewer-2026-11-15.md`.
* `git merge-tree` with today's `origin/main` (5afb2a623): merges clean; main's drift since the base is port contracts and tests only, none in the touched files.

## Named cases (P-606): one case per Done-when line, ticked against `tests/check_pf6b_permission_rules.ts`
- [x] **DW1** pass :91 (233 role keys, 10 declared keys, 25 platform routes all catalogued) · fail :93-95 (`agent/made-up:thing` on a probe route is named).
- [x] **DW2** pass :99-103 (every row = `scopeOf`/`classOf`; LICENCE set = `DUTY_KEYS.represent`; spot checks) · fail :104-105 (`case:view.all` as NONE named) and :106-108 (the database's CHECK refuses it too).
- [x] **DW3** pass :123-124 · fail :125 (the function) and :126-129 (a `test_bundle` with `agent/payment:record` stops a real Nest start-up through the guard's `onModuleInit`).
- [x] **DW4** pass :147-151 (Billing/Finance: its own `platform.staff.money_keys_granted` line, keys equal the catalogue's MONEY keys of the role, one roles line beside it) · fail :152-154 (Read-only: no line).
- [x] **DW5** fail :160-164 (unlicensed Case Manager holding `agent/case:form-approve` → 403 `NOT_LICENSED`, exact text) · pass :165-167 (licence record back → 200) · extra :168-169 (no key stays `MISSING_PERMISSION`). Test route lives in the test file only (ruling 3).
- [x] **DW6** pass :213-214 (view.all holder sees both, own-only role copy sees only theirs, representative always theirs, firm B 404, setting off makes everyone own-only) · fail :215-217 (a leaky reader is caught three ways). Removing either half of `seesAll` makes :213 fail (setting ignored → "off: view.all holder sees X2"; key ignored → "on: own-only sees X1").
- [x] **DW7** pass :221 · fail :222-223 (`UnsweptProbe.list` named).
- [x] **DW8** :64-81: stamp unique and not `all.at(-1)` (rev 16.7); demo-shaped seed before; no table before; right after its own migration one row per distinct key (233) and no role-permission row orphaned; then the rest; `migrate diff` names nothing of the catalogue. "Every existing PF/FO suite passes unchanged" is not a case in this file by design; I verified it by running the eleven suites above (all green).

No Done-when line is without a case.

## Brief rulings checked
* **Ruling 1:** new area file `prisma/schema/platform-permissions.prisma`, own migration `20261115120000_pf6b_permission_catalogue`, additive, no FK, `platform_role_permission` untouched, rollback line present. Counts on the copy: 233 rows, 16 MONEY, 3 LICENCE; 7 OWN, 7 ALL. SQL `CASE` and `catalogue.ts` `classOf` agree (DW2). Stamp is later than every migration on `origin/main` (newest `20261115013000_fo13_compliance_tables`).
* **Classification table:** the SA-06 quote is exact: `SA-06-rbac_v3.15_2026-10-25.md:1170`, "Money keys, no new key. … Bill this and Add cost make a draft with `agent/invoice:create` and `agent/expense:create`, which a Case Officer holds". `expense:create` as MONEY is justified; `expense:edit/list`, `subscription*` stay GENERAL. Consequence (correct by the rule): assigning Case Officer also writes a money-keys line.
* **Ruling 2:** start-up check in the guard (`guard.ts:66-73`), code-and-data (`classOf` fallback, `catalogue.ts:43`); audit line inside the same transaction, before the event (event stays last, m8); detail is key names and role codes only, no values (AG-1-31).
* **Ruling 3 / P-612:** `guard.ts:89`; `isLicensed` = a credential row in the firm (the model has no status field, so "active" = present). No route in `api/src` declares a LICENCE key, so nobody's behaviour changes today. No licence number passes through the process or the logs (DW5 moves the row aside inside SQL).
* **Ruling 4:** `seesAll` = setting AND live `agent/prospect:view.all` grant (`service.ts:164-166`); both `prospectFor` (:187) and `visible` (:197) use it; firm scope stays first (`firmId` in both `findFirst`). All six starter roles hold `prospect:view.all`, so starter behaviour is unchanged (FO-5's 232 cases green).

## Findings
**Blocker:** none. **Major:** none.

**Minor** (fix in this PR before the label, or record as accepted):
1. **Row owner's three asks after P-612 are not in the commit** (Lead B comment 07:39 UTC, commit 07:39:43). (a) `guard.ts:89` cites "PF-6b ruling 3" but not **P-612** (the recorded departure from SA-6-27); a later reader seeing SA-6-27 ("the permission system never checks licence") would take the check for a bug and remove it. (b) `service.ts:163` does not say **why** it reads live grants and not `ctx.keys` (FO-5's `keys: []` contexts). (c) PR body still lacks "Settled: P-612 (departure from SA-6-27; Unconfirmed: no counsel)". Also the body's "Checks and results" is still "(filled at CHECK)": the brief requires the shard suite result lines before the label.
2. **Licence check is data-only and fails open** (`guard.ts:66-69`, `:89`): the money start-up check falls back on code (`classOf`), the licence set does not. Scenario: a catalogue row of `agent/retainer:countersign` edited to `GENERAL` (or a future sign-off key added to `DUTY_KEYS.represent` and seeded without its row) → the guard lets an unlicensed holder through with no start-up error. DW1/DW2 catch both in CI, so the risk is only a hand-edited database; fix is one line (union with `LICENCE_KEYS`, or assert at start-up that the LICENCE rows equal `DUTY_KEYS.represent`).
3. **The sweep reads the service, not the route** (`check_pf6b_permission_rules.ts:199`): the SWEEP entry for `RetainersController.read` calls `svc.read`, so a later change in the controller (e.g. the route calling a new unfiltered method) would still pass DW6. Ruling 4 asks for a route sweep; calling `GET /api/front-office/retainers/:id` through the test app with each viewer's token would make it exact. Not a leak today (`routes.ts:55` calls `svc.read`).

**Notes (not findings):** the other record-returning routes (`PATCH retainers/:id`, `download-link`, `files/:token`) go through the same `visible()` and so follow the rule, but carry no `@OwnOrAll` (ruling 4 and Lead B's Q2 answer limit the marker to list/show). Invitations can carry Billing/Finance today and write no money-keys line; ruling 2(b) is about assigning, and invitation acceptance (which would create the grant) is not built yet: the row that builds it must write the line. The API now needs the catalogue table to start (`onModuleInit` awaits it); `start.sh` runs `migrate deploy` first and PF-4 part B booted fine. An open PR that seeds new permission keys must re-stamp after this one and add its catalogue rows (DW1 will tell it).

## Journey score (one score for this check)
**9 / 10** (pass; no criterion at 0), API-level journeys, two UI criteria N/A counted as met: `screens/PF-6b/journey-test-reviewer-2026-11-15.md`.

## Could not check
No screen (API only). No real Cognito sign-in (local stand-in only). CI on `main` merged into the branch not run here (merge is clean). The release holder's own read of the migration and guard diff (P-423, P-600) is still due before the label.

Verdict: Approve 4e2fddb24d12333a701016615bf720ad49bcdc9b

## Re-review (diff 4e2fddb..541ae0d)
This re-review reads only `git diff 4e2fddb2 541ae0d3 -- …/prototype` (4 files, +31/-10), per P-277. I ran `check_pf6b_permission_rules.ts` at 541ae0d in a separate worktree: **24 passed, 0 failed**.
* **m1 (fixed):** `guard.ts:93-95` now cites P-612 next to the check: the founder's "keep the check", a recorded departure from SA-6-27, Unconfirmed: no counsel. The `seesAll` comment (`service.ts:163-165`) says why it reads live grants and not `req.platform.keys`. The PR body items are for the builder to fill; they are not code.
* **m2 (fixed, fail closed):** `guard.ts:67-73`. The licence set is now `LICENCE_KEYS` ∪ the catalogue's LICENCE rows, so an edited or missing row can no longer switch the check off. A catalogue that disagrees with `catalogueMismatches` throws inside `licenceKeys()`, which stops the start-up. A failure resets the cached promise, so a later request retries and never keeps a half-built set. New DW5 fail cases: `:169-171` shows a sign-off key edited to GENERAL stopping the start-up, naming the key; `:172-177` shows that with the catalogue emptied, an unlicensed holder still gets 403 `NOT_LICENSED`. Both put the data back before continuing. Removing the `LICENCE_KEYS` union makes `:177` fail.
* **Breaker m2 (fixed):** `service.ts:238-242` (identity). The money-keys line names only the added roles that bring a money key. It costs one small query per added role (at most six), inside the same transaction, and the event is still written last. DW4 (`:147-151`) assigns Case Officer + Read-only + Billing/Finance; O already holds Case Officer, so the added roles are Read-only and Billing/Finance, and the line expects `roles = BILLING_FINANCE` only. Key names only, no values (AG-1-31).
* **m3 (accepted as a listed Minor):** the sweep still calls `svc.read`. `RetainersController.read` is a one-line pass-through today (`routes.ts:55`). This stays open as a known limit and is not blocking.
* No new findings. Nothing in this diff changes the starter roles or any FO/PF behaviour beyond the guard start-up check, and the real catalogue passes that check (DW2). The journey score stands at 9/10.

Verdict: Approve 541ae0d38edd79046bf85cba8bc6c1ead8241f34
