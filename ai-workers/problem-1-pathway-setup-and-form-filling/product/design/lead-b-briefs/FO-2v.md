# Brief: FO-2v, one "own versus all" rule for leads, swept (QA-477, QA-479; R1.6) (cloud builder lane; row owner Lead B)

Written 16 Nov 10:1x IST by Lead B (6), rev 16.53, for P-626: R1.6 is to be proven by 08:00 IST on 17 Nov. qa scored R1.6 Partial on #1929, held by QA-477 and QA-479 (J-6 break F2, F5). **Model: Opus 5.5, effort: high**: permissions; reviewer and breaker at high, P-605. **Starts when:** now. No open PR touches `front-office/sales/`; check at start.

**The rule, from the requirements** (AGENTS rule 2; Lead B's ruling, the release holder to note under P-423):
* **AG-2-64** is "the one home of the lead and prospect rule": a person with `agent/prospect:view.all` sees every lead; otherwise they see their own (rule 2 b–e); an unowned lead is seen with `view.all` or `assign`.
* **SA-6-24 / SA6-D1:** "a firm makes a role own-only by removing the `view.all` key".
* **Neither gives Owners or Admins all regardless.**
* PF-6b ruling 4 added the firm setting `platform.everyone_sees_all` ("off means each person sees their own") as an AND. So **the one rule** is: all = `agent/prospect:view.all` **and** the setting on; else own. Retainers already follow it (`retainers/service.ts` `seesAll`). Leads drop their `admin ||` (`sales/common.ts:60`), which no requirement backs.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-2v` and take **one row, FO-2v**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the requirement text: AG-2-64 (rules 1–7), AG-2-13c rule 6, AG-2-86 rule 3 and its edge cases (`AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md`), SA-6-24 (`SA-06-rbac_v3.15_2026-10-25.md`);
* on `main`: `api/src/front-office/sales/common.ts` (`visibilityOf`, `sees`), `sales/routes.ts`, `sales/leads.ts` (`take` and its shared change path, about line 206–222), `retainers/service.ts` (`seesAll`, the pattern to match), `platform/identity/keys.ts` (`@OwnOrAll`), `tests/check_pf6b_permission_rules.ts` (its sweep table);
* qa's `tests/qa/check_qa478_479_r16_breaks.ts` and `check_r16_permission_sweep.ts` (#1929).

**What to build:**
1. **`visibilityOf`:** `seesAll = everyone && keys.includes("agent/prospect:view.all")`, with no role override. Unassigned stays `view.all || assign` (AG-2-13c rule 6). One function serves the list, the read, the counts and every change path (AG-2-64 rule 3 "One server check").
2. **Mark and sweep:** `@OwnOrAll("agent/prospect")` goes on the leads list and the lead read routes. Add their {route, fixture} entries to PF-6b's sweep table, so the sweep fails if leads ever differ from retainers again.
3. **QA-479, Take on a lead the person cannot see** (AG-2-86 rule 3 and edge case "A user who cannot see the lead cannot take it"):
   * The answer is the same **404** as `GET`, with no owner named.
   * **The one exception is the real race of rule 3:** the lead was unowned until moments ago and someone else took it. It is shown only when the lead's owner was set by Take or assign **within the last 10 minutes** (Sample), from the owner-set time on the lead if one is stored. Then the answer is 409 "<name> already has this lead.", and `ownerStaffId` is never in the body.
   * If no owner-set time is stored, stop and ask in a PR comment: a column is a schema change outside this list.

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line). In `tests/check_fo2v_lead_visibility.ts`, a pass and a fail each, on the six seeded roles:
* `FO-2v DW1` (QA-477): with the setting off, the Owner and the Admin see only their own leads, the same as their retainers. With it on, holders of `view.all` see all. A role without `view.all` sees only its own, with the setting on or off.
* `FO-2v DW2`: the sweep runs on the leads routes. A test fixture where leads return another person's lead to an own-only viewer fails it (shown once, then removed).
* `FO-2v DW3` (QA-479): a Case Officer's Take on the Owner's own, never-unassigned lead → 404, with no name and no id. A real race (an unassigned lead taken a second earlier by someone else) → 409 with the name and no `ownerStaffId`.
* `FO-2v DW4`: qa's `check_qa478_479_r16_breaks.ts` QA-479 line and `check_r16_permission_sweep.ts` pass. FO-2's, FO-4's, PF-6b's and J-6's suites pass, except tests that asserted the Owner/Admin override, each named in the PR body under "Changed tests".

**Touch list:** `api/src/front-office/sales/common.ts`, `sales/routes.ts` (the two markers), `sales/leads.ts` (the take answer only), `tests/check_pf6b_permission_rules.ts` (the sweep table rows only), `tests/check_fo2v_lead_visibility.ts` (new), and only the existing tests named under "Changed tests".

**Duplicate check (P-526):** BACKLOG, open PRs (`sales/`, `OwnOrAll`), BUGS (QA-477, QA-479); one `Duplicate check:` line.

**Reviewer and breaker** (P-278: permissions). The breaker tries:
* the leads counts and search with the setting off;
* a Take by id on another firm's lead;
* a lead whose owner was deactivated.
The release holder reads the permissions diff before the label (P-423).

**P-610:** under 800 changed lines (estimate about 300).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
