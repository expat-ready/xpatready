# PF-R3 — the firm's Reports page · fresh challenge

Challenger: a fresh agent that did not draft the concept (skill screen-concept §B). Read: `concept-draft.md`, `design/draft-reports.html`, the BACKLOG row PF-R3, PRODUCT, STANDARDS §2-§6 and §9, EXPERIENCE §1-§7, QUALITY, TEAM-PATTERNS, AG-14 v1.14 (`domain/requirements-2026-11-02/…/AG-14-reporting-and-analytics_v1.14_2026-10-25.md`), and the code on main at `18cf39273`: `platform/reports/{routes,dashboards,registry}.ts`, `ports/metrics.ts`, `case-reports.ts`, `front-office/reports/metrics.ts`, `client-money/reports/metrics.ts`, `platform/audit/{audit-event,csv}.ts`, `platform/audit/firm-read/service.ts` (the one export on main), `platform/staff-read/routes.ts`, `ports/audit.ts`, `web/src/modules/platform/{routes.tsx,session.ts}`, and the role grants in `prisma/migrations/20261114015002_pf3_platform_tables/migration.sql` (lines 1018-1040, 1122-1123).

**Freshness:** `ai-workers/tools/freshness.sh` stops at once: this copy has no `code/` or `sources/` folder (`code/README-copies.md` not found). Mark as **Unverified**: whether `requirements-2026-11-02` is still the newest requirement snapshot (it is the newest name-free copy in `domain/`), and everything taken from the team's style guide (`code/ERv2-frontend@…`) through TEAM-PATTERNS.

## Verdict
**Build after these changes.** The base is sound: the page only reads one door that already exists, works out no scope of its own, and needs no migration. But the concept is wrong in four places that would ship a broken or misleading page:
- the Person picker cannot load for a Case Manager, and for a Billing / Finance viewer it would empty every money figure;
- one header scope badge mislabels mixed answers;
- BR-2 gives a Read-only staff member no dashboard;
- the export route is missing its refusal cases and its order of writing.

None of these needs a rethink. Each fix is a sentence in the concept plus a few lines in `routes.ts`, which Q2 already opens.

## Objections

### Major

**M1. The Person picker breaks for two of the four seeded personas, and "fixed to themself" would empty Billing's money.** *Needed for the proof*
- **What breaks:**
  - The concept loads "the existing team list" (§6). That is `GET /api/platform/staff`, which needs `agent/staff:manage` (`staff-read/routes.ts:15`). Only OWNER and ADMIN hold it (migration lines 1122-1123). A Case Manager holds `view.all` (line 1034), so the person filter is theirs by right, yet their picker gets a 403.
  - BR-3 says "a view.own viewer sees only themself, fixed". Billing / Finance holds `view.own` and `view-financial` but not `view.all` (lines 1031, 1039). If "fixed" means the page sends `staffId` = the viewer, every money figure is narrowed to cases the Billing person owns or is on the team of (`client-money/reports/metrics.ts` frameOf: `f.staffId` → `caseScope(...CASE_VIEW_OWN)`). That is normally none, so the Billing dashboard reads empty.
  - On the other side, any `staffId` other than the caller's, sent while one widget is at own scope, refuses the whole query with 403 OWN_ONLY (`ports/metrics.ts` runMetrics, the check before any read).
- **Example:**
  - A Case Manager opens Reports: the filter bar shows an error in place of Person.
  - A Billing clerk opens Billing / Finance: "No invoices in this period" on every card, although the firm billed CAD 2,840.
- **Evidence:** the file lines above. Confidence: high (read from code and seed).
- **Fix:**
  - Without `view.all`, the Person control is a static "You" and the page never sends `staffId`. The server already narrows own-scope figures (runMetrics sets `staffId` itself), and money stays firm-wide.
  - With `view.all`, the list comes from the reports door, not the Team list. Add `people` (staff of the firm; inactive ones labelled "(Inactive)", AG-14-31) to the dashboard answer, returned only to `view.all` holders. This mirrors the Activity log, which serves its own people list (`firm-read/service.ts` lists).
  - Write a browser check per persona: Case Manager (picker loads), Billing (money figures are firm-wide, no `staffId` in the request body), Case Officer (no list is fetched).

**M2. One scope badge in the header is wrong whenever answers differ in scope, and "Whole firm" is wrong under a person filter.** *Needed for the proof*
- **What breaks:**
  - §4 puts "the scope badge" in the header, and the board shows one badge, "Whole firm, money", there. But scope belongs to each answer (`MetricAnswer.scope`; `scopeFor` per metric):
    - Billing / Finance gets `own` for case and sales figures and `financial` for money;
    - a Case Manager gets `all`, plus WITHHELD on money.
  - Under `all` or `financial` with a person filter, the answer still says `all` or `financial`, but the figures are that one person's (case-reports frameOf `personId`; money frameOf `person`).
- **Example:** an Owner filters Person = Case Officer (Sample). "Fees billed" shows CAD 640 under a "Whole firm, money" badge.
- **Evidence:** `ports/metrics.ts` scopeFor and runMetrics; the board's header and its money cards, which have no badge of their own.
- **Fix:**
  - Put a badge on each card, from that answer: own → "Your work"; all → "Whole firm"; financial → "Whole firm, money".
  - When a person filter is set, show "<Name>'s work" on all and financial answers.
  - WITHHELD shows no badge, only "Not in your access".
  - Drop the header badge, or make it say "Mixed" only when the answers differ.
  - Browser check: a Billing viewer on the Owner dashboard sees "Your work" on "Leads added" and "Whole firm, money" on "Fees billed".

**M3. BR-2 has no dashboard for the Read-only role, and the dashboard choice is not in the address.** *Needed for the proof*
- **What breaks:**
  - The seeded roles are OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER, BILLING_FINANCE and READ_ONLY (migration line 35).
  - READ_ONLY holds `agent/report:view.own` (line 1040), so `mayReport` lets the person in. But BR-2's order (Owner/Admin → Billing / Finance → Case Manager → Case Officer) names no dashboard for them, and the page has no rule to fall back on.
  - BR-3 keeps the filters in the address, but the chosen dashboard is not, so "a link reopens the same view" fails for a picked dashboard.
- **Example:** a Read-only staff member opens Reports and gets a blank page, or the page's first fetch is `GET …/dashboards/undefined` → 404.
- **Evidence:** the migration enum and grants; `dashboards.ts` has 4 roles (Q8: Rep and Compliance are not seeded); `routes.ts` 404s on any other name.
- **Fix:**
  - Add to BR-2: "any other role (Read-only, or a firm's own role) → Case Officer", which is the own-scope layout.
  - Keep the picked dashboard in the address (`?dashboard=case-manager`). An unknown value falls back to the role default, never to a 404 page.
  - Browser check: a Read-only person lands on Case Officer (pass); `?dashboard=nope` lands on their default (fail case).

**M4. The export route (Q2) is right to exist, but its contract misses three refusals, the audit line's scope, and the order of writing.** *Needed for the proof*
- **What breaks:**
  1. **WITHHELD:** a Case Manager holds `agent/report:export` (line 1022) but not `view-financial`, so every money table is WITHHELD for them. The concept says nothing about exporting a WITHHELD table. Built naively on `runMetrics`, the CSV would be empty, or worse.
  2. **UNAVAILABLE:** a read that failed has no rows to write. §6 has no answer for it.
  3. **The button:** BR-7 shows the button "only for a holder of `agent/report:export`". So the Case Manager would see "Export CSV" on a "Not in your access" card.
  4. **Scope in the audit line:** AG-14-26 asks for actor, **scope**, filter and row count. BR-7 lists who, metric, filters and rows, without scope, and without saying the filters are the narrowed ones (own scope: `staffId` = the viewer).
  5. **Writing order:** the audit line must be committed before any byte is sent. A failed line means no file. That is the precedent of `audit.exported` (`firm-read/service.ts` exportCsv, P-607 (3)). Otherwise the line is not trustworthy, which is the very reason Q2 gives for a server route.
  6. **The audit entry's shape:** `AuditEntry` refuses an entity outside `platform_|plat_|fo_|money_|msg_` (`ports/audit.ts` AREA_ENTITY). `tests/check_aud_values.ts` sweeps every caller for `before` and `after`. The concept names neither.
- **Example:** a Case Manager exports "Tax collected" and gets a 200 with an empty file, plus an audit line saying they exported 0 rows of a figure they may not see.
- **Fix:** see the back-end plan below.
  - WITHHELD → 403 `NOT_IN_ACCESS`, no line.
  - UNAVAILABLE → 503 `UNAVAILABLE`, no line.
  - A metric that is not a LIST → 400.
  - The button shows only with `agent/report:export` AND the answer is OK with at least one row.
  - Audit line: `action: "report.exported"`, `entity: "plat_report_export"`, `entityKey`: a new uuid, `before: null`, `after: null`. Detail: `metric`, `scope`, `from`, `to`, `staffId` (the narrowed one), `clientType`, `rows`. The line is committed before the file is sent.

**M5. The row's "overdue-by-person list linking to PF-29f" is deferred without saying so.** *Needed for the proof* (as a recorded deferral)
- **What breaks:**
  - Batch 5 of the row requires the Owner dashboard's overdue-by-person list, linking to PF-29f's work screen. The concept moves it to §6b *Not built* ("shows Not counted yet").
  - That is honest about main: `reports.cases.overdue_tasks_by_person` and `documents_waiting` are not registered anywhere (only `dashboards.ts` names them). CS-R1 is 2 PRs, and its task numbers wait on CS-T1. No tasks module exists in `web/src/modules/platform/`.
  - But a row acceptance item is being dropped, and §7 asks about drill-through (Q1) and not about this. The row's "waits on" does not name CS-R1 part 2 either.
- **Example:** at CHECK, the reviewer scores the row's batch-5 item as Not met, and nobody has agreed it may be.
- **Evidence:** `grep -rn overdue_tasks_by_person` hits only `dashboards.ts`; BACKLOG CS-R1 ("overdue tasks by person (AG-13-68, after CS-T1)") and PF-29f (not built).
- **Fix:** fold it into Q1 as a named deferral, with a follow-up row ("register `overdue_tasks_by_person` (CS-R1 part 2) and link each row to PF-29f"). Until then the card shows "Not counted yet" (Q3).

**M6. "One pass and one fail per BR" is a promise, not a list. Several BRs have no named fail, and BR-6's UNAVAILABLE has no way to be caused.** *Needed for the proof*
- **What breaks:**
  - STANDARDS §3.10 and QUALITY D16 need a passing and a failing test per rule. §6 names only BR-8's fail.
  - With seeded data, nothing makes a metric UNAVAILABLE in the browser.
  - The row's check "an Owner and a Case Officer see the same tiles at different scope" cannot pass on their default dashboards: the two layouts share only `case_load`. Both people must open the same dashboard.
- **Fix:** name them in the concept:

| BR | Pass | Fail |
|---|---|---|
| BR-1 | Case Officer sees "Your work" on Open cases by stage, with the API's own-scope count | a `scope: "all"` put in the request body by hand changes nothing |
| BR-2 | Owner lands on Owner; Read-only lands on Case Officer | `?dashboard=nope` → the default, never a 404 page |
| BR-3 | the month and the person reload from the address, and every card changes | a Case Officer's address carrying another `staffId` → the page drops it, no 403 page |
| BR-4 | CAD and USD are shown apart | no card ever shows a sum or a third total (CAD only → no "USD 0.00") |
| BR-5 | every card's "What this counts" equals the answer's `source` | n/a, or one with an empty source does not render (cannot happen: `source` min 1) |
| BR-6 | empty period → "No invoices in this period" | a read made UNAVAILABLE (Playwright route rewrite of one metric's status) → "Could not be counted just now" + Retry, never 0 |
| BR-7 | Owner exports → one `report.exported` line with scope and rows | Case Officer (no key): no button, and a direct POST → 403 with no line; Case Manager on a WITHHELD money table: no button, and a POST → 403 with no line |
| BR-8 | no figure links (no metric has a `drillTarget`) | a mocked answer with `drill` set draws one link to exactly that path |

  The row's "same tiles at different scope" check: the Owner and the Case Officer both open `?dashboard=case-officer`.

### Minor

**m1. Empty and withheld copy does not fit every metric.** *Needed for the proof*
- **What breaks:**
  - "No invoices in this period" is wrong in four places:
    - for Fees collected ("No payments in this period");
    - for Overdue ageing, where the period does not apply ("Nothing is overdue today");
    - for Trust received when the firm holds no trust money (the read returns `figures: []` behind `trustShows`: "This firm holds no trust money");
    - for a PERCENT with `value: null` (Win rate with no closed prospects: "No prospects closed in this period", per AG-14 BR-12).
  - "Not in your access" always says "Money figures need the Financial reports permission". That is true for every WITHHELD on today's seeded dashboards, since all of them are money, but not for a firm-wide-only figure at own scope (`scopeAware: false`, e.g. `unassigned_waiting`).
- **Fix:**
  - Write one empty line per metric on the four dashboards in §5. Handle PERCENT null.
  - Word the WITHHELD tooltip by kind: MONEY, or a LIST with a currency, → the money sentence; otherwise "This figure is counted for the whole firm only. Ask your firm's Owner."

**m2. "Not counted yet" is right, but its tooltip and query need care.** *Needed for the proof*
- **The tooltip:** "This figure comes in a later release" is wrong. Both missing figures are Release 1 rows (CS-R1 part 2). Use "This figure is not counted yet." Q3's recommendation, to show the card muted rather than hide it, is sound.
- **The query:** the page must leave `registered: false` widgets out of the query body. An unknown key refuses the whole query with 400 UNKNOWN_METRIC (`runMetrics`), so one unregistered widget would blank the page. Say so in BR-6, and test it (the Case Officer dashboard has 2 of 3 unregistered).

**m3. The CSV format is said in one phrase, "money columns stay per currency".** *Needed for the proof*
- **What is already sound:** the LIST rows already carry one `currency` column per row and amounts as `"1234.50"`, with no total across rows (`client-money/reports/metrics.ts`).
- **State the format:**
  - UTF-8 with BOM and RFC 4180, through the existing `csvRow` (`platform/audit/csv.ts`, which guards against formula injection);
  - the `currency` column first, the amounts as given (two decimals, no thousands separator, no symbol), no total row;
  - the "N more …" row kept, as the read wrote it (no silent cut, AG-14 §3.10);
  - header words equal to the table's column headers.
- **Watch:** `csvCell` puts a `'` before any value starting with `-`. No exported table can hold a negative value today (`tax_minor >= 0`; ageing uses `greatest(0, …)`). Still, write number cells and cells shaped like an amount (`^-?\d+\.\d{2}$`) as they are, and guard only text cells.
- **One place for the words:** the column headers need one home shared by the table and the CSV. The rows only carry keys such as `days_1_30`. Put a column-words map in the reports module, either in the web map that the export also reads, or in the dashboard answer. The concept names none.

**m4. The copy's export example names a metric that cannot be exported.** *Needed for the proof*
- "Downloaded reports-fees-billed-2026-11.csv": Fees billed is a MONEY tile, which the route refuses with 400. Use e.g. `reports-tax-collected-2026-11.csv`.
- Also say which visuals carry the button. Every LIST widget is a table (TABLE, BAR, AGING). The row says "each table", and Overdue ageing is the table an accountant wants (US-4). The board shows the button on AGING, which agrees.

**m5. §4 lists tables that are on no seeded dashboard.** *Not built*
- "Overdue by client" and "per person" are registered (`reports.money.overdue_by_client`, `reports.sales.per_person`), but `dashboards.ts` places neither, and the row's Touch does not include `dashboards.ts`.
- **Fix:** remove them from §4. Do not add them to a layout here, which would be added scope. US-4's overdue-by-client list on the Billing dashboard stays a gap for a later row.

**m6. The client-type control departs from AG-14-32 without saying so.** *Needed for the proof* (a recorded choice)
- AG-14-32 says first use starts in Individual, and only Owners and Case Managers may also pick "All". BR-3 offers All to everyone and defaults to All.
- STANDARDS §10 wants a consequential choice recorded with its alternative. AGENTS rule 2 sends a conflict with the team's requirement to the founder: see Q2 below.
- "Remember the last view" (AG-14-32) is *Not built*; the address keeps it.

**m7. "This month in the firm's zone" has no source in the browser.** *Needed for the proof*
- `GET /api/platform/me` carries no time zone (`Me` in `sales/contract.ts`). Near a month boundary, the browser's zone gives the wrong month.
- **Fix:** add the firm's current month (`period: {from, to}`, from `PlatformClock` and `platform.time_zone`) to the dashboard answer. It sits beside `people` (M1) in the same file, and it makes the default testable with the fixed clock.

**m8. Team-pattern divergences are not mapped.** *Needed for the proof*
- TEAM-PATTERNS says "table never inside a card" and names `ErrorState`, `NoAccessState`, `EmptyState` and skeleton + `sr-only`.
- The concept puts tables inside cards, and names none of the team's state components.
- **Fix:** list "tables inside dashboard cards" under "Where we chose differently", with the reason (one widget, one card, as the board shows), and use the team's state components. Unverified: the style guide copy is not in this checkout.

**m9. §4b's benchmarks are partly wrong.** *Needed for the proof* (claims only)
- **Stripe:** Stripe's docs say its Dashboard financial reports show one currency at a time through a currency selector (docs.stripe.com/reports/options; Sigma docs: "always filter data to a single currency"). So "one figure per currency … copy" is not what Stripe does. Our side-by-side rule (AG-14-27: no currency picker) beats it. Date range in the address: **Unverified**.
- **HubSpot:** drill-down to the records behind a data point is confirmed (knowledge.hubspot.com "drill down into dashboard reports"). A *role-based* default dashboard is **not** confirmed: a user marks a dashboard as their own default.
- **Clio:** an accounts-receivable / ageing report with CSV or Excel output is confirmed in substance (help.clio.com "Export Data From Clio Manage"; billing reports). The exact CSV columns: **Unverified**.
- **QuickBooks:** **Unverified** (not checked).
- **Fix:** correct the lines. The "Beat" claims stand.

**m10. Small consistency points.** *Needed for the proof*
- The concept says "P-223 (4): there is no board for this screen", yet it ships `design/draft-reports.html`. Say the board is an aid for the tech lead and not a founder early look.
- The route is `/reports`. Most platform pages are `/platform/…` (`routes.tsx`). Pick one and say why.
- The job line says the table "can go out as a CSV for the accountant", but Billing / Finance holds no `agent/report:export` (only OWNER, ADMIN and CASE_MANAGER do, lines 1020-1022). The person who prepares the accountant's file cannot export it unless the firm adds the key. Say so in the refusal copy ("Ask your firm's Owner…" already fits).

## What is sound
- **No migration and no new scope logic.** Scope is the server's (runMetrics and scopeFor). The page sends none, and the door ignores a `scope` in the body. Confirmed in `ports/metrics.ts`.
- **Money per currency, never summed (BR-4).** It matches the readings: `MONEY.figures` has at most 2 entries, each currency once, and the LIST money rows carry `currency`.
- **WITHHELD reads "Not in your access", never 0.** UNAVAILABLE gets Retry. Both are AG-14 BR-12.
- **Q1: ship without drill links.** Every registered metric has `drillTarget: null`, and `case-reports.ts` explains why (the case list is wider than the figure). `drillOf` already refuses any link that would widen. Recommendation agreed (with M5 added).
- **Q2: a server route, not a CSV built in the browser.** Agreed. Only the server can write the line and re-check the scope. The output is bounded by `LIST_MAX_ROWS` = 200, so a synchronous build meets AG-14-26 "async for large sets" (no large set exists) and STANDARDS §4.
- **Q3: show "Not counted yet" muted rather than hide it.** Agreed. The layout stays stable and nothing pretends to be a figure, so no scaffolding passes for a capability (P-33).
- **The Owner dashboard meets batch 5:** 4 number cards (leads added, win rate, fees billed, fees collected), the stage bar (`case_load`), the month picker and the client switch.
- **"Dashboard by role" fits the seeded keys for the four named roles.** Owner and Admin get firm-wide plus money. Case Manager gets firm-wide without money. Billing gets money plus own. Case Officer gets own. Only READ_ONLY falls through (M3).
- **Read-only page, no filled button except Retry, tooltips on each number (BIC-11, -14, -18), tables scrolling inside their card at 375 (UXL-10).**
- **Performance:** each read is budget-checked in CI at 200 ms (`METRIC_READ_BUDGET_MS`), and one query serves all widgets. LCP ≤ 2.5 s is plausible on Sample data.
- **Out of scope as the row says:** XLSX, scheduled reports and saved views are kept out. Nothing else is added beyond the row, apart from m5's stray tables (to be removed).

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Dashboard layout and picker | none (`DASHBOARDS` as data) | `GET /api/platform/reports/dashboards/:role` (exists); **add** `people` (only to `view.all` holders: staff of the firm, inactive ones labelled) and `period` (the firm's current month) | BR-2 + M3 fallback; M1 | `check_pfr1_reports.ts` extended: Case Manager gets `people`, Case Officer gets none; `period` equals the fixed clock's month in the firm's zone |
| Cards and tables | money, case and sales tables (read only) | `POST …/query` (exists); body = the registered widgets only, filters from the address; `staffId` only from a `view.all` viewer | BR-1, BR-3, BR-4, BR-6 (AG-14-19, -20, -15) | browser: screen = API per card for the seeded firm; Billing's request has no `staffId`; unregistered keys are never sent |
| Scope badge per card | `MetricAnswer.scope` + filters | the same | M2 | browser: Billing on Owner → "Your work" and "Whole firm, money"; Owner with a person filter → "<Name>'s work" |
| Export CSV | `audit_event` (via `auditEvent.record`, platform audit workspace) | **new** `POST …/export {metric, filters}` → `text/csv`, `Content-Disposition` | 403 no key; 422 a bad body; 400 unknown or not a LIST; 403 WITHHELD; 503 UNAVAILABLE; otherwise one line committed first (`report.exported`, `plat_report_export`, uuid key, `before`/`after` null, detail `metric`, `scope`, `from`, `to`, `staffId`, `clientType`, `rows`), then the file through `csvRow` (AG-14-25, -26, -29) | API test: each refusal writes no line; one export writes exactly one line with scope and rows, holding no figure; a failed line → no file; a stage name starting with `=` is written as `'=…`; `check_aud_values.ts` and `check_case_feed.ts` sweeps pass |
| Drill-through | none | none (`drill` is null for every metric) | BR-8 | browser: no link drawn; a mocked `drill` draws exactly one |
| Module card | `platform/reports` MODULE + `MODULE.rows/PF-R3.md` | — | STANDARDS §7 | CI `module-cards` |

## Questions for the founder (≤3, recommendation first)
1. **Two of the row's acceptance items cannot be met on main: drill-through (no metric has a target) and the overdue-by-person list linking to PF-29f (the figure is not registered, and PF-29f is not built).** *Recommendation:* ship PF-R3 without both, with "no link without `drill`" tested and the card shown as "Not counted yet". Add two follow-up rows: the first list that carries month, person and client type (the invoice list is nearest), and CS-R1 part 2's `overdue_tasks_by_person` with its PF-29f link. *Alternative:* hold PF-R3 until CS-T1, CS-R1 part 2 and PF-29f merge (several rows away).
2. **The client-type switch: the team's AG-14-32 says first use starts in Individual and only Owners and Case Managers get "All". The concept gives everyone "All" by default.** *Recommendation:* follow AG-14-32. Start in Individual, offer "All" only to view.all holders, and keep the choice in the address; remembering it across visits is not built. *Alternative:* keep "All" for everyone and record it as a departure from AG-14-32.

## Lead response

## Agreement

## Build discoveries
