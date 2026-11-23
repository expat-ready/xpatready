# PF-R1 break report (reports API, permissions)

Branch `claude/runtime-pfr1-reports` at d3679946b. Breaker run 23 Nov 2026. No screen, so the attacks went through `ReportsController`, `MetricRegistry`, `fakeMetrics` and `runMetrics`, called the way `tests/check_pfr1_reports.ts` calls them. Two scratch scripts sat outside the repo: port and controller probes, plus one probe on a scratch database `xr_studio_pfr1break_<pid>` on 127.0.0.1:54329 with every migration, both Sample firms and 5,000 firm-B leads. The database was dropped afterwards. The row's own test passes: 52 passed, 0 failed. No code was changed. All values are Sample.

## Findings

**M1 (Major): the read cannot apply the viewer's record visibility, so `report:view.all` widens past it (AG-14-19, BR-2, SA6-D6).** `MetricReadContext` holds only `{ firmId, staffId, scope }` (`ports/metrics.ts:82`, call at `:136`). A read never sees the caller's `agent/prospect|client|case|task` `view.own`/`view.all` keys, or the firm's "everyone sees all" switch (PF-6b). AG-14-19 says "no list row or drill-through may include a record the viewer cannot open", and the v1.8 note says the report keys "can only narrow that, never widen it".
*Repro:* take Case Manager's seeded keys and remove `agent/prospect:view.all`, as a firm may (SA6-D1). Query a lead-count metric. Expected: the leads they may open (1). Actual: 3, the firm-wide figure. A LIST metric would list the other people's leads the same way.
*Fix:* pass the caller's keys, or a resolved `visibility(area) → own|all` helper, in `MetricReadContext`. Add a contract case for it now, before CS-R1 and PF-R2 build on the shape.

**M2 (Major): money tables cannot be read firm-wide by Billing / Finance.** `scopeFor` grants `financial` only when `kind === "MONEY"` (`:107-110`). A MONEY reading is at most 2 bare figures with no breakdown (`:75`). The refine stops any non-MONEY metric being `PER_CURRENCY` (`:50`). So overdue ageing (5 buckets per currency), tax collected per tax name and overdue by client (AG-14-14, -37) must be registered as LIST with `moneyTreatment: NONE`. They are then read at the base scope, `own` for Billing / Finance.
*Repro:* register `money.overdue_ageing` as LIST/SUM/NONE and query it as Billing / Finance (`view.own` + `view-financial`). The answer is `scope: "own"` and the read gets `staffId` = the viewer. Registering it as LIST + PER_CURRENCY is refused. A MONEY reading with 3 buckets is UNAVAILABLE. This hits two of the five widgets on the seeded Billing / Finance dashboard (`dashboards.ts:33-34`). Those LIST money columns also get no per-currency check (AG-14-15).
*Fix:* allow `PER_CURRENCY` on LIST (each row then needs a `currency` in CAD|USD and amounts in the Money pattern). Key `financial` on `moneyTreatment === "PER_CURRENCY"`, not on `kind`.

**M3 (Major): the CI read budget can pass without reading anything.** `overBudget` (`:164-173`) calls `m.read(ctx, …)` without entering `ctx.firmId`'s firm context. Under PF-12's walls a read outside a firm sees no rows.
*Repro:* run `overBudget(reg.all(), [{ firmId: B, … }])` outside `withFirm`. The read counted 0 of firm B's 5,000 rows and the result was `[]` (a pass). Inside `withFirm(B)` it counted 5,000. Run under `withFirm(A)` with a context naming firm B, it counted firm A's 3 rows, so `ctx.firmId` is ignored.
Nothing yet runs the app's real registry through the budget, so each later row must remember to call it, and to call it correctly. Row (7)'s "fails CI" guarantee rests on that.
*Fix:* make `overBudget` take a `runAs(firmId, fn)` (the port imports only zod) or move it into the api registry with `withFirm`. Refuse a run in which every read returned 0 rows. Add a test that boots the app's registry and sweeps `all()` on the 100-firm data.

**M4 (Major): a registration can produce a drill link wider than its figure (AG-14-22, "carrying the exact filter").** `checkRegistration` (`:154-160`) accepts a `scopeAware` metric whose `drillTarget.carries` leaves out `staffId` or `clientType`, or maps two filters to the same parameter.
*Repro:* a Case Officer queries a figure whose carries are `{from,to}` with `clientType: CORPORATE`. The figure is own-scope, but the drill is `query: {}`, which opens the firm-wide list of every client type. Carries `{from:"d", to:"d"}` give `query: {d: "<to>"}`, so `from` is silently lost.
The target re-checks its own keys, so nothing leaks. But the drilled list will not reconcile with the figure, and AG-14-22 says it must.
*Fix:* at registration, require `carries.staffId` when `scopeAware` and `carries.clientType` when the metric honours the segmenter, and reject duplicate target names.

**m1 (Minor): hostile input is echoed back in error answers.** `fieldsOfIssues`/zod (`:114`, `:122`) put every unrecognised key, word for word, into both `detail` and `fields`. ProblemErrors adds a third copy as `message` (`main.ts:185`).
*Repro:* 2,000 filter keys of the form `k0_xxx…<img src=x onerror=alert(1)>` produce a 155 KB `detail` and a 159 KB `fields`. A request within the 256 KB limit gives roughly a 470 KB answer.
UNKNOWN_METRIC (`:126`) caps each key at 80 characters and 5 keys, but keeps RTL-override, CR/LF and HTML (`‮gnp.exe<script>…\n\rINJECT`). Nothing reaches the log: the request line carries no detail.
*Fix:* name at most 5 keys, cap them at 40 characters and strip control/bidi characters.

**m2 (Minor): the definition shape accepts contradictions.** These all register: COUNT+SUM, COUNT+LIST, LIST+COUNT, PERCENT+MEDIAN, MONEY+COUNT, MONEY+AVG. A metric key's prefix is not tied to its `module` (module `sales` can register `money.fees_collected`, squatting PF-R2cm's key and failing its start-up).
*Fix:* add an allowed kind × aggregation table, and require the key prefix to be the module (or a declared alias).

**m3 (Minor): LIST answers are capped in rows but not in width (AG-14-28, no unbounded answer).** 200 rows × 2,000 columns × 300 characters returned OK, a 125 MB answer. A single 100,000-character column name returned OK.
*Fix:* cap columns per row (for example 20), key length (60) and total serialised size.

**m4 (Minor): one hung read hangs the whole answer.** A read that never resolves was still waiting after 3 s, because `Promise.all` at `:130` has no per-read timeout.
*Fix:* race each read against a timeout of a few times the budget and answer UNAVAILABLE (TIMEOUT).

**m5 (Minor): reads share mutable state.** At `all`/`financial` scope every read gets the same `filters` object (`:133`). One read setting `f.staffId` changed what another read saw, the echoed `filters` and its own drill link. `definitions()` (`registry.ts:56`, fake `:117`) hands out the live `drillTarget`. Mutating `carries` there added `owner=<id>` to later drill links.
*Fix:* give each read a frozen copy, and return clones from `definitions()`.

**m6 (Minor): validation runs before the permission check.** A staff member with no report key gets a 400 with schema details (`:121-124`) instead of a 403. Nothing secret is exposed, but the order is backwards.

**m7 (Minor, for the founder, not settled here): own-scope money.** A `view.own`-only Case Officer gets their own money figures (DW3, and PF-R2cm's "view-financial or view.all"). AG-14-35 says paid-consult revenue "SHALL need `agent/report:view-financial`". AG-14-36 says money "uses `view-financial` like every money figure here". AG-14 §10 gives Owner and Admin financials through `view.all`. The requirements and the row disagree, so this goes to the founder under AGENTS rule 2.

## What held
- **Scope from the request is never used.** `scope` as a string or object, a top-level `__proto__:{scope:"all"}`, and `filters.__proto__.staffId` were all ignored (silently dropped rather than refused, unlike `constructor`, which gives 400). Scope stayed `own`.
- **Person filter at own scope.** The caller's own id in upper case is accepted and replaced with the canonical id. Another person's id in upper case, and the nil UUID, give 403 OWN_ONLY. `{uuid}` and `urn:uuid:` give 400. An array or object in place of a string, a metrics string instead of an array, and filters sent as an array all give 400.
- **Billing / Finance.** Naming another person with money metrics only gives a financial read narrowed to that person. Naming another person with a count metric gives 403. `view-financial` alone returns non-money metrics as WITHHELD.
- **Duplicates and odd keys.** A key sent 3 times is read once. `__proto__`, `constructor` and `toString` as metric keys give UNKNOWN_METRIC (Map lookup). Drill target names starting with `__proto__` are refused (`constructor` is accepted as an own property, which is harmless in JSON).
- **Reading shapes.** These all came back UNAVAILABLE: 3 currencies, lower-case `cad`, minor units, a negative count, a count of 1.5, a percent of 101, NaN, a reading of the wrong kind, a LIST of 201 rows, and a getter that throws.
- **Error words.** A read error such as `password=hunter2 …` appears in neither the answer nor the log. The log says only `metric <key> unavailable (ERROR|SHAPE)`.
- **Firms stay apart.** Firm A filtering on firm B's staff id gets 0, the same as a random id, so there is no existence oracle. Firm B's 5,000 rows never reach firm A. 30 metrics at about 50 ms each, read in parallel, answered in 182 ms.
- **Dashboards.** `Owner`, `OWNER`, `../owner`, `owner/../owner`, `%6fwner`, `owner%00`, padded, zero-width, Cyrillic-е, `__proto__`, `constructor`, `toString` and `hasOwnProperty` all give 404. No session gives 401 on both routes. No report key gives 403.
- **Not exercised.** The HTTP layer itself: Express decoding `%2e%2e` to `..` would land on the same allow-list.

Round 1 verdict (d3679946b): Changes

## Round 2 (commit 67872c449, re-tried 23 Nov 2026)
I re-ran both probe scripts against 67872c449, adjusted only for the new `overBudget(…, runAs)` signature and the new `keys` in the read context, and added round-2 cases. The row's own test passes: 70 passed, 0 failed. I changed no code.

**Each round-1 finding, re-tried**
- **M1 holds.** `ctx.keys` reaches the read and is frozen. With a read that uses the keys, a Case Manager without `agent/prospect:view.all` gets 1 (their own lead), not the firm-wide 3. A read doing `ctx.keys.push("agent/prospect:view.all")` throws and the metric answers UNAVAILABLE, so a read cannot widen itself.
- **M2 holds.** Billing / Finance reads a PER_CURRENCY LIST (ageing) at `financial` scope, firm-wide, with no person filter. A Case Officer gets the same LIST WITHHELD. A row whose currency is lower-case `cad`, or missing, makes the metric UNAVAILABLE.
- **m7 is settled the conservative way (AG-14-35 to -37):** without `view-financial`, a money metric is WITHHELD.
- **M3 holds when the caller passes `withFirm`.** A context naming firm B, run while firm A was active, counted firm B's 5,000 rows. A wrong-shaped reading fails the budget. One gap is left (r2 below).
- **M4 holds.**
  - An own-scope figure whose target lacks `staffId` now gets `drill: null`.
  - A `clientType` filter the target cannot carry also gives `null`.
  - With no filter in effect, the link is still given.
  - Mapping two filters to one parameter (`from→d`, `to→d`) is refused at registration.
- **m1 holds.** 2,000 hostile filter keys now give a 301-byte answer: "not a field here: (unreadable) … and 1997 more". A 100 KB metric key with bidi, script and newline characters gives the plain MetricKey message. UNKNOWN_METRIC echoes only keys that pass MetricKey, at most 5. 200 badly typed metrics give 10 fields.
- **m2 holds.** COUNT+LIST, LIST+COUNT, PERCENT+MEDIAN and MONEY+COUNT are refused. COUNT+SUM and MONEY+AVG still register, which is allowed by design. If `sales` registers a `money.*` key first, client money's `money.fees_billed` is then refused with "the money.* keys are sales's", so the conflict fails loudly at start-up.
- **m3 holds.** 200 rows of 2,000 columns, and a column name of 100,000 characters, are both UNAVAILABLE.
- **m4 holds.** With a 100 ms limit, a stuck read is UNAVAILABLE (TIMEOUT) while the other metrics answer.
- **m5 holds.** One read setting `f.staffId` no longer changes what another read sees (null), the echoed filters (`{}`) or the drill link. A changed `definitions()` copy changes nothing registered.
- **m6 holds.** A caller with no report key and a bad body gets 403 MISSING_PERMISSION.

**Still holding from round 1:** scope from the body is ignored. Person-filter case and near-UUID tricks give 403/400. A metric key sent several times is read once. Error words appear in neither the answer nor the log (key plus ERROR, SHAPE or TIMEOUT only). Firm A filtering on firm B's staff id gets 0, with no existence oracle. The dashboard role tricks give 404/401/403. 30 parallel reads of about 50 ms each answered in 186 ms.

**Minor findings left open (none blocks the merge)**
- **r1: the `view-financial` gate depends on the module declaring money honestly.**
  - *Repro:* CAD and USD cents summed (4,550,000) and registered as COUNT/SUM/NONE come back OK at `own` scope to a `view.own`-only Case Officer.
  - The same happens with a LIST declared NONE whose rows carry `currency` and `overdue: "900.00"`.
  - *Fix:* in `fits`, refuse a NONE LIST row that has a `currency` key. Have PF-R2cm's breaker check that every metric reading client-money tables is PER_CURRENCY.
- **r2: the budget check can still pass without reading anything if the caller passes a do-nothing `runAs`.**
  - *Repro:* `runAs = (f, fn) => fn()` counted 0 of firm B's rows and the run passed.
  - The registrant check is text-based: the test file only has to contain `overBudget(` and the module's path.
  - *Fix:* fail a run in which every read returned 0 or empty, or have `runAs` report the firm that was active.
- **r3: a read that hits the time limit keeps running in the background and holds its connection.** In the probe it finished 300 ms after the answer was sent.
  - *Fix:* give each read an `AbortSignal` in the context.
- **r4: the read context is not a `StaffContext`.** The existing visibility helpers (for example `leadsSeenWhere(ctx: StaffContext, vis)`, with the firm's "everyone sees all" switch) take more than keys, so each module will rebuild them.
  - *Fix:* a shared helper (`visibility(area)` or a `StaffContext` view) in a later row.

Verdict: Approve
