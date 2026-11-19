# Brief: FO-2pv — staff set a prospect's value and currency (QA-530, R1.31's totals) (row owner Lead B / Build Lead A)

Written 19 Nov 20:56 IST by Lead B (7). **Model: Opus 5.5, effort: medium.**
**Duplicate check:** no open PR or BACKLOG row lets staff set `value_cents`/`currency`. Checked 20:56 IST against the open PRs and BACKLOG on main. FO-2bp, board paging (AG-2-18 rule 6), is a different row. qa 9 filed this gap as QA-530 (#2296).

## The gap (QA-530, Major)
`fo_prospect.value_cents` and `currency` exist on main, but no route or screen sets them. PATCH/PUT on a prospect answers 404. R1.31's totals per currency (AG-2-18 rules 3 and 5) therefore always read "no values yet", and J-31 seeds the values with SQL.

## The part
* **API:** `PATCH /api/front-office/prospects/:id` with `{ value, currency }` only in this part. The key is `agent/prospect:edit`, own or all as FO-2v (an unseen prospect answers 404).
  * `value` is a decimal amount ≥ 0 with at most 2 places, stored as `value_cents`, or `null` to clear it.
  * `currency` is an ISO 4217 code (three capital letters, checked against one fixed ISO 4217 list in a shared module); the firm's default currency is the one shown first.
  * A bad value answers 422 with `fields.value` "Enter an amount of 0 or more, with at most 2 decimal places."; a bad currency answers 422 with `fields.currency` "Choose a currency.".
  * The edit writes one audit line with ids and the currency only, never the amount (PF-23). **No currency conversion, ever** (AG-2-18 non-goal, R18).
* **Screen:** the prospect page gets a "Value" row with an edit control (amount plus currency). The board and the list read the new values; totals per currency follow on reload.
* **J-31:** its totals step sets the values **through the screen** instead of SQL. Then qa 9's `tests/qa/check_r131_gate_a_value.ts` passes.

## Done when
`tests/check_fo2pv_prospect_value.ts`, with a pass and a fail each:
* setting CAD 1200.50 stores 120050 and CAD;
* a negative amount, three decimal places or an unknown currency gives 422 at the field, and nothing changes;
* `null` clears the value;
* another firm's prospect, or an unseen one under own-only, gives 404;
* the audit line holds no amount.

Also: J-31 sets the values through the screen and passes; qa's `check_r131_gate_a_value.ts` passes; keyboard only, axe-core, and 375, 1024 and 1440 px.

## Touch list
`api/src/front-office/sales/prospects.ts` (or a new `sales/prospect-edit.ts`) and its route line, the prospect page's Value row under `web/src/modules/front-office/sales/`, `tests/check_fo2pv_prospect_value.ts`, `tests/journeys/j_31.ts` (its totals step), and `MODULE.rows/FO-2pv.md`. No migration (the columns exist). Under 800 lines.

## Lane
R1.30+R1.31's lane (FO-4 part 2a), one PR, through Proven (P-719). qa 9 re-proves R1.31.
Source: AG-2-18@106c6d01, QA-530, P-733.
