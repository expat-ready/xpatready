# Review: FO-7b C5 scope fix (R1.56, runtime), PR #3321

Reviewer (Opus, permissions; did not build it). Head `2d69a9f173734bbd11599202d1edf81335a9f441`, own diff `629ff76f6...2d69a9f17` (20 files, +380/−39). Checked against Lead 13 (#3305/#3306) and Lead 14 (#3321 issuecomment-7113248996). Runs were made in my own worktrees of the head and of 629ff76f6, never on :4400.

**Verdict: Ship (Approve).** No Blocker and no Major. Four Minors and one nit below; none of them lets an out-of-scope invoice through.

## What was checked, with evidence
- **Sweep complete.** Every money route in the tree (`grep @Get/@Post/@Put` under `api/src/client-money`):
  - All 13 FO-7b routes go through `invoiceInScope` or `partyInScope`: create, lines, bill-to, `GET :id`, issue, send, payments, credit-notes, the three PDFs, refunds, extra, tax-default.
  - FO-7q's list, detail, payments and parties already used `scopeSql` through `PgMoneyVisibility`.
  - The card routes take no invoice id.
  - `ClientMoney.hasMoney` is a firm-wide yes/no for the merge guard. It is not a staff route and is correctly unscoped.
  - `refundsReader` (fail-closed default) calls only `standing()`, which reads no scope.
  - The receipt and credit-note PDFs bind the payment or note to `:id` (`money.ts:178,181`), so an in-scope invoice id paired with an out-of-scope payment id is 404.
  - No other module reads `money_invoice` (`grep`: billing is the SaaS plan's, not client money).
- **Before any write.** On each route, the scope is read before the transaction (Lead 14 (4)). The per-invoice check comes after the row lock and before every 403/409/422 that depends on the invoice, and before any insert or update. `send` checks before mailing. The suite proves it with counts: no credit note, audit line, line, payment, refund or credit entry is written, Bill-to is unchanged, and the invoice stays a draft.
- **Wording parity.** All 404s go through the same `problem(404, "Not found", "No such <thing> in your firm.")`:
  - invoice and payment answers are compared byte for byte (S12);
  - create's answer is compared byte for byte with a missing person's (S13);
  - the tax route keeps "No such invoice for this client in your firm."
- **Fail-closed default.** `InvoiceDrafts`, `InvoiceMoney`, `Refunds` and `TaxDefaults` default to `failClosed`. `PgMoneyVisibility` answers empty for a non-member. A scope error propagates as a 500 and never opens anything. Only the features bind `moneyScopeOf`.
- **One shared predicate.** `caseLinks(firmId)` (`visibility-adapter.ts:62`) is used by both #3306's `on_case` CTE (`parties.ts:90`) and `PgMoneyVisibility`. `grep fo_person_id` finds no second copy. It is firm-scoped twice (`k.firm_id`, and `c.firm_id = k.firm_id`) and filtered to case ids that `caseScopeWhere` has already scoped to the firm. It opens only invoices with no case (`scopeSql`'s `i.case_id is null`, proved by L4).
- **Fail first.**
  - On 629ff76f6 with this suite: 15 pass, 19 fail, exit 1. Every out-of-scope case S1–S12 answered 200/201 (S3 wrote a credit note), and S13, L2, L3 and L4 were red.
  - L1/L5 are pass cases. Without the linked parties (my mutation M2) L1 goes red, and the run exits 1 at L2's setup.
  - Without `i.case_id is null` in `scopeSql` (M4), L4 goes red.
- **Suites on the head** (re-run here):
  - `check_fo7b_c5_scope` 34/0;
  - `check_csmv1_money_visibility` 33/0;
  - `check_fo7b_refunds` 29/0;
  - `check_fo7g3_bill_to` 30/0;
  - `check_fo7q_reads` 52/0;
  - `check_fo7b_invoices` 108/0;
  - `check_fo7g_tax_defaults` 78/0;
  - j_59 15/15 on an isolated copy at :4431;
  - `graph.mjs --check` exit 0.
- **Fixtures moved to the rule, not around it.**
  - `tests/lib/money-visible.ts` makes each FO-7b/FO-7g party a won prospect's subject and turns on "everyone sees all", so those suites keep testing their own rules (403 on someone else's draft, 409 issued, tax) behind a scope that now passes. C5 itself is tested in the new suite, with a narrowed scope.
  - CS-MV1 DW3/DW4 now expect the prospect subjects plus `linkedOf(scope.cases)`, exactly, by set size. A leak of other cases' links would fail them, and the P2/P3 exclusions still hold.
  - FO-7q DW9 links cases X/Y to a new PK instead of PA. That keeps PA "no case, no prospect", so the fail-closed assertion still means what it says; the case-link rule itself is tested in L1/L4.
  - The planted in-process services pass `"ALL"`, and m2 passes the OWNER's real keys. Both are honest.

## Issues (all Should; none blocks)
1. **Minor: the tax route's invoice-scope line is untested, and it runs after a party gate.**
   - Evidence: M1, removing `seesInvoice` from `tax/routes.ts:42`, keeps 34/0. S11's out-of-scope case is caught first by `partyInScope`, because PX is out of scope.
   - With an invoice id, the party gate also contradicts "an invoice with a case is judged by that case alone". An invoice on a seen case, billed to a party who is not in party scope, would get 404 on its tax default. This is latent: no app path writes `case_id` yet.
   - Fix: when `invoiceId` is sent, judge by `seesInvoice` alone. Add a case with L4's invoice (`partyId=CS&invoiceId=<onL>` → 404 for user-O); it goes red today if the line is removed.
2. **Minor: the scope check comes after the locks.**
   - In `money.ts:107,128,139` and `refunds.ts:44,79`, the check runs after `money_trust_lock` (an advisory xact lock) and the `FOR UPDATE`; in `drafts.ts` it runs after `FOR UPDATE`.
   - Nothing is written, but an out-of-scope request briefly queues behind writers, or blocks them, on another party's ledger. Its timing also differs from a missing id.
   - Fix: call `seesInvoice` before `lock` (for refunds, after a lock-free `row()`).
3. **Minor: the docs still describe the old party half.**
   - `ports/money-visibility.ts:8-9` (rule 2: "`parties`: … the front office lets them see"), the adapter header (`visibility-adapter.ts:9-12`) and `MODULE.rows/CS-MV1.md` ("parties (sales `visibilityOf`)") do not name the case-linked parties.
   - The PR says "Card unchanged". Fix: one line in each.
4. **Minor: j_29 synthesises `inv = { status: 201 }` from a SQL insert** (`journeys/j_29.ts:146`). The step's evidence reads as an API 201 it never got. Fix: assert the row and label the step a fixture.
- Nit:
  - M3 (dropping `caseLinks`' own `k.firm_id` filter) keeps 34/0. L3 holds through `caseScope`'s firm-scoped case ids; it does not test `caseLinks`' own firm filter, so its name overstates. The clause is harmless defence in depth.
  - `features/client-money-reads.ts:13` keeps its own wrapper, identical to `moneyScopeOf`. It is the same class, not a copy of the predicate.

## D1–D20 (API-only fix; no screen)
D1 requirement fit 4/4: AG-6-1 §8 C5, with each Lead 13/14 point mapped to a test · D2 data integrity 4: nothing written on any refused route (counts) · D3 reuse 4: one predicate, one guard · D4 rule integrity 4 · D5 stability 4: replay and idempotency run after the check · D6 n/a · D7 n/a (no AI) · D8–D14 n/a (no screen) · D15 speed 3: one extra query per guarded request; an Owner's scope carries every case id of the firm as one array (port rule), not measured against budgets · D16 testability 3: every rule has a pass and a fail that goes red, except item 1 · D17/D20 simulated only · D18 n/a · D19 4: case-side client → draft → line → issue (L1).

## BIC-01–BIC-20
N/A: there is no case-side screen in this PR, and no web page calls these routes (`grep front-office/money web/src`: none).

## Could not check
- A browser walk: there is no screen.
- `check_pf12_walls`, `check_pf6b_permission_rules`, `check_pf28_inputs`, `check_r121_invoice_tax`, `check_csw3_firm_scope`, and j_29/j_55/j_56/j_61: I did not re-run these; they are as the PR body states.
- A shared scratch worktree (`scratchpad/wt`) gained another agent's untracked `tests/brk_c5.ts` while I ran mutations there. Every mutation was reverted (`git status`: `api/` clean), and later runs used my own worktrees.

Journey test: `journey-test-reviewer-2026-11-23.md`, **8/10, pass**.

Blockers: none · Majors: none · Minors: 1–4 above.

Reviewer: Approve 2d69a9f173734bbd11599202d1edf81335a9f441
Verdict: Approve 2d69a9f173734bbd11599202d1edf81335a9f441

## Round 2: `2d69a9f17..9ae4fb361` (diff only)
Reviewed in my own worktree of `9ae4fb3611e65c409be1b6416be0fdaee02985cc`.

**Round 1 Minors:**
- **m1: fixed.** With an `invoiceId`, the tax route skips the party gate and judges by `seesInvoice` (`tax/routes.ts:38`). New cases: the L4 tax default is 404, and L1's is 200. M1 again (`seesInvoice` removed) now fails 2 cases, S11 and L4 (tax): the line can fail.
- **m2: fixed.**
  - `seen` now runs before `lock` in issue, record and credit (`money.ts:54,92,149`).
  - In refunds and extra it runs on a lock-free `row()` before `lock` (`refunds.ts:42,80`). A missing payment still reaches `lock`'s own 404 "payment".
  - It runs before the `FOR UPDATE` in lines and bill-to (`drafts.ts:101,146`), and before the view or facts in read, pdf and send.
  - Each 404 for a missing id keeps its words, because `invoiceInScope` uses the same text as `notFound`.
  - No new write comes before the check.
- **m3: fixed.** Port rule 2 and the adapter header name the linked parties. The new `MODULE.rows/FO-7b-C5.md` names the guard and `caseLinks`. `CS-MV1.md` is unchanged, but the new row covers it, so that is acceptable.
- **m4: fixed.** j_29 asserts `invStored` and reports it as `invoiceFixture`.
- The suite's `as unknown[]` casts change no behaviour.

**Runs on 9ae4fb361:**
- `check_fo7b_c5_scope` 36/0;
- `check_fo7b_refunds` 29/0;
- `check_fo7b_invoices` 108/0;
- `check_fo7g3_bill_to` 30/0;
- `check_fo7g_tax_defaults` 78/0.

Not re-run: tsc, j_29 (a one-line rename), and the FO-7q/CS-MV1 suites (their files are untouched in this diff).

**New, Minor (m5): the m1 fix opened a wording gap on the tax route with an `invoiceId`.** I proved it with a probe in a scratch copy of the suite. User-O called the tax default with a random `invoiceId`:

| Party | Answer |
|---|---|
| PX, an existing person outside their scope | 404 "No such invoice for this client in your firm." |
| An unknown person id | 404 "No such person in your firm." |

In round 1 both answered with the person words. A caller who already holds a person's id can therefore tell whether that person exists in their own firm. No invoice, figure or money fact leaks, and Lead 14 (2) only asks for parity without an invoice. That is why this is Minor.
- Fix (one line, `tax/routes.ts:38`): when `invoiceId` is sent, a missing party answers the invoice words too (`!found` → "No such invoice for this client in your firm.").
- Test: compare that answer for PX and for an unknown id, as S12 does.

**Round 2 result:** Blockers none · Majors none · Minors: m5 (new). m1–m4 are closed. The journey score stays 8/10, a pass. The fixes raise no criterion to 1, and m5 does not lower one.

Reviewer: Approve 9ae4fb3611e65c409be1b6416be0fdaee02985cc
Verdict: Approve 9ae4fb3611e65c409be1b6416be0fdaee02985cc

## Round 3: `a5d1aa6e5..17d76d5bf` (diff only; m5, as the Lead allowed in issuecomment-7114515623)
Reviewed in my own worktree of `17d76d5bfc09fc24f4d7c147dab551c37e5bb579`.

**m5: fixed** (`tax/routes.ts:44-46`). With an `invoiceId`, when the invoice is missing, not billed to this party, or outside scope, the answer depends on the party:

| Party | Answer |
|---|---|
| Outside scope | the missing-party words ("No such person/company in your firm.") |
| In scope | the invoice words |

- Every pair a caller can form now answers alike:
  - a missing person and an out-of-scope person (with any invoice id);
  - a missing invoice and an out-of-scope invoice (for an in-scope party, as in L4).
- An invoice the caller sees through its case still answers 200, whatever the party's scope (m1 holds).
- The company wording follows `kind`.

**The test can fail.** The new S11 case compares PX + a random invoice with an unknown person + a random invoice, byte for byte.
- At the head: 37/0.
- With only `tax/routes.ts` reverted to `a5d1aa6e5`: 36/1, with exactly that case red.
- `check_fo7g3_bill_to` 30/0 and `check_fo7g_tax_defaults` 78/0 (both assert this route's 404 words).

**MODULE.md:** the new invariant bullet matches the code: 404 before any lock or write, with the scope read before the transaction. It records the milliseconds window as an accepted Minor, per Lead 14. That is a ruling, not a finding.

**Round 3 result:** Blockers none · Majors none · Minors none open (m5 closed; the window is accepted by the Lead). The journey score stays 8/10, a pass.

Reviewer: Approve 17d76d5bfc09fc24f4d7c147dab551c37e5bb579
Verdict: Approve 17d76d5bfc09fc24f4d7c147dab551c37e5bb579
