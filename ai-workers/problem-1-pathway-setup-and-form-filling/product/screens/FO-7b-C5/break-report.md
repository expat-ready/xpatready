# Break report: PR #3321 (R1.56, FO-7b's C5 scope fix), head 2d69a9f17

Breaker, 23 Nov 2026. Diff `629ff76f6...2d69a9f17`, run from a separate git worktree at 2d69a9f17. Scratch databases on 127.0.0.1:54329 (`xr_studio_brkc5_<pid>`); all of them, and the two my failed first runs left behind, are dropped. :4400 was never touched.
My attack suite is a copy of the setup in `tests/check_fo7b_c5_scope.ts` plus about 120 lines of attacks, run through the real Nest app with PF-4's guard and PF-12's walls and the local sign-in. It is not committed.
The caller is user-O, a Case Officer given the money keys and own cases only, with "everyone sees all" off, as in the PR's suite.

## Baseline
- `check_fo7b_c5_scope`: 34/0.
- Neighbouring suites, re-run on this head: `check_csmv1_money_visibility` 33/0, `check_fo7q_reads` 52/0, `check_fo7b_refunds` 29/0, `check_fo7g_tax_defaults` 78/0.

## Attacks

| # | Attack | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | Every route in the sweep table, called with an out-of-scope invoice or payment and again with a random id (14 pairs: read, pdf, lines, bill-to, issue, send, payments, credit-notes, receipt pdf, refunds, extra, tax-default with and without `invoiceId`, create) | 404 both ways, the same body | 404/404 on all 14, the bodies identical byte for byte | Held |
| 2 | Linked party CS (case K, user-O on its team): a case-less invoice, an invoice on unseen case KT, an invoice on unseen case L | case-less invoice opens; cased ones are judged by their case | case-less 200; on KT 404 (tax-default too); on L 404 | Held |
| 3 | End user-O's team row on K mid-way (`ended_at`, `end_reason` set) | CS's case-less invoice and new drafts close | read 200 → 404; create 404; credit 404 | Held |
| 4 | Firm B case whose `case_client` points at a firm A person (L3); firm A case pointing at a firm B person | nothing opens | 404 both ways. Firm A's case puts firm B's person id into the party half (`caseLinks` does not check the person's firm, visibility-adapter.ts:62). This is harmless: create looks the person up within the firm first, and `scopeSql` matches only the firm's own invoices | Held |
| 5 | `case_client.firm_id` NULL, linked person, user-O on the team | fail closed | the join `c.firm_id = k.firm_id` drops the row; create 404 | Held |
| 6 | Company-linked cases | as for a person | linked company: create 201, tax-default 200; company of an unseen case: create 404 in the same words as a missing company, its invoice 404 | Held |
| 7 | Refund and extra (REFUND and KEEP) by payment id when the payment's invoice is out of scope | 404 "No such payment", nothing written | 404, the same words as a missing payment; `money_refund` and `money_credit_entry` unchanged | Held |
| 8 | Replays: the Owner refunds or records under key K; user-O sends the exact same request (same key, same body) on that out-of-scope payment or invoice | 404, never the stored answer | 404 for both: `seen` runs before `replay` and before the `had` lookup (refunds.ts:42, money.ts:91) | Held |
| 9 | Paths built without a scope: `new InvoiceDrafts/InvoiceMoney/Refunds/TaxDefaults` without `scopeOf`, called with real ids | fail closed | 404 on create, read, pdf, refund and forParty | Held |
| 10 | Other callers that might bypass the guard | none | `ClientMoney` (port.ts) has only `hasMoney`, a yes/no per party with no invoice data. `refundsReader` is fail-closed and calls only `standing()`, from reads that are already scoped. No job or other module builds these services (grep of `api/src`). Merge columns never write `money_*` | Held |
| 11 | Wrong role or key | the key's 403 first; scope never widens | `choose` checks REFUND's 403 before scope, as it does for a missing payment, so nothing leaks. Validation (422) runs before scope on both paths | Held |
| 12 | tax-default with `invoiceId` for an invoice on a case the caller sees, billed to a party outside the party half (invoice of PX put on case K) | 200, since the case decides | read 200 and addLine 201, but tax-default answers 404 "No such person": the party check runs first (tax/routes.ts:37) | **Minor m1** |
| 13 | Race: the scope changes between the read before the transaction and the write (a `scopeOf` wrapper ends the team row after reading) | refused, or the risk accepted | the line is written (8 → 9 lines); the next read is 404 | **Minor m2** |
| 14 | Timing and locks, missing versus out of scope (60 GETs each) | no usable signal | read p50 13.7 vs 14.5 ms, pdf 12.9 vs 18.2 ms, p90 ranges overlap; one run showed +5 ms. Out of scope, `money_trust_lock` and the invoice's `FOR UPDATE` are taken before the 404 (money.ts:207, refunds.ts:135); `read` builds the full view before `seen` (drafts.ts:186) | **Minor m3** |
| 15 | `scopeOf` for a firm with many cases (the Owner, `case:view.all`) | within the budgets | 0 extra cases: scopeOf 3 ms, the linked query 0.8 ms, GET/POST lines 16/25 ms. 20,000 extra cases: scopeOf 96 ms (the new linked query alone 53 ms, plan 63.6 ms, 40,012 ids in scope); GET …/:id 169 ms, POST …/lines 167 ms, on every route, writes included | **Minor m4** |

## Findings
- **m1 (Minor), tax/routes.ts:37.** The tax default judges the party before the invoice. An invoice the caller reaches through its case then gets "No such person" here, while `GET …/:id` and `POST …/lines` serve the same invoice. This breaks the PR's own rule ("an invoice with a case is still judged by that case alone").
  - It is latent today. Nothing in the app sets `money_invoice.case_id` (only fixtures do), and `web/src` never calls `tax-default`.
  - Why not a Blocker or Major: no access is widened, and no screen in "What gets built" breaks.
- **m2 (Minor), drafts.ts:66/97/143 and each `scopeOf` call made before a transaction.** A caller who loses a case after the scope read still writes once, within milliseconds. Lead 14 (4) ordered the read before the transaction. READ COMMITTED inside the transaction would have the same window unless the team rows were locked, so I record this as an accepted risk, not a defect.
- **m3 (Minor).** A caller outside the scope briefly takes the party's trust lock and the invoice's row lock before getting 404, and the read path does extra work first, so the timing differs by a few ms. Invoice ids are random UUIDs, so this tells nobody which records exist unless they already hold the id. Nothing is written.
- **m4 (Minor), visibility-adapter.ts:36.** `PgMoneyVisibility` never answers "ALL". The Owner's scope is a full id list, and the new linked-parties query costs about 53 ms at 20,000 cases; it now runs on every FO-7b route, writes included. STANDARDS §9 sets budgets with the sample data and leaves scale work to the team, so this is not a budget breach.

## What held
- Every route in the sweep answers out of scope with 404 in the same words as a missing record.
- Nothing is written out of scope: no line, Bill-to change, issue, email, payment, credit note, refund, kept credit or audit row.
- A replay does not cross the scope, and every path fails closed by default.
- Linked parties open only case-less invoices. A link from another firm or with a NULL `firm_id` opens nothing. Company links behave the same.
- Losing a team row closes access at once.
- There is one `caseLinks` predicate, shared by FO-7q's search (parties.ts:90) and the money visibility.
- No other caller of `InvoiceDrafts`, `InvoiceMoney`, `Refunds` or `TaxDefaults` skips the guard.

Verdict: Approve 2d69a9f173734bbd11599202d1edf81335a9f441

## Round 2: `2d69a9f17..9ae4fb361` (diff only)

I re-ran from a new worktree at 9ae4fb361 with the same attack suite plus the round 2 attacks below. Every round 1 line that held still holds.
- PR suites on this head: `check_fo7b_c5_scope` 36/0, `check_fo7b_refunds` 29/0, `check_fo7g_tax_defaults` 78/0.
- Scratch databases are dropped.

| # | Attack | Expected | Actual | Result |
|---|---|---|---|---|
| R1 | Locks: a second psql session holds PX's and PI's trust locks plus `FOR UPDATE` on the rows of out-of-scope invoices outD, outI and outP and in-scope inLock, for 6 s. User-O meanwhile fires 11 out-of-scope calls at once: lines, bill-to, issue, payments, credit, pdf, read, send, refund, extra, and refund on a missing payment | 404 without waiting | all 11 answer 404 in 95–106 ms. The control, an in-scope credit on the locked inLock, waits 5,135 ms. Neither the trust lock nor the row lock is taken before the 404 | Held (m3 fixed) |
| R2 | Nothing written by R1's calls | no change | outD: still 1 line, Bill-to ON, not issued. outI: 0 credit notes, 0 payments. outP: no new refund, no kept credit | Held |
| R3 | Refund `pre` null (missing payment) | 404 "No such payment", before any lock | 404 in the same words, fast. A null `pre` skips `seen`, then `lock` → `row` → `notFound` comes before `money_trust_lock` (refunds.ts:42–43, 80–81). A payment's invoice never changes, so the unlocked read is safe | Held |
| R4 | m3 timing, 60 GETs each, missing vs out of scope | no usable signal | read p50 11.9 vs 11.8 ms, pdf 12.4 vs 9.9 ms; out of scope is now never slower | Held |
| R5 | tax-default, PX (outside the party half) with its invoice on a case user-O sees | 200, the invoice decides (m1) | 200. The answer is only `partyKind`, `partyId` (already on the invoice) and the default built from the invoice's Bill-to and the firm. The party's own record is not read | Held (m1 fixed) |
| R6 | Opening PX through an in-scope invoice that is not PX's (CS's case-less invoice) | 404 | 404: the invoice lookup requires `personId = PX` | Held |
| R7 | PX without `invoiceId`; a new draft for PX | 404 | 404, 404 | Held |
| R8 | Same words for an out-of-scope party and a missing one, when an `invoiceId` is sent (random, or PX's own out-of-scope invoice) | identical 404 | **different words.** Existing out-of-scope PX: "No such invoice for this client in your firm." Random party id: "No such person in your firm." The same split happens for companies ("No such company…") | **Minor m5** |

**m5 (Minor), introduced by the m1 fix, tax/routes.ts:38 and :43.** With any `invoiceId`, the route no longer judges the party. The missing-party 404 and the out-of-scope-party 404 now differ, so a same-firm caller who already holds a party's UUID learns that the party exists in the firm. This goes against the PR's own claim ("the same words as a missing record"); round 1 had no such split.
- Why Minor: no party or invoice data is shown, and nothing opens (R5–R7). The ids are random UUIDs that this caller can't list, and no screen calls the route.
- Cheap fix, for the builder: when the invoice check fails, answer the person/company 404 whenever `!partyInScope(scope, found.id)`. Keep the invoice 404 for a party in scope.

**Seen in passing, not from this diff and not a finding here.** In R1's control, the in-scope credit waited for the other session's lock, then answered **500** after about 5 s (Prisma's interactive transaction timeout), not a 409. That behaviour predates this PR.

m2 (the scope is read before the transaction; A9 still writes 11 → 12 lines) and m4 (20,000 cases: scopeOf about 100 ms, the linked query about 60 ms, routes about 160–170 ms) are unchanged, as expected. Both remain Minor.

Verdict: Approve 9ae4fb3611e65c409be1b6416be0fdaee02985cc
