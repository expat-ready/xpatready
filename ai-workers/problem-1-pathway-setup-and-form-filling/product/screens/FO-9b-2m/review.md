# FO-9b part 2m: independent review (PR #3702, head a22b7445c826ed6e65f7e672b83574c0fdb782b1)

Reviewer: a fresh session that did not build this item (P-303, P-823: money PR). Backend only, no screen. I read the code at the exact head, ran the suites, ran two mutations on a scratch copy of the head, and ran one probe of my own. Nothing in the checkout was changed.

**Verdict: Ship after fixes.** One Major (M1: the deposit breaks the C5 404 rule). Everything else holds.

## What holds (with evidence)
* **Writers covered:** draft create (`invoices/drafts.ts:75`), issue, payment and credit note (`invoices/money.ts:213`, in `lock`), refund and the extra's choice (`invoices/refunds.ts:139`), trust request (`trust/service.ts:107`), deposit (`:172`), pay from trust, both parties, also at issue (`trust/money-out.ts:89`), trust refund payer and payee (`:135-136`), reversal (`reversals/reverse.ts:112`). Each runs after the trust lock where one is taken, before any write. Tax treatment has no writer in `api/src` (only `hasMoney` reads `money_party_tax_treatment`), so nothing is missing there. `card/` writes only the payment account. Nothing outside `client-money/` writes `money_*`.
* **The other direction is closed:** the guided merge re-reads `anyMoney` after `mergeRecords` has taken both person rows FOR UPDATE NOWAIT (`front-office/duplicates/merge/review.ts:372`). The automatic merge does the same through `whyNotSafe` (`:231`). A money write that already holds FOR KEY SHARE makes the NOWAIT fail, so the merge backs off and retries (`service.ts:73-84`); on retry it sees the committed money. A money write that comes later waits, then re-reads under READ COMMITTED and gets 409. No money writer runs at RepeatableRead (all `write()` helpers use the default), so a writer that waited gets a 409, never a 40001.
* **Lock order and deadlocks:** FOR KEY SHARE conflicts only with FOR UPDATE, DELETE or a key change. `fo_person` and `fo_company` have only the unique index `(firm_id, id)`, so an ordinary UPDATE takes FOR NO KEY UPDATE and does not conflict. Code that takes FOR UPDATE explicitly: the merge (always NOWAIT), `people/edit.ts:78,116` and `sales/corporate/service.ts:95,238,269,306`. None of them then waits on a trust lock or a `money_*` row, so no wait cycle is possible. Money writers share FOR KEY SHARE with each other, and their trust locks stay sorted. Mutation (a) shows the lock is new: no money FK on `fo_person` held it before. The side effect is that a person edit now waits for an open money write on that person, and the other way round; both transactions are short.
* **404 before 409** in drafts (`drafts.ts:74` then `:75`), trust request (`service.ts:106` then `:107`), invoice routes (`seen()` before `lock`), refunds, reversal (`planReversal(seen)`) and trust refund (`:241`). Another firm's id is 404 through `partyOf`/firmScope. The survivor's id is named only when `seen` is ALL or lists it (`live-party.ts:29`).
* **Suites at this head, all green:** `check_fo9b_2m_money_merged` 23/23, three runs. Also `check_fo7lk_lock_order` 16/16, `check_fo7b_invoices` 108/108, `check_fo7b_refunds` 29/29, `check_fo7b_c5_scope` 37/37, `check_fo7t_trust` 62/62, `check_fo7t_money_out` 51/51, `check_fo7v_reversals` 28/28, `check_fo9b_review` 82/82, `check_fo9b_auto_merge` 29/29, `check_fo9b_merge` 88/88. `graph.mjs --check`: G1 0 · G2 0 · G4 0 · G5 0.
* **The lines bite (mutations on a scratch copy):** (a) without `for key share` in `liveParty`, all four race lines and the busy line fail (each writer answered 201 on the merged-away person). (b) Without the deposit's call, the deposit line, the company line and the deposit race fail.

## Findings

**M1 (Major, Must): a deposit by a caller who does not see the merged-away person answers 409 PARTY_MERGED, not 404 (C5).**
* Where: `trust/service.ts:172`. `liveParty` runs before the scope checks at `:182` (`caseOf`) and `:191` (`partySeen`).
* Probe (scratchpad, `TrustMoney` with an empty scope): a deposit on an unseen live person gives 404 "No such person". The same deposit on an unseen merged-away person gives 409 "This person was merged into another record… Ask someone who sees the record it was merged into." Draft create and trust request give 404 for the same caller.
* Failure scenario: a Case Officer who may record payments POSTs `/trust/deposits` with any person id of the firm. The answer tells them that the person exists and has been merged. This breaks the rule the row and C5 set: out of scope is the same 404 as missing.
* Fix: move the call to just after `:191`. It is still under the trust lock and before the first write. Then add a route-level line: a caller who does not see the merged-away person gets 404 on deposit, and on the other writers too.

**m1 (Minor, Should): a payee or payer the caller cannot see now answers 409 PARTY_MERGED.**
* Where: the payee is read with no scope check (`service.ts:246`, pre-existing), then checked by `money-out.ts:136`. In the same way, the pick payer from `service.ts:220`, when a seen case is picked, is checked by `money-out.ts:89`.
* Failure scenario: a trust refund naming any person of the firm as payee shows whether that person was merged (no survivor id, but the merged state shows).
* Fix: refuse an unseen payee as 404 before `refundTrust`, or record it as a named gap or a question if the scope of payees is ruled elsewhere.

**m2 (Minor, Should): the race lines prove "not answered within 600 ms", not "waiting on the row lock".**
* Where: `tests/check_fo9b_2m_money_merged.ts:177`.
* Failure scenario: on a slow CI runner, the HTTP call can reach `liveParty` only after the commit at `:179`. A plain SELECT would then also read the tombstone, so the line passes even with the lock removed (a false green). It is never a false red: with the fix the writer cannot answer before the commit.
* Fix: before committing, poll `pg_stat_activity` (`wait_event_type = 'Lock'`) or `pg_locks` (`granted = false`) until a waiting backend shows, with a timeout.

**m3 (Minor, Should): the "other way round" line tests raw SQL against `liveParty` (`:185-193`), not the merge.**
* The claim that the merge then retries and answers HAS_MONEY is shown by reading `review.ts:372`, not by a test.
* Fix: hold a money write open, call `DuplicateReview.merge`, expect busy (503), commit, call it again and expect 409 HAS_MONEY. This is the row's line "guided merge of a person with money stays 409 HAS_MONEY" under a race.

**n1 (Nit):** `addLine` (`drafts.ts:90`), `setBillTo` (`:142`) and To move's `record`/`undo` write on an existing draft or trust entry without `liveParty`. Today they cannot be reached: an existing draft or entry is money, so the merge is refused, and issue is guarded. A one-line note in `live-party.ts` saying so would stop a later reader adding them, or wondering why they are absent.

**n2 (Nit):** every fail line compares with one shared `before` (`test:120`). One leaking writer turns every later line red: mutation (b) gave four extra failures. A baseline per call isolates the cause.

**n3 (Nit):** `survivorId` is the direct `merged_into_id` (`live-party.ts:29`). In a chain (A into B, then B into C) it names B, which is itself merged, and the next write answers 409 again. This is acceptable while chains are rare; following to the live root would save a step.

**n4 (Nit):** at issue with Pay from trust, the own party is checked twice (`money.ts:213`, then `money-out.ts:89`). It costs one extra indexed read and is harmless.

PR question 1 (a reversal on a merged-away party is refused): I agree with keeping it refused. It cannot be reached without an earlier race, and Undo reopens it.

## Standards and scorecard
* Concurrency, server authorisation, field errors, no per-row requests: met, except M1 (server authorisation, C5).
* No migration; data kept.
* D1–D20 and BIC-01–20: N/A, because no screen or case-side surface changes. D17 and D20 are not applicable.
* Journey test (reviewer): `screens/FO-9b-2m/journey-test-reviewer-2026-11-25.md`, **7.5 of 8 applicable criteria (9.4/10 scaled), pass**. Correct data is scored ½ because of M1.

## What I could not check
I did not run a real two-process race against the merge route. I did not walk anything in a browser (there is no UI). CI on GitHub: I did not read the run.

Verdict: Changes a22b7445c826ed6e65f7e672b83574c0fdb782b1
Reviewer: Changes a22b7445c826ed6e65f7e672b83574c0fdb782b1
