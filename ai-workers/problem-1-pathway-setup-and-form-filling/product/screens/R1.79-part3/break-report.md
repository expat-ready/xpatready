# R1.79 part 3 (PF-R2cm): break report

Draft PR #3812, branch `claude/runtime-pfr2cm`, commit `801724efd603ce791a996ab6ad8b4e55e76e2d4b`. API only, so no browser was used.
Method: I copied the setup of `studio/tests/check_pfr2cm_metrics.ts` (lines 1-95) into a scratch test, `studio/tests/scratch_break_pfr2cm.ts`, deleted afterwards and not committed. It uses the same two Sample firms, the replica-role fixtures and the walled pool inside `withFirm`. Every figure was asked through `ReportsController.query`, except the timing loops, which call `read` directly as `overBudget` does. It ran from `prototype/` against Postgres 127.0.0.1:54329, in its own `xr_studio_pfr2cmbrk_<pid>` database, dropped at the end (checked: no `%pfr2cm%` database is left). The demo database was not touched. The PR's own test passes: 34 passed, 0 failed.
Paths below are under `prototype/studio/api/src/client-money/reports/`.

## Findings

**M1 (Major): with a person filter, trust received leaves out money moved to the case and can go negative.**
`metrics.ts:81` narrows trust entries by `e.case_id`. `metrics.ts:112-116` counts only DEPOSIT, REFUND_TO_CLIENT and a CORRECTION of a deposit. That breaks for the usual FO-7ts flow:
- A deposit lands on the party with no case (`case_id` null; the − half of MOVE_TO_CASE must also have no case: `money_trust_entry_move_check`).
- It is then moved to a case. The + half is on the case, but MOVE_TO_CASE is never counted.
- A refund from the case's trust is counted, and it is on the case.

So, for the person who owns the case, the money that came in never shows, while every refund out of it is subtracted.
- Repro (scratch T5, firm A, November): deposit 1,000.00 to Client A with no case; MOVE_TO_CASE −1,000.00 / +1,000.00 onto user-O's case; REFUND_TO_CLIENT −300.00 on that case.
- Expected: firm-wide 700.00; with `staffId = user-O` 700.00 (or at least nothing below zero).
- Actual: firm-wide `{"CAD":"700.00"}` (right); with `staffId = user-O` **`{"CAD":"-300.00"}`**.

A person filter thus shows a negative "Trust received" on the Owner's dashboard. DW6 tests the person filter only on fees billed and tax (`check_pfr2cm_metrics.ts:199-202`), never on trust.

**m1 (Minor): overdue by client ranks CAD and USD amounts against each other before the 200-row cut.**
`metrics.ts:188` orders all rows by `sum(o.due) desc` across both currencies. `metrics.ts:192` then keeps the first 198 rows. A USD amount is compared with a CAD amount as if they were the same money, which is an implicit at-par conversion (AG-14-15 "never converted"). So a currency with few clients can lose every named row.
- Repro (scratch T7, solo firm): 247 CAD clients each 1,000.00 overdue and 3 USD clients each 900.00 overdue.
- Actual: 200 rows. Every USD client is folded into `{"client":"3 more clients","currency":"USD","overdue":"2700.00"}`, so no USD client is named, while 198 CAD clients are.
- Expected: the cut decides per currency. For example, each currency keeps its own most-owed rows, so the 3 USD clients would be named.

No sum mixes currencies (the "more" rows are per currency and add up correctly: 49 × 1,000.00 = 49,000.00).

**m2 (Minor): the overdue figures go over the 200 ms budget (STANDARDS §9) when a firm has many credit applications.**
Load: one firm with 3,250 issued invoices, 15,000 operating payments, 30,000 trust deposits, 30,000 APPLIED credit entries and 15,000 REVERSED entries.

| Figure | Time (ms) |
|---|---|
| fees_billed | 41-63 |
| fees_collected | 22-49 |
| trust_received | 21-50 |
| tax_collected | 5-10 |
| **overdue_total** | **205-384** |
| **overdue_ageing** | **207-277** |
| **overdue_by_client** | **229-296** (first read 840) |

`overBudget(..., {})` and `overBudget(..., NOV)` both name all three overdue figures.

Taking the load apart (overdue_total, 3 runs each):

| Credit entries | Time (ms) |
|---|---|
| none | 44-64 |
| 3,000 APPLIED | 63-70 |
| 9,000 | 87-94 |
| 15,000 | 116-134 |
| 30,000 (with or without reversals) | 205-250 |

That is about 6.5 ms per 1,000 credit applications. The budget breaks at roughly 22,000 applications in one firm, from the `ae`/`ap` path at `metrics.ts:134-137` (EXPLAIN: a per-entry SubPlan for the reversals inside the aggregate). DW8's bulk (`check_pfr2cm_metrics.ts:217-223`) has no credit entries and no trust entries, so the budget test cannot see this. Minor because 7 applications per invoice is well above a realistic rate; it is a test gap more than a live risk.

**m3 (Minor): "1 more clients".** `metrics.ts:193` builds the label as `` `${m.length} more clients` `` with no singular form. One remaining client in a currency reads "1 more clients".

## What held
- **Fees billed**: issued totals (tax and government fees in) less credit notes. Drafts never count. A credit note dated later counts on its own day (it can make a period negative, by design: MS-D24). Billed equals the all-time figure for 1900-01-01..9999-12-31.
- **Fees collected**:
  - A payment dated before its invoice's issue counts on the issue day. Scratch T2: a payment of 77.77 recorded 20 Oct on an invoice issued 5 Nov gives October `{}` and 5 Nov `{"CAD":"77.77"}`.
  - A trust deposit is never fees, and credit applied is never counted.
  - Refunds are subtracted once. A refund of a trust payment cannot exist (`invoices/refunds.ts:48` refuses it).
  - "Move back to trust" is subtracted once, as the CORRECTION the trigger `money_credit_note_owed_back` writes against the withdrawal.
  - "Refund to the client" (OVERPAID_REFUND) is subtracted once, through `overpaid_minor`. No `money_refund` row exists for it, so nothing doubles.
- **Trust received**: a correction of a deposit is taken off. A correction of a withdrawal and a MOVE_TO_CASE pair change nothing firm-wide. The trust figure is empty while trust does not show. Currencies are tied to the invoice and payment by triggers, so `i.currency` and `e.currency` cannot disagree.
- **No CAD+USD sum** appears in any figure or row, and each MONEY figure holds each currency once.
- **Amounts**: they are int4. A sum past 13 digits would fail the `Money` schema and answer UNAVAILABLE, never a wrong number; it is not reachable with int4 amounts.
- **Permissions**, through the door:

| Caller | Answer |
|---|---|
| view.all without view-financial | `WITHHELD` |
| Case Officer with a forged `scope:"financial"` | `WITHHELD` |
| Owner with a forged `scope:"own"` | `OK`, scope `financial` |
| view-financial only | `OK` |
| no report key | 403 |

- **Person filter**:

| `staffId` named | Answer |
|---|---|
| the solo firm's staff | `{}` |
| a random uuid | `{}` (`case-access.ts:27-28`: not a member, so no scope) |
| user-O in upper case | same as lower case (`{"CAD":"115.00"}` both) |

- **Walls**: the solo firm filtered by firm A's officer reads `{}`, and it never shows firm A's money (DW6 plus scratch T6).
- **Time**, America/Toronto (DST ended 1 Nov 2026):
  - Issued 31 Oct 23:30 EDT counts on 31 Oct only; 1 Nov 23:30 EST on 1 Nov; 2 Nov 00:00 EST on 2 Nov.
  - `from = to` reads exactly one firm day.
  - Due 25 Nov: not overdue at 25 Nov 22:00 Toronto (26 Nov 03:00Z), and 33.33 is overdue at 00:30 on 26 Nov.
  - 1900-01-01..1900-12-31 reads `{}`; 9999-12-31 reads `{}`; `from: 2026-02-30` is refused (422).
  - Ageing boundary days 0/1/30/31/60/61/90/91 are covered by DW4.
- **Cap**: over 200 clients the answer is exactly 200 rows, with one "N more clients" row per currency and correct sums; nothing is cut silently.
- **Speed outside credit applications**: 30,000 trust entries give trust_received 21-50 ms; fees billed with no date filter over 3,250 invoices takes 41-63 ms.

## Not checked
The live HTTP server and guard: the route was called directly, as the PR's test does.
