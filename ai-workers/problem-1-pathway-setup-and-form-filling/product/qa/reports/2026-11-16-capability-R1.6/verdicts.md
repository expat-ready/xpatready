# Verdicts · capability R1.6 · main ddc6e919c (tree 64b53a515) · reader: fresh Opus, high effort, ran nothing (P-303) · 16 Nov 2026

**Read:** `qa/CAPABILITIES.md` row R1.6; `RULES.md` (P-339, P-348c, P-305, P-606, P-616) and `rules/works.md`; `DECISIONS.md` rows P-606, P-613, P-616; `MVP-CHECKLIST.md` row 6; `BACKLOG.md` rows PF-6b, PF-6, J-6, FO-3vr; qa skill §2, §4 and Gate A; `qa/built/J-6-part1.md`; `screens/J-6/` (review.md, break-report.md, journey-test-reviewer-2026-11-16.md); `check_pf6b_permission_rules.ts`, `journeys/j_6.ts`, `qa/check_r16_permission_sweep.ts`; `identity/{guard,keys,catalogue}.ts`, `sales/routes.ts`; SA-06 v3.15 MS-D21(10), §10b note, Appendix C; every file in this folder; the platform verdicts for style.
**My own reads:** `git rev-parse ddc6e919c^{tree}` = 64b53a515. Suite file: 499 PASS, 0 FAIL, 19 quarantined; pf6b 24 passed (job 133065965071), pf4 119/119 (job 133065965074); no `j_6` line (it runs in no workflow). qa's runs: pf6b 24/24, pf4 119/119, j_6 50/50 headed (xvfb) and headless, sweep 13/13 twice (the two PASS lists are identical). `git grep`: `@OwnOrAll` marks one route on main (`retainers/routes.ts:54`); the leads routes carry none. No guarded route names a MONEY key or a LICENCE key. `git show --stat 22c6272b0` (J-6's fix commit) names review M1, M2 and break F1, F4 only. `session/service.ts:96` (invitation accept) creates role grants with no money-keys line; `service.ts:242-244` (PATCH roles) writes it. `sales/common.ts:58-60` gives an Owner/Admin "all" whatever the setting; `retainers/service.ts:166-167` needs the setting on and view.all. `booking/service.ts:417-420`: anyone with `booking:list` gets every firm booking. `qa/BUGS.md` has no row for break F2, F3 or F5.

### R1.6 Permissions: deny by default, own versus all, money and licence apart — **Partial (unchanged)**, parts missing: PF-6 (screens; J-6 part 2); held by break F2 and F3 (Majors, not yet logged)
* **A route with no permission key is refused (403):** met, in a stricter form. An undeclared platform route stops the start-up, naming itself (`guard.ts` `assertEveryRouteDeclared`; pf4 "a platform route with no declared keys stops the start-up"); the runtime branch answers 403 `AUTHZ_UNCONFIGURED`. A missing key gives 403 `MISSING_PERMISSION` (pf4 line 30). qa's sweep: all 60 guarded handlers declare access; with no token every keys or any-staff route gives 401; per Sample person every route whose key they lack gives 403 (23, 18, 0 routes).
* **"Own" keys return only the person's own records, "all" the firm's:** met **for leads and retainers only**, and the two disagree. Leads: J-6 P1-A1, W2, W3 by role (no view.all) and by setting, with a real no-own-rule leg that fails (P1-NR). Retainers: PF-6b DW6, with its fail half. Open: break **F2 (Major, Conflict)**. With "everyone sees all" off, an Owner sees every lead but only their own retainers, for the same area `agent/prospect`. PF-6b's sweep cannot see this, because the leads routes are not marked `@OwnOrAll`. Not covered at all: bookings (FO-3vr, not built). An own-only person with `booking:list` still sees every firm booking.
* **Money keys never come with another key:** met as built and ruled (see the money finding below). DW3: no duty bundle in `keys.ts` holds a MONEY key, and the start-up refuses one that does. DW4 and J-6 P1-A3: a role that brings MONEY keys writes its own audit line, and Read-only writes none. The sweep: the Case Officer holds exactly SA-06's four, and Read-only holds none. Open: break **F3 (Major, Gap, PF-6b ruling 2 (b))**. Giving Billing/Finance through an invitation hands out 15 money keys with no `money_keys_granted` line. My read of the code agrees. qa's "no route mixes money with general" passes because no route names a money key (vacuous).
* **Licence keys never come with another key:** met at the API only (the licence finding is below).
* **Wrong role by URL refused on screen and API:** met on the Leads screen. A Case Officer typing `?view=unassigned` lands on Mine; the API answers 403. Wrong person and wrong firm give "Lead not found" and 404. No other screen marks own versus all yet.
* **Gate A:** J-6 walks by screens to row 5's first step (Invite staff). That step is by API only, because PF-6 has no screen. The walk is not on GitHub's runners (no workflow runs `journeys/`). The packs that are (pf6b, pf4) carry the API half (P-339).

### Rulings
* **P-606 does not allow Works now.** The qa skill's rule: score only when every part has merged, which the checklist row shows. Row 6 lists "PF-4, PF-6" and says "Shaped". J-6's own row joins "PF-6b · PF-6's two Done when lines", and PF-6 is not built. The Lead's request does not amend a founder rule on main, and A6 is on another branch, unread. The question decides nothing anyway: F2 and F3 hold the row Partial under P-305. **Once F2 and F3 are closed, the Lead can rule that the capability text is met without the role editor.** If so, part 2 must re-prove four things when it merges:
  * PF-6 DWn: money and licence keys sit in their own groups in the role editor, ticked one by one;
  * PF-6 DWn+1: the own-only sweep holds in every list the screens show;
  * the Invite step walked on screen;
  * the role copy made through the editor, not by SQL.
* **Licence: met for the rule, unproven in the running app.** The check is generic and fails closed:
  * the guard reads the code's own list as well as the catalogue;
  * a catalogue edited to GENERAL stops the start-up;
  * without the key it is still `MISSING_PERMISSION`.

  It is seen only on PF-6b's test route (DW5, pass and fail). No route on main names a LICENCE key, so nothing reachable can skip it today. Case-side approval still goes through `engine/runtime/team.ts` duties, not this guard. This does not hold R1.6. The first real LICENCE route (form approve, countersign) must add a NOT_LICENSED pass and fail on itself.
* **Money wording: settled by SA-06; a Minor records finding.** SA-06 v3.15 MS-D21(10) (the product owner, 25 Oct) and Appendix C give MONEY keys to five starter roles:
  * the Case Officer's draft `invoice:create` and `expense:create`, plus `invoice:list` and `:show` on visible records;
  * Billing/Finance's whole job.

  Read literally, "No starter-role bundle hands out a money key" contradicts the requirement, and requirements come first (AGENTS 2). What was built and tested is the narrower rule: no duty bundle implies a money key, and each is a role's own tick. **Ambiguity · Minor, R1.6, records:** reword the PF-6b row and R1.6's Done when to say that.

### Findings (none logged yet; for `qa/BUGS.md`)
1. **Conflict · Major · R1.6 (own versus all) · SA-6-24 vs AG-2-13c** (break F2, still on main). With the setting off, an Owner or Admin sees every lead but not every retainer. The leads routes carry no `@OwnOrAll`. Owner: runtime, with the founder or Lead B ruling which rule wins.
2. **Gap · Major · R1.6 (money apart) · PF-6b ruling 2 (b)** (break F3, still on main). An invitation that is accepted into a money-bearing role writes no money-keys audit line (`session/service.ts:96`). Owner: runtime (platform).
3. **Bug · Minor · FO-2 / R1.6 · AG-2-86 rule 3** (break F5). `POST leads/:id/take` on a lead the person cannot see answers 409 naming its owner, where it should give 404.
4. **Ambiguity · Minor · R1.6 records:** the money wording above.

### Weak evidence
* "Visible browser" means headed under xvfb only. No person watched it; D17 and D20 are simulated.
* qa's sweep reads routes from source text by regex, not from the app's reflection, as PF-6b does. Three draft faults were fixed before the green runs.
* Its money-mix and licence lines are vacuous: no route names such a key.
* Own versus all is shown on 2 areas (leads, retainers) of the many with view.own/view.all keys. PF-6b DW6 sweeps one route.
* Only 3 Sample staff were swept (Case Officer, Case Manager, Owner+Case Manager). Admin, Billing/Finance and Read-only were never signed in as people.
* `j_6.ts` starts `tsx` by bare name (it failed 45/50 until PATH was set). It is a portability point, not an app fault.

### For the Lead
* R1.6 stays **Partial**: parts missing (PF-6), plus F2 and F3 (Majors). Please log the four findings, or confirm that qa logs them on its records PR.
* Rule F2 (with Lead B or the founder): does the Owner's "all" on leads beat the firm setting, or must retainers follow leads?
* Choose whether bookings (FO-3vr) are a part of R1.6's "own" clause. If they are, add the row to checklist row 6.
* Reword PF-6b's money line and R1.6's Done when to "no duty or bundle implies a money key; each is ticked on its own".
