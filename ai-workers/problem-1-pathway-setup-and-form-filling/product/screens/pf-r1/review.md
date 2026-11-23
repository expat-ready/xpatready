# PF-R1 review: reporting service and its one door (runtime lane, API only)

Reviewer (did not build it), 23 Nov 2026 · branch `claude/runtime-pfr1-reports` · commit `d3679946b3a359163e6b942721d8be3174723d32` · row BACKLOG.md:1107 · source AG-14 v1.14 (requirements-2026-11-02).
Overall: **Ship after fixes**. Two Majors are open, so this is not an Approve. Journey score **7.5 / 10** (6 of the 8 criteria that apply; below the pass mark): `journey-test-reviewer-2026-11-23.md`.

## What I ran
* `npx tsx --tsconfig api/tsconfig.json tests/check_pfr1_reports.ts`: **52 passed, 0 failed** (7 s). The MetricsPort contract ran on `fakeMetrics` and on `MetricRegistry` (5 of 5 each).
* **Mutation runs in a scratch worktree, deleted afterwards.** (1) I removed the own-scope narrowing (`narrowed = filters`): 8 checks FAIL (contract on both adapters, DW1 fail, DW2 pass, DW3 Case Officer, DW8 own drill). (2) I let the body's `scope` decide: 6 checks FAIL (contract on both adapters, DW2 pass and fail). So the scope rule and the narrowing are really held by tests.
* **HTTP on an isolated copy at :4431 (runtime ports; never :4400), local sign-in as user-R, user-O and user-S.** Dashboards answer 200 in 13–28 ms. Rep, OWNER and `..%2Fowner` answer 404. No token answers 401. On the query door, an empty list, 31 metrics, start after end, a non-uuid person, a bad client type, an array body and an extra key all answer 400 QUERY_INVALID with `fields`. Bad JSON answers 400 BODY_NOT_JSON. An unknown key answers 400 UNKNOWN_METRIC, and a 20,000-character key is cut to 80 characters in the answer. GET and DELETE on `query` answer 404.
* **Probe through the fake (scratch script):** a Case Manager key set (view.own, view.all, export, no view-financial) reads a MONEY metric at scope `all` and gets the firm-wide figure (Major 1). A read that never settles keeps the whole answer waiting (Minor 1).

## Done-when lines (each needs a pass and a fail)
| Done-when | Test (check_pfr1_reports.ts) | Holds? |
|---|---|---|
| Case Officer (view.own) gets own figures; the Owner gets firm-wide | DW1 pass/fail :118-122. The mutation proved it. | Yes |
| A scope sent in the request is ignored | DW2 pass/fail :126-129, plus the contract. The mutation proved it. | Yes |
| Money in CAD and USD gives two figures, never one total | DW3 :134-141. `Reading` refuses a `total` or the same currency twice. | Yes, but see Major 1 on who may read money |
| An unknown metric key gives 400 | DW4 :145-147 | Yes |
| A filter that fails its schema gives 400 with the message | DW5 :151-155 | Yes |
| Firm A never counts firm B's rows | DW6 :159-164. Reads go through `xr_app` under PF-12's walls; there is also a check with no firm at all. | Yes |
| A registered metric that reads over budget fails the budget test | DW7 :171-176 | Yes for the test's own registry. Major 2: no CI step reads the app's registry |
| Followed by someone without the target's key, the drill target gives 403 | DW8 :181-191. PF-4's real `PlatformGuard` runs on `SalesController.list`. | Yes |
Row points (2) and (6): the four dashboards, registered:false, 404 and 403 are covered at :195-202. The catalogue defaults are at :208-210, and I checked them against the PF-3 migration and AG-14 §10.

## The builder's judgment calls
(a) No migration: **agreed**. The keys and the SA6-D1 defaults are already in `20261114015002_pf3_platform_tables`, and (6) checks them. · (b) AnyStaff plus a check in the door: **agreed**. This follows the find and complaints routes, and the 403 is tested. · (c) 400, not PF-28's 422: **agreed**. The row says 400 and AG-14-30 allows it. A body `scope` is accepted and never read, which the mutation confirms. · (d) OWN_ONLY 403 and WITHHELD: **agreed**. They narrow and never widen (AG-14-20). · (e) Money at the base scope without view-financial: **not agreed**, see Major 1. · (f) Dashboard keys chosen here: **agreed**. Labels come from the registry and widgets say registered:false until the metric exists. · (g) The budget as a CI function: **agreed as the rule**, but the CI step is missing (Major 2). A runtime cap is Minor 1. · (h) The drill 403 through PF-4's guard: **agreed**. It is the real guard on the real handler.

## The other checks
Scope never comes from the request: **met**. `scopeFor` reads only `caller.keys` (ports/metrics.ts:107), and the request's `scope` is `z.unknown()` and never read. · Nothing leaks across firms: **met**. The global FirmWallsInterceptor opens the firm, reads get `ctx.firmId`, and DW6 shows that the wall is what holds. · Error words never reach the answer: **met**. Any throw or wrong shape becomes UNAVAILABLE with no reading, and the log has only the key and ERROR or SHAPE (registry.ts:19, contract case 5). · The fake and the real registry share one rule: **met**. Both call `checkRegistration` and `runMetrics`, and both run one contract.

## D1–D20 (API row; screen dimensions N/A)
D1 Requirement fit 3/5: Major 1 goes against AG-14-35, -36 and -37 and §2 l.179 · D2 Data integrity 5/5: writes nothing (AG-14-1), Zod is strict and the key duplicate check is tested · D3 Reuse 5/5: one `MetricDefinition` shape for both sides (AG-14-4, Lead 52) · D4 Rule integrity 4/5: the MONEY⇔PER_CURRENCY rule is enforced at registration · D5 Stability 3/5: a read that never settles holds the whole answer (Minor 1) · D6 Freshness N/A · D7 AI trust N/A (no AI) · D8–D14 N/A (no screen) · D10 Language 4/5: the door's own words are plain, but Zod's default words still show (Minor 3) · D11 Feedback 5/5: each metric answers OK, WITHHELD or UNAVAILABLE · D15 Speed 5/5: 10–30 ms over HTTP and DW7 under 200 ms on about 5,000 rows · D16 Testability 4/5: every line has a pass and a fail, but no CI check sweeps the app's registry (Major 2) · D17 and D20: simulated only (no intended user, no screen) · D18 Provenance 5/5: each figure carries its `source` words and its drill target · D19 Closure: partly, because the figures arrive with PF-R2fo, PF-R2cm and CS-R1 by design.

## Not checked
There is no browser walk and no BIC scorecard, because the row has no screen (BIC N/A). `graph.mjs` ran, but GRAPH.md does not list API-only rows, so the graph check does not apply. PR body: I did not read it, so I cannot say whether it names (a)'s "no catalogue lines changed". No real screen reader and no intended user.

Verdict: Changes

**Blockers:** none.

**Majors**
1. **Money figures are answered without `view-financial`.** Where: `ports/metrics.ts:107-109` (`scopeFor`), `tests/check_pfr1_reports.ts:141`, `ports/contracts/metrics-port.contract.ts:39`. A Case Manager (view.all, no view-financial in the seed) reads firm-wide fees at scope `all`, and the Case Officer reads own money. The source says money needs view-financial: AG-14-35 ("paid-consult revenue SHALL need `agent/report:view-financial`"), AG-14-36 ("Uses `agent/report:view-financial` like every money figure here"), AG-14-37, and §2 l.179 ("firm-wide financial reports come from `view-financial`, not from `view.all`"). §10 l.651's "(Owner and Admin also see financials through `view.all`)" is still true, because both hold view-financial in the seed. The row is a permissions breaker. **Fix:** make `scopeFor` return `kind === "MONEY" ? (keys.includes(REPORT_KEYS.financial) ? "financial" : null) : baseScope(keys)`, which answers WITHHELD. Turn DW3's Case Officer check into a fail case (WITHHELD, no reading). Add a Case Manager (view.all without view-financial) WITHHELD case to the test and the contract. If the builder reads the source otherwise, put it in `screens/pf-r1/challenge.md` for the Lead or founder; do not settle it in code.
2. **Row (7) "a metric over the read budget fails CI" is not wired to the app's metrics.** Where: `tests/check_pfr1_reports.ts:166-176` runs `overBudget` only on a registry built inside the test. Nothing reads the metrics that PF-R2fo, PF-R2cm and CS-R1 will register on the app's `MetricRegistry` (registry.ts:17 `all()` has no CI caller). A slow metric added later passes CI unless its own row remembers to time it. **Fix:** in this test, build the app's registry the way start-up does (the feature files and providers that register metrics) and run `overBudget(registry.all(), [owner all, officer own, solo all])` over the ~5,000-row data. Today it times nothing, and every later registration is caught automatically. If booting is too heavy, add a sweep in the PF-6b style: every `register({ key: … })` under `api/src` must be named in a budget list here, and an unnamed key fails.

**Minors**
1. `ports/metrics.ts:130`: there is no time limit per read. A read that never settles holds the whole answer (probe: still waiting after 3 s). Race each read against a cap (for example 10× the budget), answer UNAVAILABLE, and log TIMEOUT.
2. `tools/check-port-contracts.mjs --list` sees only the real MetricRegistry ("MetricsPort ×1"), because `fakeMetrics` is in `ports/fakes/` (the path the row asks for). If the fake's `runContract` call (check_pfr1_reports.ts:49) were deleted, nothing static would notice. Note it in the PR for PF-0c's checker (eligibility.fake.ts has the same gap).
3. Zod's default words reach the 400 answer: "Unrecognized key: \"extra\"", "Invalid input: expected object, received array", "Invalid option: expected one of…" (seen over HTTP). AG-14-30 asks for a plain, localisable message. Give the body, the filter keys and `clientType` their own messages, as `DAY` and `staffId` already have.
4. `ports/metrics.ts:65`: each metric key in the request is a bare `z.string()`. Use `MetricKey`, so that a malformed key is QUERY_INVALID naming the field instead of being echoed back as UNKNOWN_METRIC.
