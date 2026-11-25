# FO-9b part 2m: break report (PR #3702, head a22b7445c826ed6e65f7e672b83574c0fdb782b1)

Breaker: a fresh session that did not build this item. Backend only, no screen, so the screen attacks (1024 px, zoom, keyboard, uploads) do not apply. Everything ran against an export of the exact head (`git archive a22b7445…`, scratchpad), not the checkout: the working tree has uncommitted edits to `live-party.ts`, `trust/service.ts` and the test since this head. Harness: one scratch database (every migration, `xr_studio_brk2m_<pid>`, dropped after), an in-process Nest app as `xr_app` behind PF-12's walls, with PF-4's guard, the local sign-in stand-in, client money (trust, invoices, refunds, reversals) **and the real merge route** (`front-office-merge`). People came through `arrive()`, so the pairs are real `fo_dup_review` rows. Each person got a prospect so C5 scope holds them. The app listened on an ephemeral 127.0.0.1 port, never :4400. Script: scratchpad `brk/attack.mts`; output `brk/head-run.txt`. The author's suite at head: 23/23.

## Findings

**M1 (Major): at a real merge's end state, a deposit by a caller who does not see the person answers 409 PARTY_MERGED, not 404 (C5).**
* Done: added a Billing & Finance staff member (`agent/payment:record`, no prospect or case keys, so no party is seen). Merged pair e1 through `POST /api/front-office/duplicates/review/:id/merge`. Then `POST /api/front-office/money/trust/deposits {personId: <loser>}`, and the same for a live person that member does not see.
* Expected: 404 NOT_FOUND for both. C5 and the code's own rule: "an unseen request is 404 … so nothing tells it apart from a missing one".
* Actual: the live unseen person got **404 NOT_FOUND**; the merged unseen person got **409 PARTY_MERGED** (no survivorId). Anyone in the firm with the deposit key can learn that an id they cannot see is a person of this firm, and that it was merged.
* Where: `api/src/client-money/trust/service.ts:172`. `liveParty` runs before the C5 checks `caseOf` (`:181`) and `partySeen` (`:190`). The trust request (`:106`→`:107`) and drafts (`drafts.ts:74`→`:75`) get the order right. The trust refund payee (`money-out.ts:136`) has the same shape: a merged payee gives 409, a live one goes through. That one is Minor, because payees were never scope-checked.

**m1 (Minor): after a real merge, draft create and trust request on the loser answer 404 "No such person in your firm"; only the deposit and the payee answer 409 with the survivor.**
* Done: as the Owner, after the real merge of pair e1: `POST /invoices {personId: loser}`, `POST /trust/requests`, `POST /trust/deposits`, and `POST /trust/refunds` with the payee set to the loser.
* Expected (the PR's claim): every writer gives 409 PARTY_MERGED naming the survivor, which the Owner sees.
* Actual: draft **404**, request **404**, deposit **409 + survivorId**, payee **409 + survivorId**. The merge moves the loser's prospects to the survivor, so the loser leaves every caller's C5 party list. The 409 then appears only for the deposit and the payee (whose checks run first: M1) and inside the race window (E4).
* Why the test misses it: `tests/check_fo9b_2m_money_merged.ts` plants the tombstone with SQL and moves no rows, so its 12 "409 naming the survivor" lines are a state a real merge never leaves. No money is written either way. The cost is a staff member with a stale page seeing "No such person" instead of "merged, use the survivor".

**m2 (Minor): in a merge chain, the 409 names a tombstone, or nobody, even to the Owner.**
* Done: a→b, then b→c, both through the real route. Then a deposit on a as the Owner, who sees c.
* Actual: 409 with no survivorId, and the detail tells the Owner to "Ask someone who sees the record it was merged into". The Owner sees everything. A deposit on b names c correctly.
* Where: `live-party.ts:34` reads one hop (`merged_into_id`), never the live root. The Merged tab follows chains (`rootsOf`, review.ts).

**m3 (Minor, latent): some writers on an existing invoice or entry have no `liveParty`, and the merge port has no money gate.**
* Done: `mergeRecords(kind COMPANY)`, the body of `PersonMergePort.mergePersons`, on a company holding a draft invoice. It **merged**, and the invoice stayed on the merged-away company. A deposit on that company then gave 409, but `POST /invoices/:id/lines` gave **201** (one `money_invoice_line` written) and `PUT /invoices/:id/bill-to` gave **200**. Issue gave 409.
* Where: `invoices/drafts.ts:90` and `:142`, `money.ts` `send`, `trust/service.ts` `cancel`, `trust/to-move.ts` record and undo. None calls `liveParty`. `HAS_MONEY` lives in `duplicates/merge/review.ts:361,372` (persons only), not in `merge/service.ts:216` `mergeRecords`.
* Not reachable today: nothing calls the port, and the only HTTP merge (persons) refuses `HAS_MONEY`. It is still the same planted state the PR's own test uses, and the PR claims "every writer that names a party".

## What held (with evidence)
* **Real merge vs. an open deposit (E3).** A planted 1.5 s `pg_sleep` after the deposit's `liveParty` made the merge route answer **503 BUSY** after its NOWAIT back-off. Nothing was merged. Retried after the deposit committed: **409 HAS_MONEY**. With a 0.3 s hold, the merge's re-read under the locks answered **409 HAS_MONEY**. Neither case merged a person with money.
* **Real merge holding its locks (E4).** A planted 1.5 s sleep came after the tombstone. During it, a deposit, a draft and a trust request on the loser each waited, then answered **409 PARTY_MERGED + survivorId** once the merge committed. The loser had 0 money rows. A concurrent deposit on the survivor waited, then 201.
* **Storm, run 3 times (E5).** 8 pairs, each with a real merge, 10 deposits on the loser, 10 on the survivor, 3 drafts and 2 requests, about 200 requests at once. Results: no 500, no 40P01. 7 merges 200, the 8th 503 BUSY or 409 HAS_MONEY. Every merged loser had **0** money rows (violations 0). Merges retried: HAS_MONEY or DECIDED, never a merge.
* **Case Officer in the race (E7).** The Case Officer owns only the loser's prospect, and the merge holds its locks. Their draft got 409 **without survivorId**, so the survivor did not leak. After the merge: 404.
* **Across firms.** Firm B's merged-away person, used by firm A's Owner: deposit 404, draft 404. Never 409.
* **Writers covered at head.** Draft create, issue (also with `payFromTrustMinor`), payment, credit note, refund, the extra/kept credit, trust request, deposit, pay from trust (both parties), trust refund payer and payee, reversal. All are under the trust lock where one is taken, before any write. Card/Stripe write only the firm's payment account (`card/account.ts`). Nothing outside `client-money/` writes `money_*`. `money_party_tax_treatment` has no writer.
* **Lock behaviour.** The money writers run as `xr_app` (walls on), and FOR KEY SHARE is granted there. KEY SHARE is shared among writers, so no writer-to-writer waits. The merge never waits on a row (NOWAIT), so no cycle was found.

Verdict: Changes a22b7445c826ed6e65f7e672b83574c0fdb782b1
