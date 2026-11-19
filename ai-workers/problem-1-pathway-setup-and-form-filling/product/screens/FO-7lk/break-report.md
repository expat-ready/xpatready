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

---

# Round 2 (19d39511d)

# FO-7lk break report, round 2: one lock order for "Move back to trust"

Breaker (money, P-278), head 19d39511d on `claude/trusting-fermat-ejsqdh`, compared with my round-1 report on 9f30e673 (pass, B-1 Minor). The row is database only, so the screen attacks do not apply. The source is a clean `git archive 19d39511d` export (prisma, the FO-7lk check, MODULE.md, package.json) under `scratchpad/breaker/r2/src`. Every `migration.sql` was applied in order with `-1 -f` into scratch databases on 127.0.0.1:54329:
* `_break2_t`: all migrations, including FO-7ts's 20261118200000 and 200100, then FO-7lk's 20261118210000.
* `_break2_pre`: every migration before FO-7lk.
* `_break2_back`: all migrations, then `rollback.sql`.
* `_break2_a`: pre, then FO-7lk.
* `_break2_apre`: pre, then 9f30e673's FO-7lk text, as a control.

Trust is turned on by inserting the settings row and then running `update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'user-O'`. All `xr_studio_fo7lk_*` databases are dropped (0 left). Nothing was written in the repository, and the checkout is clean. Scripts: `scratchpad/breaker/{hostile,break}.mts` (round 1, unchanged) and the new `scratchpad/breaker/r2/angles.mts`. Logs are in `scratchpad/breaker/r2/`.

## Findings

None. B-1 is fixed, and I found no new Blocker, Major or Minor.

## B-1 re-check

* **B-1 repro** (`hostile.mts`, H2, 10 runs per hold), on `_break2_t`. The hostile credit note is on lo's invoice and names hi's withdrawal; it races a valid two-party undo while a gate holds lo's key.
  * Gate released at once: **undo ok, hostile 23514**, 10/10. Round 1 gave hostile 40P01.
  * Gate held 400 ms: **undo ok, hostile 23514**, 10/10. Round 1 gave the valid undo 40P01.
  * The whole H1 to H5 output matches the rollback database line for line, apart from the helper lines and uuids.
* **Control on 9f30e673's text** (`_break2_apre`, `angles.mts` A3, 5 runs per cell). The same race still deadlocks there in all 4 hostile variants × 2 holds (40/40 runs). This confirms the harness detects the bug. It also shows round 1's bug was wider than B-1 said: the hostile note naming a correction or a deposit of the other party deadlocked too. On head, all of those variants are clean (see table, row 2).

## New angles the fix opens (`angles.mts` on `_break2_a`)

| # | Attempt | Result |
|---|---|---|
| 1 | The fix locks the party of "a withdrawal to this invoice" without checking that its party and currency match the invoice. Can they differ? I tried: a USD withdrawal to a CAD invoice, a company's withdrawal to a person's invoice, another person's withdrawal to the invoice, and an UPDATE of an issued invoice's person, company, currency or `issued_at`. I also tried an UPDATE of a trust entry's person, currency, invoice or kind, and a DELETE of a trust entry. | **Held.** All are refused. The insert gives 23514 "trust pays only an invoice of the same party and currency". The invoice update gives 23514 "issued invoices can't be edited". The entry update or delete gives 42501 "rows are never changed or removed". So the early key is always the key `money_issued_invoice` takes next (same key, re-entrant), and no second party order can arise. |
| 2 | A gate holds both the invoice party's key and the named entry's party key. I record which key each move-back waits on and how many keys it already holds, for 13 cases: valid; valid entry with the note in USD on a CAD invoice; the same person's USD withdrawal; the same person's withdrawal to another invoice; a company's withdrawal; another person's withdrawal; a company's correction; a company's deposit; the invoice party's own deposit; a missing entry; another firm's withdrawal; a company invoice naming a person's withdrawal; a USD invoice naming the same person's CAD withdrawal. | **Held.** Each case waits on the **invoice party's key** while holding **0** advisory keys. On 9f30e673, 7 of these cases waited on the other party's (or other currency's) key instead. Refusals are in the ledger's words: 23514 "names a trust application to this invoice" or "in the invoice's currency (CAD), not USD", and 23503 for a missing or foreign entry. The valid case commits. |
| 3 | Race (B-1 shape): a valid lo→hi undo against a hostile note naming hi's person withdrawal, company withdrawal, correction or deposit. Holds of 0 and 400 ms, 10 runs each (80 runs). | **Held.** 80/80 runs give undo ok and hostile 23514, with full barriers. 0 × 40P01. |
| 4 | Does the early SELECT match the later check exactly? If it matched less, a valid move-back would lose its early lock and the round-0 deadlock would come back. | **Held.** Both use `kind = 'WITHDRAWAL_TO_INVOICE' AND invoice_id = NEW.invoice_id` in the firm, and the later check refuses anything else (migration.sql:174-176 vs :187-189). |

## Re-run of round 1 (held)

| # | Attempt | Result |
|---|---|---|
| 5 | 480-run concurrency matrix (`break.mts`, 24 writer pairs × both orders × person and company × 5), read committed, on `_break2_t` | **0 × 40P01**, 0 broken invariants. The 20 runs without a full barrier are the operating refund (no party lock), as in round 1. The outcome table is **identical** to `_break2_back` and to round 1's `_break_t` (diffed, only the database name differs). |
| 6 | The same matrix at REPEATABLE READ | 0 × 40P01, 0 broken invariants. The outcome table is identical to round 1 (40001 where expected). |
| 7 | Builder's `check_fo7lk_lock_order.ts` from the export: once alone, then 3 copies at once | 16/0 each time (4 runs). The new B-1 line passes. #1991's text gives 0/40 deadlocks; the planted order gives 20/20, B then A. |
| 8 | Rollback | Functions after `_break2_back` equal `_break2_pre` on source md5, SECURITY DEFINER, owner, proconfig, ACL, volatility, strictness and comment (389 functions). Triggers 288 = 288. pg_depend 12492 = 12492. A second rollback refuses with its own message. |
| 9 | CREATE OR REPLACE / re-run | FO-7lk's migration runs again on a database that already has it (rc 0), and again after its rollback. Both give functions identical to `_break2_t` (390). |
| 10 | Changed set and FO-7ts interplay | Against pre, only `money_trust_lock` (new), `money_issued_invoice`, `money_trust_entry_write`, `money_credit_note_write`, `money_move_batch_owed_back` and `money_move_line_write` change. FO-7ts's `money_trust_on`, `money_trust_request_write`, `money_invoice_write` and `money_trust_answer_move` are byte-identical before and after FO-7lk, so FO-7lk does not clobber them. Its re-stamp to 210000 runs after both FO-7ts steps. |
| 11 | Walls / privileges | The four trigger functions are still SECURITY DEFINER, owner xr_wall_reader, search_path pinned. The helper and `money_issued_invoice` keep the caller's rights. xr_app has no CREATE on `public`. As xr_app with `app.firm_id`, a valid move-back holds only its own party's key, and naming firm 2's entry gives 23503 with no foreign lock (H3). |
| 12 | Key equality, nulls, same uuid as a person and as a company (H1, H4, H5) | As round 1: the helper key equals the inline key (CAD and USD; each of the 4 call sites). Nulls take no lock. A missing party or both parties are refused. A person and a company with one uuid share one key, and their seqs stay separate. |

Unchanged note from round 1, still out of this row: xr_app can take another firm's party key directly (55P03 for firm 2 under a lock timeout). This happens on both FO-7lk and the rollback database.

Breaker: pass 19d39511d
