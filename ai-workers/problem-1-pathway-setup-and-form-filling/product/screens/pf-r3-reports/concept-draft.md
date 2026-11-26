# PF-R3 — the firm's Reports page (R1.79's last part) · concept DRAFT

This is the builder's draft (skill screen-concept: a helper writes `concept-draft.md`, never `concept.md`). The tech lead approves it after the fresh challenge (`challenge.md`; P-223 (4): there is no board for this screen) and then promotes it. Sources: the BACKLOG row PF-R3 (batch 5 folds in CS-R2); AG-14-18 to -22, -25, -26, -29, -33; the code on main: `platform/reports/{routes,dashboards,registry}.ts`, `ports/metrics.ts`, and the 22 metrics registered by CS-R1, PF-R2fo and PF-R2cm.

## 1. Job and journey
**Job:** a firm's Owner opens Reports and sees, in one look, how sales, cases and money are going this month. Each figure says what it counts. Its table can go out as a CSV for the accountant. A Case Officer sees the same page counted over their own work.
**People:** Owner (firm-wide, money included); Case Manager (funnel and delivery); Billing / Finance (money); Case Officer (own caseload). **Activities:** AG-14 §3.6 (role dashboards), US-1, US-4, US-14.

## 2. Ten layers (what exists, what is new)
| Layer | On main | New in PF-R3 |
|---|---|---|
| Data | money, case and sales tables | none (no migration) |
| Rules | the run rule: scope from report keys (`ports/metrics.ts`) | none |
| Engine | none | none |
| Contract | `GET /api/platform/reports/dashboards/:role`, `POST …/query` | `POST …/export` (CSV of one table, audited): see Q2 |
| API | the door above | the export route, with one audit line |
| UI | none | `web/src/modules/platform/reports/*`: route `/reports`, menu link |
| AI | none | none (live AI off) |
| Governance | `agent/report:*` keys seeded (PF-3) | export only with `agent/report:export` |
| Tests | the door's own tests (PF-R1, CS-R1, PF-R2fo, PF-R2cm) | `tests/check_pfr3_reports_browser.ts` (+ the export route's checks) |
| Docs | module cards | a `MODULE.rows/PF-R3.md` row file |

## 3. Business rules
- **BR-1 Scope is the server's (AG-14-19).** The page never sends a scope. It shows the `scope` each answer carries: "Your work" (own), "Whole firm" (all) or "Whole firm, money" (financial). A WITHHELD figure reads "Not in your access", not 0.
- **BR-2 Dashboard by role (AG-14-18).** The page opens on the first seeded dashboard that fits the viewer's roles, in the order Owner/Admin → Billing / Finance → Case Manager → Case Officer. A "Dashboard" picker shows the other three; a layout changes what is shown, never what may be counted.
- **BR-3 One filter bar (AG-14-20, -33).** Month (default: this month in the firm's zone) or a custom From–To; Person (staff of the firm; a view.own viewer sees only themself, fixed); Client type (All, Individual, Corporate). It narrows every figure at once, and the filters live in the address, so a link reopens the same view.
- **BR-4 Money per currency, side by side (AG-14-15).** "CAD 2,840.00 · USD 210.00", never a sum or a conversion. An empty currency is not shown.
- **BR-5 Each figure says what it counts.** The answer's `source` text sits under the card's "What this counts" tooltip and disclosure.
- **BR-6 Empty says why.** No rows reads "No invoices in this period" (per metric, with the period). An unregistered widget reads "Not counted yet" with a muted card. UNAVAILABLE reads "Could not be counted just now. Try again" with a Retry button.
- **BR-7 Export (AG-14-25, -26, -29).** "Export CSV" shows on each table only for a holder of `agent/report:export`. The server builds the file from the same read, so it is the same scope and filters. Each export writes one audit line: who, which metric, the filters and the row count, never the figures. Money columns stay per currency.
- **BR-8 Drill-through (AG-14-22).** A figure links to its list only when its answer carries `drill`. No registered metric does today, so no figure links yet, and no link is ever drawn to a wider list than the figure (CS-R1 review M1): see Q1.

## 4. Layout (EXPERIENCE §3: no pattern fits a dashboard exactly; closest is Catalogue's filter chips + cards, nothing invented)
- **Header:** title "Reports", the line "How the firm is doing, counted from your records", then the Dashboard picker. The scope badge sits right.
- **Filter bar:** one row of controls that wraps to two at 375 px.
- **Cards:** a grid of number cards (TILE: 4 per row at 1440, 2 at 1024, 1 at 375). Each card has the label, the value (or per-currency values), a "What this counts" (i) tooltip, and the state line.
- **Wide widgets:** BAR (case load by stage, prospects by stage) as a horizontal bar list with the count beside each bar, never colour alone. AGING as a 5-column strip per currency. TABLE (stage durations, tax collected, overdue by client, per person) as a white table, 36-44 px rows, its "Export CSV" button at the top right (secondary, not filled). Tables scroll inside their card at 375 px.
- **States:** skeleton cards while loading; per-card error with Retry; a page-level "Your roles include no report permission" (403) with whom to ask; read-only throughout.
- **Board:** `design/draft-reports.html` (self-contained, Sample data from the PF-R2cm and CS-R1 tests).

## 4b. Best in class (from product knowledge, not re-read today: Unverified until the challenger or the tech lead checks it)
- **Clio Manage reports:** firm-wide revenue and AR ageing by matter and client; CSV export. Copy: the ageing buckets and the per-client worklist. Beat: one page, not a reports menu.
- **Stripe Dashboard:** one figure per currency and date range in the address. Copy both.
- **HubSpot dashboards:** a role-based default dashboard, "what this counts" on each report, and drill to records. Copy the role default and the definitions. Drill comes when lists can carry the filter (BR-8).
- **QuickBooks AR ageing:** standard buckets and the customer list as a worklist. Matched by PF-R2cm.

Effort saved: no report building; the month is pre-set; one filter bar for everything; numbers that agree with the invoice list and the statement (PF-R2cm's parity test).

## 4c. Scorecard
BIC-11, -13, -14, -18, -19 and -20 apply. They are met by: no filled button except Retry in an error card; tooltips on every number; skeletons and teaching empties; one heading per card; keyboard and axe. BIC-01 to -10, -12, -15 to -17 are N/A: the page reads only, with no answers, documents, signing or review. UXL-01 to -14 are answered in the board's notes (no sideways scroll at 375; chips wrap; tables scroll inside their card).

## 5. Copy
Title "Reports". Scope badges: "Your work" · "Whole firm" · "Whole firm, money". The rest:
- "What this counts" (tooltip header).
- "No invoices in this period" / "No cases opened in this period" / "No leads in this period".
- "Not in your access": tooltip "Money figures need the Financial reports permission. Ask your firm's Owner."
- "Not counted yet": tooltip "This figure comes in a later release."
- "Could not be counted just now. Try again" (with Retry).
- Export: "Export CSV". On success: "Downloaded reports-fees-billed-2026-11.csv"; on refusal: "You can't export reports. Ask your firm's Owner for the Export permission."

## 6. Contract and tests
- **Reads:** `GET /api/platform/reports/dashboards/:role`; `POST /api/platform/reports/query {metrics, filters}`; staff list for the Person picker (the existing team list).
- **New, Q2:** `POST /api/platform/reports/export {metric, filters}` → `text/csv`. It returns 403 without `agent/report:export`, 422 for a filter that fails, and 400 for an unknown or non-table metric. It writes one audit line, `report.exported`.
- **Browser check (row):** an Owner and a Case Officer see the same tiles at different scope; a person without export sees no button, and an export writes one audit line; CAD and USD show apart; keyboard only; axe 0 serious; 375 / 1024 / 1440 widths; first figures within STANDARDS §9 (LCP ≤ 2.5 s) on the Sample data; "the screen equals the API for the seeded firm"; a view.own holder sees their own view and a view.all holder the firm; phone width. **One pass and one fail per BR**, with BR-8's fail being "no figure links while its answer carries no drill".

## 6b. Capability or scaffolding
Everything above is the capability (*Needed for the proof*), except the following, which are *Not built*: XLSX, scheduled reports and saved views (the row); drill-through until a list carries the filters (BR-8); the overdue-by-person card (CS-R1's `overdue_tasks_by_person` is not registered: it shows "Not counted yet").

## 7. Questions for the tech lead (recommendation first)
1. **Drill-through has no target on main (BR-8).** Recommendation: ship without links, keep the row's "drill-through opens the target list with the filter applied" as a follow-up row for the first list that can carry month + person + client type (the invoice list is nearest), and write the test as "no link is drawn without `drill`".
2. **Export needs a server route and an audit line, outside the row's "Touch" (web only).** Recommendation: add `POST /api/platform/reports/export` to `platform/reports/routes.ts` in the same PR (about 80 lines, the same read as `query`, one audit line). The alternative, a CSV built in the browser, cannot write a trustworthy audit line.
3. **Unregistered widgets (overdue tasks by person, documents waiting).** Recommendation: show them muted as "Not counted yet" rather than hide them, so the seeded layout stays stable as rows land.

## Definition of ready
The acceptance test is named (`tests/check_pfr3_reports_browser.ts` plus the export route's checks). The row text is as written, plus Q1-Q3's answers. The decisions used are P-223 (4), P-392 and Q8 (live reads). Waiting: Q1-Q3 and the tech lead's approval after `challenge.md`.
