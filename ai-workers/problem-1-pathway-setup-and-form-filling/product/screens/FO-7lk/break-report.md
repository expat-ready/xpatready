# FO-7lk break report: one lock order for "Move back to trust"

Breaker (money, P-278), head 9f30e673 on `claude/trusting-fermat-ejsqdh`. Database only (no screen, no route), so the screen attacks in the general brief (uploads, 1024 px, keyboard, zoom) do not apply. PostgreSQL 18.3 at 127.0.0.1:54329. I built four scratch databases from every `migration.sql` in order (`-1 -f`): `_break_t` (all migrations), `_break_pre` (every migration before FO-7lk), `_break_back` (all migrations, then `rollback.sql`) and `_break_reapply` (a copy of back with FO-7lk's migration applied again). All four `xr_studio_fo7lk_break_*` databases are dropped. Scripts are in the session scratchpad (`breaker/break.mts`, `breaker/hostile.mts`). No repository file changed except this one.

## Findings

**B-1 (Minor): an invalid "Move back to trust" can now make a valid write fail with 40P01. Before FO-7lk the same pair never deadlocked.**
* **Where:** `migration.sql:171-173`. The new block locks the party of `overpaid_entry_id` **before** checking that this entry is a withdrawal to this invoice. That check is at `:185`, after `money_issued_invoice` has also taken the invoice party's lock. When the entry belongs to another party, the note takes two party locks: the entry's party, then the invoice's. That is the reverse of the order a two-party undo takes them (by party uuid, `:228`).
* **What I did** (`hostile.mts`, H2):
  * Set up two persons, lo and hi (uuid order). Each has a withdrawal of 100.00, and one move batch moves both withdrawals.
  * (V) A valid undo of that batch. It locks lo, touches lo's invoice, then locks hi.
  * (H) A credit note on lo's invoice with OVERPAID_TO_TRUST naming **hi's** withdrawal. This is invalid and is always refused.
  * A gate connection holds lo's key. V and H are sent and both are seen waiting, then the gate lets go.
* **Expected:** V commits and H is refused in the ledger's words (23514). That is what #1991's text does: on `_break_back`, 20 of 20 runs gave V ok and H 23514.
* **Actual on FO-7lk (`_break_t`):**
  * Gate released at once: 10 of 10 runs, V ok and **H 40P01**.
  * Gate held 400 ms after both waits, so the undo is the one that detects the deadlock: 10 of 10 runs, **V (the valid undo) 40P01** and H 23514.
* **Effect:** money stays right (both transactions roll back whole). But a person who undid a batch sees a deadlock error for a valid action, which is the outcome FO-7lk exists to prevent. The trigger is a request the ledger refuses anyway (a bug or a hostile caller with xr_app in the same firm), so it is rare. Any valid writer that takes the two parties' locks in the other order is exposed the same way, for example a multi-statement transaction or a mismatched currency of one party (the same class; not run separately).
* **Reproduce:** `tsx hostile.mts <db> 10` against a database with all migrations, and again against one with the rollback applied; compare the H2 lines.
* **Possible direction (not applied):** take the lock only when the entry's party and currency equal the invoice's, or lock the invoice's party read without a row lock. Either way, at most one party key is taken before the invoice row.

**N-1 (note, not FO-7lk's): a stale shared checkout can make another money test fail.** During my run, another session switched this checkout to `claude/trusting-fermat-ejsqdh-fo7ts2` and left uncommitted edits in `client-money.prisma` (FO-7ts part 2). While those were present, `check_fo7a2_ledger_rules.ts` gave 34/1 (the DW7 `migrate diff` named `money_credit_entry` and `MoneyCreditKind`). On a clean `git archive 9f30e673` export it gives **35/0**. The checkout was back on this branch, clean, when I finished.

## Attempts that held

| # | Attempt | Result |
|---|---|---|
| 1 | Builder's test `check_fo7lk_lock_order.ts`: once alone, then three copies at once (flakiness under load) | 15/0 each time (4 runs). The planted order deadlocked 20/20 in the B-then-A order every time; #1991's text 0/40 every time. Barrier and refusal wording were stable. |
| 2 | Concurrency matrix, `break.mts`: 24 writer pairs × both orders × person and company party × 5 runs = 480 runs per database. A gate holds the party key and both writers are seen waiting first. Writers: move-back (two at once, and against a smaller one), refund-choice note, plain note, withdrawal, return of a withdrawal (correction), write-off, undo of the move batch, a new move line, "Trust first" (payment into trust on the invoice + deposit + withdrawal in one transaction), refund to client, operating payment + refund, multi-statement [note + withdrawal], [move-back + withdrawal to the party's 2nd invoice] against the reverse order, and [move-back + withdrawal] against an undo | Read committed on FO-7lk: **0 × 40P01**. Every outcome is "both commit" or "one refused 23514 in the ledger's words". Invariants held in every run: seq unbroken, each balance equals the running sum, credits + write-offs + net trust paid ≤ total, returns ≤ applied, moved ≤ held. The 20 runs without a full barrier are the operating refund, which takes no party lock (as expected). |
| 3 | Same matrix on the rollback database | Outcome table **identical** to FO-7lk's (diffed). No change in behaviour for any valid pair. |
| 4 | Same matrix at REPEATABLE READ on FO-7lk | 0 × 40P01. The second writer gets 40001 (retryable serialisation failure), never a wrong balance. |
| 5 | Is the helper's key the old inline key? `money_trust_lock` vs `hashtextextended('money_trust:'‖firm‖':'‖party‖':'‖cur)`, CAD and USD | The one advisory key held equals the inline key, and another connection cannot take it. At each call site (withdrawal, write-off, move-back, undo) a company party in USD held exactly that one key. |
| 6 | Null firm, party or currency passed to the helper | No lock and no error (strict), as inline. A trust entry or invoice with no party, or with both, is refused (party checks / balance check). Nothing is written without a lock. |
| 7 | Person and company with the same uuid | They share one key (over-serialised only). Seq and balances stay separate per party. This was already so before FO-7lk. |
| 8 | Move-back naming a missing entry, or another firm's withdrawal (superuser and xr_app with `app.firm_id`) | Refused 23503 "not visible to this statement". With firm 2's party key held by a gate, the note **never waited on it**: no lock on a foreign party, so no cross-firm timing signal. Valid move-back as xr_app passes the walls and holds only its own party's key. |
| 9 | Rollback leaves anything behind? | After `rollback.sql`, every public function equals `_break_pre` on source, SECURITY DEFINER, owner, proconfig, ACL, volatility, strictness, parallel, cost and comment (389 functions). The trigger count (288) and pg_depend rows (803) are equal. The helper is gone. Running the rollback a second time refuses with its own message. Re-applying the migration afterwards gives functions identical to `_break_t`. |
| 10 | PF-12 walls / privilege leak | The four trigger functions are still SECURITY DEFINER, owner xr_wall_reader, search_path pinned. The helper and `money_issued_invoice` keep the caller's rights. xr_app has no CREATE on `public`. `check_pf12_walls.ts` gives 100/0. xr_app can EXECUTE the helper (PUBLIC), but that is no more than the built-in `pg_advisory_xact_lock`, which is also PUBLIC. xr_app taking firm 2's party key blocks firm 2's withdrawal (55P03 with a lock timeout) on **both** FO-7lk and the rollback database: an existing cross-firm lock-DoS, not added by the helper and out of this row's scope. |
| 11 | Other suites on a clean head export | `check_fo7a2_ledger_rules.ts` 35/0. `check_pf12_walls.ts` 100/0. |

Not attacked (outside this row): cross-party multi-statement ordering by the application, for example [withdrawal P1; withdrawal P2] against [P2; P1]. The change does not touch it, and it deadlocks the same way before and after.

Breaker: pass 9f30e673
