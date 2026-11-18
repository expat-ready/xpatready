# Brief: FO-7lk, one lock order for "Move back to trust" (cloud builder lane; row owner Build Lead C)

**Model:** Opus 5.5, effort medium.

**PR title:** `migration — runtime: FO-7lk — a move-back credit note takes the party lock first (no 40P01)`

**Ready when:** #1991 (FO-7a2) is merged, and FO-7ts part 1 has merged or holds no `client-money.prisma` or migration baton.
* This row is the next link in the `client-money.prisma` series, after FO-7ts part 1. It is never alongside another money migration.

**Why (Lead 73's money read on #1991, b8be2f9, 08:xx IST 17 Nov; Minor, not blocking):**
* A credit note with `overpaid_choice = 'OVERPAID_TO_TRUST'` ("Move back to trust") takes **the invoice row first**: `money_credit_note_write` (BEFORE INSERT) reads the invoice through `money_issued_invoice`.
* It takes **the party's lock second**: `money_credit_note_owed_back` (AFTER INSERT) inserts the CORRECTION into `money_trust_entry`, whose trigger takes `pg_advisory_xact_lock(hashtextextended('money_trust:' || firm || ':' || party || ':' || currency, 0))`.
* A withdrawal to the same invoice takes the **party lock first, then the invoice row** (#1991's migration, the comment "The party's lock first, before any invoice row is touched").
* If both run at once on one invoice, Postgres refuses one of them with **40P01 (deadlock)**. The money stays right, but a person sees an error for an action that was valid.

**The change (one migration, functions only, no table change):**
1. `CREATE OR REPLACE FUNCTION money_credit_note_write()`: when `NEW.overpaid_choice = 'OVERPAID_TO_TRUST'`, the first statement after the argument checks reads the party and currency of `NEW.overpaid_entry_id` (from `money_trust_entry`, by firm and id). It then takes the **same** advisory lock key the trust entry trigger uses, **before** `money_issued_invoice` or any other read of the invoice.
   * Use one helper for the key, `money_trust_lock(firm uuid, party uuid, currency text)`, and switch the existing call sites to it in the same migration, so the key text can never drift. If that widens the diff past what the reviewer can read in one sitting, keep the inline key and add a test that compares the two strings instead.
2. Nothing else changes. The lock is a transaction lock, so taking it twice in one transaction (again in the trust entry trigger) is a no-op.
3. A rollback file restores #1991's function text exactly.

**Done when (test `tests/check_fo7lk_lock_order.ts`, isolated database, fake clock, no live calls):**
* **Pass:** two connections at once on the same invoice and party: (A) a "Move back to trust" credit note, (B) a withdrawal to that invoice. Run each order (A then B, and B then A) 20 times with a barrier so they overlap. **No 40P01**; each pair either commits both or refuses one with the ledger's own words, never a deadlock. The balances after each run match a hand-worked total.
* **Fail (planted):** the same harness against #1991's function text (the rollback applied) shows at least one 40P01 in 20 runs. If it never deadlocks there, say so in the PR body with the run count; do not count the pass as proved.
* **Neither:** an `OVERPAID_REFUND` credit note and a plain credit note take no party lock (no new waits). Asserted through `pg_locks` while the transaction is held open.
* The existing `check_fo7a2_ledger_rules.ts`, `check_fo7a_money_schema.ts` and `check_fo7mv_move_list.ts` still pass unchanged.

**Review:** an Opus reviewer, plus the breaker (money, P-278). The Lead reads the migration (P-423) before the label.

**Holds:**
* The lane touches only this migration, the test and `api/src/client-money/MODULE.md` (one invariant line: "every trust write takes the party lock before the invoice row").
* No other function changes, and no screen.

**Standard rules:** branch from `origin/main`. One small PR. Under P-683, get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Live AI off, US$0, never a priced button (P-175). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. Once #2003 is on `main`, merge `main` before the first push.

**Overlapped chain (Lead 81, the founder's "start doing it", 18 Nov 22:5x IST; this replaces "Ready when" and "branch from `origin/main`" above):** branch from #2106's head (FO-7ts part 1, `claude/awesome-allen-009z29`, 8a34b34e5), not from `main`. Build, test and get "Reviewer: Approve <head>" on the branch. Open the PR only after #2106 merges; then merge `main` (P-270), re-stamp later than `main`'s newest with the current Lead's slot (P-600), and get a diff-only Approve. FO-7ts part 2 branches from this row's approved head.
