# Brief: FO-7a2, the trust ledger's reversal and credit-note rules (money; cloud builder lane, the FO-7mv lane; row owner Lead B)

Written 16 Nov 10:1x IST by Lead B (6), rev 16.53. The money rules were confirmed by the release holder, Lead 64 (P-423), on 16 Nov, with one amendment, in rule 2c below. The row comes from FO-7mv's breaker round 2 (#1924; `screens/FO-7mv/break-report.md` B-1, B-3, B-4, B-10 to B-13, B-17; ruling comment 6907485757). **Model: Opus 5.5, effort: high**: money; reviewer and breaker at high, P-605. **It merges before FO-7mv (#1924), which then shrinks.** Unconfirmed: no counsel.

**Starts when:** now. FO-7a is on `main`, and no open PR replaces `money_trust_entry_write` or `money_credit_note_write`. FO-7mv's draft is held at a45f7d1e3, and FO-7b has not touched them; check at start.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-7a2` and take **one row, FO-7a2**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* The requirement text in `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-06-billing-and-payments_v2.1_2026-10-27.md`:
  - **AG-6-60** rule 7 ("a balance below zero (only after a reversal) shows in red");
  - **AG-6-63** rule 7 (cleared);
  - **AG-6-68** rules 5 and 8;
  - **AG-6-75** rules 1 to 6 and its tests;
  - **AG-6-48** rules 3 and 4 and its tests;
  - **AG-6-73** rules 1 and 4;
  - **AG-6-21**, the overpayment rule.
* On `main`: `prisma/schema/client-money.prisma`, FO-7a's migration (`money_trust_entry_write`, `money_credit_note_write`, the write-off function), `tests/check_fo7a_money_schema.ts`.
* `screens/FO-7mv/break-report.md`, on #1924's branch.

**What to build** (one migration replacing the functions named, plus a view; no route, no screen):
1. **Reversals and the shortfall** (`money_trust_entry_write`):
   * **a.** A **reversal** is a correction whose kind is "Returned" (a bounced cheque), "Recorded by mistake" or "Wrong client" (AG-6-75 rule 2). It is **always accepted, even when it takes the party's trust balance below zero** (AG-6-75 rule 4, AG-6-60 rule 7).
   * **b.** **Every other entry that takes money out of trust** (an application to an invoice, a refund, a withdrawal, a move) is refused if it would take the party's **ledger** balance below zero (AG-6-68 rule 8): "Only CAD 169.50 is available." The ledger balance is not the cleared one. **No cleared-balance block:** the "not yet cleared" warning is the routes' job (AG-6-68 rule 5, "The person may continue").
   * **c.** "Returned" is refused on a payment recorded as `E_TRANSFER`, `CARD`, `CARD_TERMINAL` or `CASH` (cleared when recorded, AG-6-63 rule 7). A payment reversed as "Returned" can never be ticked cleared (B-17).
   * **d.** A new view, **`money_trust_shortfall`**: each party (case or person) whose trust balance is below zero, per currency, with the amount and the reversal that caused it. It is for the case's red line, the monthly check and the Owner's Needs you item, whose screens come later.
2. **Credit notes on trust-paid invoices** (`money_credit_note_write` and the write-off):
   * **a.** Trust applied to the invoice, net of returns, counts as already settled.
   * **b.** **Not yet moved:** a credit note on the trust-paid part is accepted only if the same transaction writes a `RETURN` entry to the case's trust balance for that part. The To move line for it is then gone (AG-6-48 rule 4, AG-6-73 rule 4). Otherwise it is refused, naming the amount.
   * **c.** **Already moved to operating** (Lead 64's amendment, P-423). The money is the client's again, so the person chooses either:
     - **"Refund to the client"**, or
     - **"Move back to trust"**: an operating → trust To move line, as AG-6-73 rule 1(b) has for money in the wrong account.

     **It is never kept in operating** (commingling, Code s. 32 as FO-7a cites it; Unconfirmed: no counsel). Here the function records which choice was made (`OVERPAID_REFUND` or `OVERPAID_TO_TRUST`), with the line. The buttons are FO-7b's and FO-7t's.
   * **d.** With trust off, AG-6-21's "Refund · Keep as credit" stays as it is: FO-7ts's credit ledger, `KEPT`, with no trust involved.

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line). In `tests/check_fo7a2_ledger_rules.ts`, a pass and a fail each:
* `FO-7a2 DW1` (B-10): the money in trust is 500.00 cleared plus a 300.00 cheque not yet cleared. Apply 300.00 to an invoice and move it, then refund 500.00. Then reverse the cheque as "Returned".
  - Pass: the reversal is accepted, the balance is −300.00, and `money_trust_shortfall` lists −300.00 CAD.
  - Fail: on the same ledger, a further 1.00 refund → refused, "Only CAD 0.00 is available." (the words AG-6-68 rule 8 uses).
* `FO-7a2 DW2` (AG-6-68 rule 8): an application above the ledger balance → refused with the amount. One equal to it → accepted.
* `FO-7a2 DW3` (B-17): "Returned" on an e-Transfer, card or cash payment → refused. Ticking cleared after "Returned" → refused. A cheque's "Returned" → accepted.
* `FO-7a2 DW4` (AG-6-48's test): INV-0003 is paid from trust, not yet moved. A credit note of 282.50 with its `RETURN` → accepted; trust goes up by 282.50 and its To move line is gone. The same credit note without a `RETURN` → refused, naming 282.50.
* `FO-7a2 DW5` (B-13, Lead 64's amendment): the trust-paid money has already moved.
  - Pass: a credit note with "Move back to trust" makes an operating → trust line of that amount, and "ledger + list = bank" holds. "Refund to the client" records the refund instead.
  - Fail: no choice → refused. A "keep in operating" choice does not exist.
* `FO-7a2 DW6` (B-3): a refund, then a "Wrong client" correction of the deposit → accepted, and the shortfall is listed.
* `FO-7a2 DW7`: the migration test in a parallel world (rows rev 16.7) passes. FO-7a's suite passes, except the tests that asserted the old refusal; name each in the PR body under "Changed tests". Its functions keep the `money_` prefix.

**Touch list:** one migration folder, replacing the functions above and adding the view; `prisma/schema/client-money.prisma` only if a column is needed (say which); `tests/check_fo7a2_ledger_rules.ts`; FO-7a's suite, only the tests named under "Changed tests"; `api/src/client-money/MODULE.md` (two invariants: "a reversal may go below zero, shown"; "trust-paid money returns to trust or the client, never stays in operating").

**Duplicate check (P-526):** BACKLOG (FO-7a2; FO-7mv takes its checks out after this), open PRs (#1924 is held), `main`, BUGS; one `Duplicate check:` line.

**Parallel safety:** these functions are FO-7a's. Nothing else may replace them while this runs: FO-7mv is held, and FO-7b and FO-7ts must not edit them. After this row merges, FO-7mv merges `main` in, re-stamps its migration later than this one, and removes its party cover check, the settings-row touch, the invoice cap and `least()` (lane plan, #1924 comment 6907490951).

**Reviewer and breaker** (P-278, money). The breaker tries:
* a reversal and a refund at the same moment, from two connections;
* a "Returned" on a part-applied cheque;
* a credit note larger than the trust part;
* a move-back line for another firm's invoice.
The release holder reads the migration before the label (P-423).

**P-610:** under 800 changed lines (estimate about 450).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; database functions carry the `money_` prefix and your migration stamp is later than the newest on `main` (rows rev 15.2); every token earns its outcome (P-556).
