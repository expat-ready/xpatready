# Brief: FO-7ts part 2, two ledgers under the party lock (the pre-case → case pair and the credit ledger) (cloud builder lane; row owner Build Lead C)

Written 18 Nov by Build Lead C. **Approved for building.** The specification is "Part 2" of the draft `product/design/briefs/FO-7ts.md` on `main` (its What to build, DW5-DW8, DW10, DW12-DW14 and touch list); where this page differs, this page wins. Release 1 rows **R1.58** and **R1.59** (map 58, 59), part 2 of 3.
**PR title:** `migration — runtime: FO-7ts part 2 — the pre-case → case pair and the credit ledger, under the party lock`
**Model:** Opus 5.5, effort high (schema, money). Builder, reviewer and breaker at high (P-608 (2)).

**Ready when:** **#2106 (FO-7ts part 1) is merged and FO-7lk is merged**, in that order.
* `client-money.prisma` takes one migration at a time. The series is: #2106 (part 1) → **FO-7lk** (a lock-order fix, functions only; `build-lead-c-briefs/FO-7lk.md`) → **this part** → part 3 → FO-7v part 1 and FO-7m part 1. Never two money migrations open at once.
* FO-7lk goes first because it adds the helper `money_trust_lock(firm, party, currency)` and moves every party-lock call site to it. This part's new writers use that helper, so the key text cannot drift.
* If FO-7lk kept the inline key (its own fallback), use the inline key `hashtextextended('money_trust:' || firm || ':' || party || ':' || currency, 0)` exactly, and add the string-compare test FO-7lk names.
* Migration stamp later than every migration on `main` (part 1's is `20261117133000_fo7ts_money_settings` on #2106); re-stamp on top of `main` before the label (P-600 (d)).

**What P-634 changes in the draft (read this before the draft):**
* The draft's line "trust never goes below zero (P-607 (1))" is out of date. **P-634 (1)** (16 Nov) supersedes it: a reversal (Returned, Recorded by mistake, Wrong client) is always accepted, even below zero, and shows in the view `money_trust_shortfall`. Every other outflow stays at or under the ledger balance. #1991 (FO-7a2) built this on `main` (`20261116133000_fo7a2_ledger_rules`, `money_trust_entry_write` lines 152-154: "a reversal is always recorded, even below zero").
* So in this part, **the − half of a move pair is an outflow from the pre-case balance**: it is at most the party's pre-case balance in that currency, read under the party lock, and is refused when that balance is zero or below. The pair never takes anything below zero by itself.
* The **credit ledger is not trust**. P-634 does not touch it: a holder's credit balance never goes below zero.

**What to build:** the draft's Part 2, exactly. Named here so nothing is missed:
* **The pre-case → case pair** (AG-6-60 rules 3, 5, 9):
  * `MOVE_TO_CASE` added to `MoneyTrustEntryKind`; `money_trust_entry.moved_from_entry_id` (nullable; composite key `(firm_id, moved_from_entry_id)` to the same table, RESTRICT).
  * **One `CREATE OR REPLACE` of `money_trust_entry_write`**, starting from the text on `main` (FO-7a2's, after FO-7lk), changing only what the pair needs. The rules run after the party lock: the − entry has `case_id` null and a negative amount, at most the pre-case balance; the + entry names the − entry, has the same party and currency, the opposite amount and a `case_id`, and is written in the same transaction.
  * Exactly one + per −, by a **deferred constraint trigger at commit**.
  * A `CORRECTION` naming a `MOVE_TO_CASE` entry is refused. FO-7a2's check (line 106: "a correction names a withdrawal … or a deposit") already does it: prove it with DW8.
  * The pair is allowed in any trust state (it brings no money in). The case's currency and client are not checked here (the move route's row).
* **The credit ledger** (AG-6-21 rules 2-3, 5, §7; AG-6-23 rule 1): `money_credit_entry` with the draft's columns, kinds `KEPT | APPLIED | REFUNDED | REVERSED` (`MoneyCreditKind`), signs, required links and reason, the database's `seq` and `balance_after_minor` per holder and currency, insert-only.
  * Its trigger takes **the party lock first** (through `money_trust_lock`), then reads any invoice row. One lock order for every money write.
  * The holder's balance never goes below zero. `KEPT` on one payment, net of its `REVERSED`, never exceeds what that payment left over after its invoice. `APPLIED` only to an invoice of the same holder and currency, draft or issued. `REVERSED` names one `KEPT` or `APPLIED` entry, and never more than it in all.
  * Join PF-12's walls in this migration (the same policy pattern as the other `money_*` tables, P-584 (10)). `tests/check_pf12_walls.ts` on `main` guards every table matching `^(platform_|fo_|money_|msg_|auto_|plat_complaint)` (line 30), so it fails if the wall is missing.
* The header comment of `client-money.prisma`: one line for part 2.
* `api/src/client-money/MODULE.md`: one invariant line, "a move to a case is a pair that nets to zero; credit is per holder and never below zero".

**Done when (P-606):**
* `tsx studio/tests/check_fo7ts_money_settings.ts` exits 0 (the file part 1 added), with the draft's **DW5, DW6, DW7, DW8, DW10, DW12, DW13 and DW14** each passing and failing as named, and these four more:
  * **DW21 (outflow only from what is held, P-634):** a party with pre-case CAD 0 after a returned cheque took it to CAD −50.00 → a move of CAD 1.00 to a case is refused, and `money_trust_shortfall` still lists the party at −50.00. Pass: with pre-case CAD 150.00, the pair is accepted and the view is unchanged.
  * **DW22 (not on the To move list):** after a pair, `money_to_move` has no line for either entry. Fail: a hand-made `money_move_line` naming the + entry is refused by `money_move_line_write` ("a trust application moves a withdrawal to an invoice").
  * **DW23 (one lock key):** the credit trigger and the move pair take the same advisory lock as a deposit on that party and currency: with a deposit's transaction held open, a credit write on the same party waits (seen in `pg_locks`), and one on another party does not.
  * **DW24 (walls):** firm A's session reads no `money_credit_entry` row of firm B; an insert naming firm B is refused.
* Changed only in the assertions the draft's touch list names: `check_fo7a_money_schema.ts` (the `*_minor` count = the count on `main` when you start, plus 2).
* Pass unchanged: `check_fo7a2_ledger_rules.ts`, `check_fo7mv_move_list.ts`, `check_fo7lk_lock_order.ts` (FO-7lk's), `check_pf12_walls.ts`, `check_prisma_schema.ts`; demo reset and checkpoint load; full `ci` green.

**Duplicate check:** `git grep -n -i "credit_entry\|MOVE_TO_CASE\|moved_from_entry\|money_trust_lock" origin/main -- prototype/studio/prisma prototype/studio/api prototype/studio/tests` (18 Nov): nothing (and nothing on #2106's branch). Not verified: `money_trust_lock` exists only once FO-7lk merges; re-run the grep when you start.

**Touch list:**
* `prisma/schema/client-money.prisma` + one new migration folder (with a rollback note that restores `main`'s `money_trust_entry_write` text exactly)
* `tests/check_fo7ts_money_settings.ts` (the part 2 cases)
* `tests/check_fo7a_money_schema.ts` (the `*_minor` count only)
* `api/src/client-money/MODULE.md` (one line)

No route, no screen, no `ports/` change.

**Review:** an Opus reviewer **and the breaker** (schema, money, P-278). The breaker tries:
* a move pair split across two transactions;
* moving more than the pre-case balance while a deposit lands in parallel;
* a move from a party already below zero;
* a correction of a move;
* two connections applying the same CAD 200.00 credit;
* credit applied while the payment that kept it is being reversed;
* a credit write that takes the invoice row before the party lock.

**The Lead reads the migration (P-423)** before the label; Build Lead C reads it first.

**Holds:** `client-money.prisma` and the migration baton for the life of the PR. Do not edit `money_move_line_write`, `money_trust_entry_moves`, `money_to_move`, `money_move_batch` or `money_credit_note_write`; if a step needs one, stop and ask.

**Question for the tech lead (in the PR, before coding):** may a pre-case → case pair run while the party's **case** balance is below zero (after a reversal on that case)? Recommended: yes. The pair nets to zero for the party, and it puts held money where the shortfall is. FO-7a2's rule "a party below zero cannot move its unmoved applications" (AG-6-75 r3) is about the To move list, not this pair.

**Standard rules:** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. Once #2003 is on `main`, merge `main` before the first push.
