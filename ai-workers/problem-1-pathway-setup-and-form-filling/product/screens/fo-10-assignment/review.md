# FO-10 part 1 review (PR #2476, commit 0d8b42d68, runtime, API only, no screen; migration)

Reviewer: Opus, fresh context. I did not build this and did not break it (P-303). Diff: `git diff origin/main..0d8b42d68`, 8 files, +445/-3.
Read: BACKLOG row FO-10; `trace-requirements.py --brief FO-10` (AG-2-13a, -13b, -13d; P-574 (3), P-570); the PR body; WAY-OF-WORKING; PF-12's migration header; the breaker's `break-report.md` (same commit).
Screen-only checks (concept, BIC scorecard, keyboard, 1024 px, zoom) do not apply: the row has no screen in this part.

## What I ran
* `tests/check_fo10_assignment.ts` at 0d8b42d: **35 passed, 0 failed** (9 s), matching the builder.
* `tests/check_pf12_walls.ts` at 0d8b42d: **99 passed, 1 failed**: "no platform_*, fo_* … table is without its forced policy — ["fo_assignment_rule"]" (B1).
* Drift: every migration applied to a scratch database, then `prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code`: "No difference detected".
* Mutations on a `git archive` copy of 0d8b42d in my scratchpad (deleted after), each with the PR's own suite:
  * `for update` dropped from the rule select (rules.ts:52): 2 tests fail, two runs, tallies [3,11,6] and [5,10,5]. The fairness tests are real.
  * Precedence order swapped (door before service): "a program/service rule beats the web-form rule" fails.
  * `s.status = 'ACTIVE'` dropped from `eligible()`: the "deactivated is skipped" and "nobody active" tests fail.
  * The owner-in-firm trigger removed from the migration: the "database refuses an owner of another firm" test fails. The raw-insert refusals are not passing for a wrong reason.
  * Probe (M1): a CASE_OFFICER grant ended plus READ_ONLY given → `save` of a turn of only that person **ACCEPTED**, and the next booking lead **owned by them**.
* `graph.mjs --check`: one G3 for this row (m1).
* Reviewer journeys over HTTP on an isolated copy (:4432, runtime ports): `journey-test-reviewer-2026-11-20.md`.

## Findings

### Blocker
* **B1. The new firm table ships without its PF-12 wall.** `prisma/migrations/20261120160000_fo10_assignment_rules/migration.sql:9-60` creates `fo_assignment_rule` with no `ENABLE/FORCE ROW LEVEL SECURITY` and no `pf12_firm` policy. PF-12's rule (its migration header): "Every later firm table ships its policy (tests/check_pf12_walls.ts)". That suite is red at this commit (line 100).
  * Scenario: the API runs as `xr_app` behind the walls. On every other `fo_` table a query that forgets `firmScope` returns nothing. On this table it returns and updates every firm's rules. Example: a later `findUnique({ where: { id } })` in part 2's automation action or the settings panel would let firm B read or switch off firm A's rule, and the database would not refuse it. CI's walls suite also stays red, so the PR cannot merge green.
  * Fix: append the two lines `platform_notification_preference` uses (`20261119180000_pf18a_notification_prefs/migration.sql:32-33`): `ALTER TABLE "fo_assignment_rule" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;` and `CREATE POLICY "pf12_firm" ON "fo_assignment_rule" USING ("firm_id" = platform_session_firm()) WITH CHECK ("firm_id" = platform_session_firm());`. Then run `check_pf12_walls.ts` and this suite. **Still open at 981dea1**, which touches no migration.

### Major
* **M1. Round robin counts ended role grants.** `api/src/front-office/assignment/rules.ts:35-36`: the `platform_role_grant` join has no `g.ended_at is null`. The guard, `catalogue.ts:61`, `retainers/service.ts:179` and every identity read all filter on it.
  * Scenario: the Owner moves a Case Officer to reception (`PATCH /api/platform/staff/:id/roles {"roles":["READ_ONLY"]}`). The person no longer holds `agent/prospect:edit` at the guard, but still takes every Nth web-form lead. They cannot Take or work those leads. Because the owner is active, the leads are not in Unassigned (`leads.ts:59`), so they drop out of everyone's queue (my probe; breaker Major 1). The same join lets `save` accept them into a named turn (rules.ts:95).
  * Fix: `and g.ended_at is null` (and `g.firm_id = s.firm_id`), plus a fail test. Done in 981dea1 (live J8 there: after the role change, leads alternate between the two remaining people).
* **M2. An OWNER rule may name someone who cannot work leads, and placement never re-checks the key.** `rules.ts:89` (save) and `rules.ts:55` (placement) check only `status = ACTIVE`.
  * Scenario: a rule naming an active Read-only person, or a person whose sales role later ends, sends every matching lead to someone the guard refuses on Take or edit. The lead is not in Unassigned either. This is the same lost-lead failure as M1, and it breaks the row's own fallback ("a rule that names an inactive person falls back to Unassigned").
  * The PR's question 3 argues manual Assign lists every active staff member. I concur with the breaker that a rule acting with nobody watching needs the round-robin test (`eligible()`). Done in 981dea1.

### Minor
* **m1.** `POST assignment-rules/:id/off` is reached by no HTTP test (graph G3). The 403 for a non-holder is asserted only from decorator metadata (`check_fo10_assignment.ts:89-92`). Line 92 passes all three routes to `assertEveryRouteDeclared` as `GET` on one path, so it would not notice a wrong method or path. My live J4 confirmed 403 `MISSING_PERMISSION` for a Case Officer, so this is a coverage gap only.
* **m2.** `rules.ts:52` locks the rule `FOR UPDATE` for OWNER rules too, which never write it. Every arrival a default-owner rule matches therefore waits behind the previous one's whole transaction (consent, audit, outbox) and behind any save or off. This is correct but serialises more than needed. Lock only when the strategy is ROUND_ROBIN, or read OWNER rules `FOR SHARE`.
* **m3.** `sales/arrival.ts:106`: the timeline shows "Lead L-00001 arrived by the web form, assigned to staff 6594d861-… by round robin". A raw id is shown to people, and the rule is not named in words. This follows the house pattern (`leads.ts:209`, `:276`), so it is for the screen part to resolve. Recorded under plain words.
* **m4.** I concur with breaker m3 (a deactivation racing an arrival; `leads.ts:59` keeps the lead visible), m4 (contradictory fields dropped silently; fixed in 981dea1), m5 (a retired service's rule cannot be re-saved; the list part is fixed in 981dea1) and m6 (the database does not check `eligible_staff_ids`/`last_staff_id` against the firm). Not repeated here.

## What held (0d8b42d)
* **Concurrency.** A single `ORDER BY … LIMIT 1 FOR UPDATE` row lock per rule, taken after arrive()'s sorted advisory locks. Nothing takes them in the reverse order (save and off lock only the rule; the FK to `fo_sales_setup` takes KEY SHARE), so there is no cycle. 20 parallel arrivals give 6/7/7. The cursor is "last id given", so a person dropping out shifts nobody's turn (AG-2-13d). The audit-failure rollback keeps the cursor. The breaker's run of off during arrivals fell through to the door rule with 0 Unassigned.
* **Precedence.** Service before door; criteria are unique per firm (check constraint plus unique index), so the order is deterministic.
* **Tenant isolation in the app.** Every query names `firm_id`, the raw SQL included. Updates go by an id read under the firm. Firm B gets an empty list and 404 on off (J7). Foreign services and staff get 422. The composite FK holds the service to the firm, and the trigger holds the owner. Only the database wall is missing (B1).
* **Keys.** `agent/prospect:configure-source` is held by OWNER and ADMIN only (seeded). Reassign stays `agent/prospect:assign`.
* **Migration.** Additive only (one enum, one table), no drift, MANUAL refused by both the API and a check. Reuses FO-1a's trigger functions, which PF-12 already gives to `xr_wall_reader`.
* **Audit.** One line per save. Off writes one line only when the rule changes (the second off has none). `lead.created` carries `assignmentRuleId/Strategy/Fallback`.
* **Deviation stated, not silent.** No PF-20 registration and no "needs you" item; the PR does not claim `Completes`, and splitting is allowed (WAY-OF-WORKING line 22). Those two Done-when lines stay open for part 2. The Lead rules on question 1.
* **For the founder (breaker's note, not settled here, AGENTS rule 2).** AG-02 v2.6 AG-2-85 (one sharing setting, least-recently-given, possible matches skip the rotation, booking host owns) differs from P-574 (3) and the row. The PR follows the row.

## Journey score (reviewer, the one score for this check)
**7½/10, below the bar** (1 · ½ · ½ · 1 · ½ · 1 · ½ · 1 · ½ · 1; table and fixes in `journey-test-reviewer-2026-11-20.md`). B1, then M1 and M2, raise it most.

## Not checked
A real `xr_app` walled server run of the arrival path with the policy added (it does not exist yet). The automation action and notification (not built). A person's unaided walk (no screen).
**Note:** the branch moved to **981dea1** at 09:20 UTC, during this review (the breaker's fixes for M1, M2 and m4-m5). I did not review that commit in full. It leaves B1 open. The live HTTP journeys ran on it because the shared checkout updated; the evidence for 0d8b42d above comes from the suite, the mutation runs and the probe on an archive of 0d8b42d.

**Verdict: Block.** To fix: B1 (Blocker: the PF-12 policy on `fo_assignment_rule`; `check_pf12_walls.ts` green), M1 (ended grants), M2 (OWNER key check). M1 and M2 appear fixed in 981dea1, which needs its own re-review together with the B1 fix.

Verdict: Block
