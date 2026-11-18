# Brief: FO-7ts part 3, the four accepted steps (trust refund details, tax treatment, the same-case pick, the newest-issued index) (cloud builder lane; row owner Build Lead C)

Written 18 Nov by Build Lead C. **Approved for building.** The specification is "Part 3" of the draft `product/design/briefs/FO-7ts.md` on `main` (its What to build, DW10, DW15-DW18 and touch list); where this page differs, this page wins. Release 1 rows **R1.56** and **R1.58** (map 56, 58), part 3 of 3.
**PR title:** `migration — runtime: FO-7ts part 3 — trust refund details, tax treatment, same-case pick, newest-issued index`
**Model:** Opus 5.5, effort high (schema, money). Builder, reviewer and breaker at high (P-608 (2)).

**Ready when:** **FO-7ts part 2 is merged** (`build-lead-c-briefs/FO-7ts-2.md`), and **the Lead has read the pick guard's plan before you start** (P-423; Lead B rev 16.37 (3)). Post the plan as the PR's first comment: the exact condition the new guard accepts, in SQL.
* `client-money.prisma` order: #2106 (part 1) → FO-7lk → part 2 → **this part** → FO-7v part 1 and FO-7m part 1, one at a time. FO-7g part 2 and FO-7p part 1 take the file after this part, never two at once.
* Migration stamp later than every migration on `main`; re-stamp on top of `main` before the label (P-600 (d)).

**What P-634 changes in the draft:** DW17's line "trust never goes below zero" now reads: **a pick is an outflow, so it never takes the paying party below zero** (P-634 (1): only a reversal may). A pick from a party that is already below zero is refused. #1991's outflow check (`money_trust_entry_write`, "Only % % is available; the trust balance would go below zero") stays as it is on `main`.

**What to build:** the draft's Part 3, exactly. Named here so nothing is missed:
* **Trust refund details** on `money_trust_entry`, for `REFUND_TO_CLIENT` only (AG-6-23 rules 2-3, §7): `refund_method` (an offline method; `CARD` refused), `refunded_on` (date), `refund_reference`; the payee (`payee_person_id` or `payee_company_id`, or `payee_name`); `payee_reason`, required when the payee is not the entry's party. Other kinds carry none of them (a CHECK).
* **Tax treatment** (AG-6-4 rule 2, §7): enum `MoneyTaxTreatment` `TAXABLE | ZERO_RATED | EXEMPT`; `money_party_tax_treatment` (firm, party, treatment; one per party; joins PF-12's walls in this migration); `money_invoice.tax_treatment` (null = the party's, else Taxable), frozen at issue. Extend the freeze in **#2106's `money_invoice_write`** (the column list at its lines 196-197 on #2106) by this one column. The rules that use treatment are FO-7g part 2's.
* **The same-case pick** (AG-6-68 rule 4, §7; Lead 61's ruling on #1881, comment 6901156791, which wins over Lead B's wider text): on `money_trust_entry`, for `WITHDRAWAL_TO_INVOICE`, `picked_other_funds_by` (equal to `created_by`), `picked_other_funds_at` (the database's) and `picked_other_funds_reason` (`money_text_ok`). In **one `CREATE OR REPLACE` of `money_trust_entry_write`** (from `main`'s text after part 2), the refusal "trust pays only an invoice of the same party and currency" (line 92 on `main` today) accepts another party **only when** all three are set, the currency is the same, and the entry's case and the invoice's case are one and the same non-null case. Across cases, or with no case, it is still refused. The party lock order is unchanged. Another case of the same party is recorded as a pick the same way.
* **Index:** `CREATE INDEX IF NOT EXISTS` on `money_invoice (firm_id, issued_at DESC, id)` (AG-6-30 rules 2, 4).
* The header comment of `client-money.prisma`: one line for part 3.

**Done when (P-606):**
* `tsx studio/tests/check_fo7ts_money_settings.ts` exits 0, with the draft's **DW10, DW15, DW16, DW17 and DW18** each passing and failing as named (DW17 as amended above), and these three more:
  * **DW25 (pick never below zero):** party A holds CAD 100.00 on case K; party B's invoice on case K is CAD 300.00 → a pick of CAD 100.00 is accepted and A is at 0; a pick of CAD 100.01 is refused with #1991's words. After a returned cheque takes A to CAD −50.00, any pick from A is refused.
  * **DW26 (the lock is the paying party's):** a pick from A and a deposit to A at once run in turn (A's lock), with no 40P01 over 20 runs; a pick from A and a deposit to B do not wait on each other (`pg_locks`).
  * **DW27 (refund details only on a refund):** `refund_method` on a `DEPOSIT` or a `WITHDRAWAL_TO_INVOICE` → refused; a `REFUND_TO_CLIENT` with no method → refused.
* Changed only in the assertion the draft names: `check_fo7a_money_schema.ts` (the "only due_date is a date" list gains `money_trust_entry.refunded_on`, on top of whatever is on `main`).
* Pass unchanged: `check_fo7a2_ledger_rules.ts`, `check_fo7mv_move_list.ts`, `check_fo7lk_lock_order.ts`, `check_pf12_walls.ts`, `check_prisma_schema.ts`; demo reset and checkpoint load; full `ci` green.

**Duplicate check:** `git grep -n -i "refund_method\|tax_treatment\|picked_other\|issued_at DESC" origin/main -- prototype/studio/prisma prototype/studio/api prototype/studio/tests` (18 Nov): nothing (and nothing on #2106's branch).

**Touch list:**
* `prisma/schema/client-money.prisma` + one new migration folder (with a rollback note that restores `main`'s `money_trust_entry_write` and `money_invoice_write` text exactly)
* `tests/check_fo7ts_money_settings.ts` (the part 3 cases)
* `tests/check_fo7a_money_schema.ts` (the date list only)
* `api/src/client-money/MODULE.md` (one line: "a pick of another payer's money is same-case only, by a person, with a reason")

No route, no screen, no `ports/` change. "Never pre-ticked" and the pick's audit line are FO-7t part 2's route tests.

**Review:** an Opus reviewer **and the breaker** (schema, money, P-278). The breaker tries:
* a pick between two clients' cases, and a pick with no case on either side;
* a pick with no reason, or by a person other than the writer;
* a pick in another currency;
* a pick from a party below zero;
* a refund with `CARD` as its method, and a third-party payee with no reason;
* changing `tax_treatment` on an issued invoice.

**The Lead reads the migration (P-423)** and the pick guard twice: the plan before coding, the code before the label. Build Lead C reads it first.

**Holds:** `client-money.prisma` and the migration baton for the life of the PR. Do not edit `money_move_line_write`, `money_trust_entry_moves`, `money_to_move`, `money_move_batch` or `money_credit_note_write`; if a step needs one, stop and ask.

**Questions for the tech lead (in the PR, before coding):**
1. Should a trust refund also refuse `CARD_TERMINAL` as its method? Recommended: yes, because trust money never goes through a card (P-567 (3)). The draft refuses only `CARD`, and part 1 (#2106) added `CARD_TERMINAL` without the trust refusal, because Lead B had not accepted that proposal.
2. QA-482 (see `FO-7b.md`): should the line-tax CHECK become exact (round half to even) here, while no route writes lines? Default: **no**. This part ships without it unless the answer is yes before coding.

**Standard rules:** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. Once #2003 is on `main`, merge `main` before the first push.

**Build Lead C ruling (18 Nov):** a trust refund also refuses `CARD_TERMINAL` until FO-7c (card payments) is built. Card refunds belong to FO-7c. The refusal is in words and has a test case.

**P-701 (founder, 20:29 IST 18 Nov, "Yes, GST/HST only"):** Release 1 invoices charge GST/HST only, at the CRA rates cited with page, quote and date (P-170). No PST, RST or QST. Unconfirmed: no accountant or counsel.
