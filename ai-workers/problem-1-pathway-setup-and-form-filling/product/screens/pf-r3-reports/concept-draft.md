# PF-R3 — the firm's Reports page (R1.79's last part) · concept DRAFT r2

This is the builder's draft (skill screen-concept: a helper writes `concept-draft.md`, never `concept.md`). r2 answers `challenge.md`: Majors M1-M6, and Minors m1-m10 except where the Lead response says otherwise. The tech lead approves it after the challenge (P-223 (4): no founder board; `design/draft-reports.html` is the builder's drawing) and then promotes it. Sources: the BACKLOG row PF-R3 (batch 5 folds in CS-R2); AG-14-18 to -22, -25, -26, -29, -32, -33; the code on main: `platform/reports/*`, `ports/metrics.ts`, and the 22 metrics registered by CS-R1, PF-R2fo and PF-R2cm.

## 1. Job and journey
**Job:** a firm's Owner opens Reports and sees, in one look, how sales, cases and money are going this month. Each figure says what it counts. Its table goes out as a CSV, for people with the Export permission (Owner, Admin, Case Manager as seeded; Billing / Finance holds no export key: m10). Others see the same page over what they may count.
**People:** Owner/Admin, Case Manager, Billing / Finance, Case Officer, Read-only (falls back to the Case Officer dashboard, M3). **Activities:** AG-14 §3.6, US-1, US-4, US-14.

## 2. Ten layers
| Layer | On main | New in PF-R3 |
|---|---|---|
| Data / Rules / Engine | money, case and sales tables; the run rule (scope from report keys) | none (no migration) |
| Contract / API | `GET …/reports/dashboards/:role`, `POST …/query` | the dashboard answer adds `people` (only for `view.all` holders) and `period` (the firm's current month); `POST …/export` (Q2) |
| UI | none | `web/src/modules/platform/reports/*`, route `/platform/reports` (m10), one menu link |
| Governance | `agent/report:*` seeded | export only with `agent/report:export`, audited |
| Tests | the door's tests | `tests/check_pfr3_reports_browser.ts`; the export and dashboard additions in `check_pfr1_reports.ts` |

## 3. Business rules
- **BR-1 Scope is the server's, shown per card (AG-14-19; M2).** Each card shows the scope its own answer carries: "Your work" (own), "Whole firm" (all or financial), or "<Name>'s work" under a person filter. A WITHHELD card has no badge and reads "Not in your access". The header has no scope badge.
- **BR-2 Dashboard by role (AG-14-18; M3).** Default: Owner/Admin → Owner; Billing / Finance → Billing / Finance; Case Manager → Case Manager; anyone else with a report key → Case Officer. The picker offers all four, and `?dashboard=` stays in the address; an unknown value falls back to the default. A layout never changes what is counted.
- **BR-3 One filter bar (AG-14-20, -33; M1, m6, m7).**
  - Month: defaults to the firm's current month, from the dashboard answer's `period`; custom From–To is offered.
  - Person: only for `view.all` holders, from the answer's `people`. Anyone else sees a static "You", and the page never sends `staffId` for them; a `staffId` in their address is dropped.
  - Client type: All / Individual / Corporate. Default "All" for `view.all` holders; "Individual" for others, with All offered (AG-14-32: All for owners and managers; recorded departure: others may choose All too, Q2).
  - Every filter is in the address.
- **BR-4 Money per currency, side by side (AG-14-15).** "CAD 2,840.00 · USD 210.00", never a sum or a conversion; a currency with no money is not shown.
- **BR-5 Each figure says what it counts:** the answer's `source` text under "What this counts".
- **BR-6 Empty, withheld and unavailable say why (m1, m2).**
  - Empty copy is per metric: a period figure reads "No invoices in this period"; overdue reads "Nothing overdue today"; trust reads "No trust money received in this period"; a rate with no value reads "No prospects closed in this period".
  - "Not in your access" carries a tooltip naming the permission: "Financial reports" for money, else "Reports".
  - An unregistered widget reads "Not counted yet" ("Coming in Release 1"). It is muted and is never sent in the query.
  - UNAVAILABLE reads "Could not be counted just now. Try again", with Retry.
- **BR-7 Export (AG-14-25, -26, -29; M4, m3, m4).** "Export CSV" (secondary button) shows on a TABLE, BAR or AGING widget only for a holder of `agent/report:export`, and only when that card's answer is OK with rows.
  - The server reads the metric with the same filters and scope as `query`. It returns 403 for WITHHELD and 503 for UNAVAILABLE, with no audit line in either case.
  - Otherwise it commits one audit line first: action `report.exported`, entity `plat_report_export`, the metric key, filters, scope and row count, `before`/`after` null, never figures. Only then does it send the file; if the line fails, there is no file.
  - CSV: the header words are the table's own; a per-currency table has `currency` first; amounts are exactly as answered; no total row; the shared CSV writer.
- **BR-8 Drill-through (AG-14-22; Q1).** A figure links only when its answer carries `drill`; no registered metric does today. A link never opens a wider list than the figure.

## 4. Layout
- **Pattern:** EXPERIENCE §3 has no dashboard pattern. The team's `PageScaffold` + page card, `FilterLayout` chips in the URL, and the `EmptyState` / `ErrorState` / `NoAccessState` / skeleton states are used.
- **Header:** title "Reports"; the line "How the firm is doing, counted from your records"; the Dashboard picker on the right.
- **Filter bar:** one row, wrapping at 375 px.
- **Number cards (TILE):** 4 per row at 1440, 2 at 1024, 1 at 375; label, value(s), (i) "What this counts", per-card scope badge.
- **BAR:** a bar list with the count beside each bar.
- **AGING:** a 5 + 1 column strip per currency.
- **TABLE:** the table sits in the page card's section, not a nested card (m8: the team's "table never inside a card"), with 44 px rows and internal horizontal scroll at 375. Only the seeded dashboards' tables appear: stage durations and tax collected (m5).
- **Board:** `design/draft-reports.html`. r2 changes there: per-card badges, no header badge, and "Coming in Release 1".

## 4b. Best in class (corrected per challenge m9)
- **Clio:** a receivables report with CSV/Excel output (confirmed in substance; columns Unverified). Copy the buckets and the client worklist.
- **HubSpot:** drill-down from a report to records (confirmed). A role default dashboard is Unverified, and ours comes from AG-14-18 itself.
- **Stripe:** reports show one currency at a time through a selector (its docs). We beat that: currencies side by side (AG-14-15) with no picker.
- **QuickBooks:** AR ageing buckets (Unverified); matched.

Effort saved: no report building; the month is pre-set; one filter bar; figures equal the invoice list and statement (PF-R2cm parity).

## 4c. Scorecard
- **BIC-11, -13, -14, -18, -19, -20 apply.** No filled button except Retry; tooltips on every figure; skeletons and teaching empties; one heading per card; keyboard and axe.
- **The other BIC checks are N/A** (read-only page).
- **UXL-01 to -14:** no sideways scroll at 375, wrapping chips, tables that scroll inside their section, 44 px targets.

## 5. Copy
- Title: "Reports"; badges: "Your work" · "Whole firm" · "<Name>'s work".
- Empty and withheld copy: as in BR-6.
- Export success: "Downloaded reports-tax-collected-2026-11.csv". Refusal: "You can't export reports. Ask your firm's Owner for the Export permission."

## 6. Contract and tests
- **Reads:** `GET …/dashboards/:role` returns `{…, people?: {id, name, active}[], period: {from, to}}`. `POST …/query` sends registered widgets only.
- **New:** `POST …/export {metric, filters}` → `text/csv`. It returns 403 without the key or for WITHHELD; 503 for UNAVAILABLE; 422 for bad filters; 400 for an unknown metric or a TILE.
- **Pass and fail per BR (challenge M6's table, adopted in full):**
  - BR-1: the Case Officer sees "Your work"; a hand-set `scope` changes nothing.
  - BR-2: Owner → Owner, Read-only → Case Officer; `?dashboard=nope` gives the default.
  - BR-3: the address reloads the view; a Case Officer's address `staffId` is dropped (no 403 page); Billing's request has no `staffId`.
  - BR-4: CAD and USD apart, never "USD 0.00".
  - BR-5: each card's words equal its `source`.
  - BR-6: an empty period, and an UNAVAILABLE forced by a Playwright route rewrite, which shows Retry, never 0.
  - BR-7: Owner exports one line with scope and rows; a Case Officer POST gets 403 with no line; a Case Manager on a WITHHELD money table gets no button and a 403 with no line.
  - BR-8: no link; a mocked `drill` draws exactly one.
- **The row's checks:**
  - Owner and Case Officer on the same (Case Officer) dashboard, at different scope;
  - screen equals API;
  - keyboard only; axe 0 serious; 375 / 1024 / 1440;
  - LCP ≤ 2.5 s on the Sample data.

## 6b. Capability or scaffolding
- **Needed for the proof:** all of the above.
- **Not built (follow-up rows):** XLSX, scheduled reports and saved views (the row); drill-through (Q1); the Owner's overdue-by-person list linking to PF-29f (M5). Its metric is not registered, and CS-R1 part 2, CS-T1 and PF-29f are not built, so it shows "Not counted yet".

## 7. Questions for the tech lead (recommendation first)
1. **Drill-through and the overdue-by-person list ship as "not yet" (BR-8, M5).** Recommendation: accept, with two follow-up rows. Drill-through goes with the first list that carries month + person + client type (the invoice list is nearest); the overdue-by-person list goes with CS-R1 part 2 + PF-29f.
2. **Export route and the dashboard additions are outside the row's "Touch" (web only).** Recommendation: add them to `platform/reports/routes.ts` in the same PR (about 120 lines with tests), because only the server can write a trustworthy audit line. The AG-14-32 client-type default departure (BR-3) is recorded with it.
3. **"Not counted yet" widgets:** show muted rather than hide, so the layout stays stable as rows land. Recommendation: show.

## Definition of ready
- **Acceptance tests:** `tests/check_pfr3_reports_browser.ts`, plus the `check_pfr1_reports.ts` additions.
- **Row text:** as written, plus Q1-Q3's answers.
- **Decisions:** P-223 (4), P-392, Q8.
- **Waiting:** the tech lead's approval of r2 and Q1-Q3.
