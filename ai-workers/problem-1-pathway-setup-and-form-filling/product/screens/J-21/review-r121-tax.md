# Review: R1.21, the tax on our own invoices (PR #2987, P-796)

Reviewer (fresh context, did not build it) · 22 Nov 2026 · **reviewed commit b9d69d283e27f1bb6beaf2a2a875743b83c04308** (`git diff origin/main...b9d69d283`). The PR head has since moved to ff321442e (5647a0094: a per-firm lock on the stand-in's issue; ff321442e: screenshots). Those two commits are **not** covered here and need a diff-only check.
Skills: screen-review and journey-test (reviewer role, report `journey-test-reviewer-2026-11-22.md`). Copies `rev121` :4724 and `rev121b` :4725 (never :4400), from a worktree at the exact commit. US$0, no Stripe call.

**Verdict: Changes** (Ship after fixes). One Major (M1: a missing failing test, on the environment gate). Do not add `review: approved` until M1 is fixed and re-checked.

## What I ran (exact commit)
| Run | Result |
|---|---|
| `tests/journeys/j_21.ts rev121 4724` | 17/17, exit 0 |
| `tests/check_r121_invoice_tax.ts 4724 xr_studio_rev121` | 23/23, exit 0 |
| `check_pf5_signup_billing.ts` (port change: backwards compatibility) | 107 passed, 0 failed, exit 0 |
| `check_pf5s2_billing_browser.ts 4725` (old invoice answers with no tax fields, `javascript:` link) | 55/55, exit 0 |
| `check_pf12b_doors`, `check_pf12_walls`, `check_pf21w_routes`, `check_pf12b_bypass_audit`, `check_pf6b_permission_rules`, `check_pf23m_log_calls`, `check_stand_ins`, `check_b148_words` | all exit 0 |
| `tsc --noEmit` api (no error in any changed file or the pf5 tests; other errors are older and in other tests) · web | clean |
| Walk plus break pass (Playwright, headless): NS, QC, hostile names, 12 parallel issues, other firm, wrong or missing token | see journey report |

## Concept fit (P-796's done-when)
Met. The invoice carries its province's GST/HST, worked out from the saved address by the stand-in: ON 13 % (99.00 → 12.87), BC 5 %, NS 14 % (13.86), QC 5 % (no QST, P-568 (1)). Every rate comes from the one cited CRA table (`client-money/tax/canada-gst-hst.ts`), rounded by `taxForLine`. The tax shows on the invoice page, on `GET billing/invoices` (`subtotalCents`, `taxCents`, `taxLines`) and in the Plan and billing Tax column. View opens the invoice and Download saves `invoice-SAMPLE-n.html` (attachment). No request reached stripe.com and no customer was stored. The page says "Unconfirmed: no counsel, no accountant", with the source URL, quote and read date. There is no `concept.md` for J-21: I checked against P-796 and j_21's header.

## Points asked about
* **Tax and totals:** correct. Amount due = subtotal + tax. `BillingInvoice`'s refine makes `taxCents` equal the sum of `taxLines`, and null means "not said" (never 0). Read, list and page agree on every case I tried.
* **Stand-in outside local or with Stripe:** `runtime-ports.ts:43` sets `standIn` only when there is no key and `PLATFORM_ENVIRONMENT=local`. Otherwise it is null and both routes answer 404 (`stand-in.ts` `fake()`). The deploy sets test or production. The code is right, but the rule is untested: see M1.
* **Cross-firm isolation:** holds. The customer comes from the firm id (`cus_standin<uuid>`). The read is scoped by the session's firm. Firm B read [] and then only its own invoice. A's token on another id gives 404.
* **Unauthenticated invoice page:** 24-byte random token, compared in constant time. A wrong, missing or other-id token gives 404. Headers: `no-store`, `no-referrer`, CSP `default-src 'none'; style-src 'unsafe-inline'`. Every value is escaped: a firm name `<img src=x onerror=…>` and `<script>`/`<b>` in the address came out as text and no dialog fired. The filename is sanitised. Logs carry the route template only, never the token.
* **Web link allow-list:** Stripe https links, or the same origin plus `/api/demo/billing/invoices/` with no credentials. `javascript:` is still dropped (pf5s2). The same-origin clause has no failing test (m3).
* **Stripe adapter:** `taxOf` maps `total_taxes[].amount` and `subtotal_excluding_tax ?? subtotal`, guessing no rate or province. The fields exist in stripe 23.1.0 (API 2026-10-28). It is tested only on hand-made objects, not through `StripeBilling.invoices` (m4).
* **Backwards compatibility:** the defaults keep old fake data valid (`z.input` on `invoiceList`), and both pf5 suites pass unchanged.

## Findings
**Blocker:** none.

**M1 (Major, Must): the environment gate has no failing test.** `runtime-ports.ts:43` (`!key && config.environment === "local"`) is the only thing that keeps an invoice issuer and an open `/api/demo` page off test, production and Stripe-keyed servers. No test calls `runtimeBillingPorts` (grep of `tests/`). The case in `check_r121_invoice_tax.ts:48-49` ("a Stripe key, or not local") builds `BillingStandIn` with `standIn: null` by hand. Deleting either clause would still pass every suite, against STANDARDS §7 [M] "a rule's test fails when the rule is removed" and §3.10. **Fix:** in check_r121's port part (no server), assert `runtimeBillingPorts(...)` gives `standIn === null` for `test`, for `production`, and for `local` with a test key and webhook secret (billing is then Stripe), and `standIn === billing` for `local` with no key.

**Minor** (fix, or list in the PR):
* m1 `stand-in.ts:63`: `currency: "cad"` is hard-coded although `platform_plan.currency` exists. Use `sub.plan.currency`, or refuse a plan that is not in CAD. All seeded plans are CAD today.
* m2 `stand-in.ts:58`: the YEARLY branch (yearly price, "one year") is never exercised. Add one yearly case.
* m3 `billing-contract.ts:88`: no test drops a cross-origin `http(s)://other/api/demo/billing/invoices/…` link. Add one line to pf5s2 or check_r121.
* m4 `stripe.ts:65`: test the adapter's `invoices()` on a recorded `/v1/invoices` answer with `total_taxes` (the pf5 suite already records Stripe answers), not only `taxOf`.
* m5 `stand-in.ts:122`: the open page lacks `x-content-type-options: nosniff` and `frame-ancestors 'none'`, and sends `x-powered-by: Express` (STANDARDS §8 [M] headers). Cheap to add.
* m6 At 400 px the Tax cell breaks per character ("$1 3. 86 CA D (H ST…)") and Download sits in the table's inner scroll (`billing-page.tsx:35`, `[overflow-wrap:anywhere]`). The 1024 px and 200 % views are fine.
* m7 `stand-in.ts:31`: the invoice a firm reads shows the decision id "(P-796)" (EXPERIENCE: no IDs on the main path). Keep it in code comments.
* m8 A stale or wrong link (for example after the demo restarts, since invoices are kept in memory) opens raw JSON problem text in the new tab. A plain "This invoice link is no longer valid" page would read better.
* m9 Race at this commit (`stand-in.ts:51-61`): the check, then awaits, then the set, so two parallel first calls could make two invoices, the first with a dead link. Not reproduced with 12 parallel calls. 5647a0094 adds a per-firm lock (not reviewed).
* m10 The demo: no person can make the stand-in issue an invoice. It takes a bearer token and a POST, and the PR's "On the demo" still says "to follow". P-796 allows a "seedable" fake, so this is not P-33's Major, but the founder needs written steps or a Demo-menu action to see R1.21 at :4400.

## D1–D20 (1–5)
D1 4 done-when met (m10) · D2 4 refine and one per firm; m9 · D3 5 reuses the cited table and `taxForLine` · D4 N/A · D5 3 kept in memory; m8, m9 · D6 4 rate read dates shown; the stand-in writes no audit (it plays the provider) · D7 N/A · D8 4 breadcrumb My account › Plan and billing · D9 4 View · Download clear · D10 4 m7 · D11 4 409 in words; "Not worked out yet" · D12 4 m6 · D13 4 axe clean on 400/1024/1440 and the invoice page; keyboard reaches both links with names · D14 4 the invoice page stands apart, like a hosted invoice · D15 5 page 2–4 ms; one read per view · D16 3 M1, m2–m4 · D17 simulated only · D18 5 URL, quote and read date on every invoice · D19 4 sign-up → address → invoice → open/download (the Stripe test-mode walk is still owed, P-796) · D20 simulated only.

## BIC-01–BIC-20
N/A: Plan and billing is a firm-account screen, not a case-side screen (EXPERIENCE §6 scope), and no concept opts in.

## Graph (P-86)
`graph.mjs` G3 lists `POST /platform/billing/stand-in/invoice`, `GET /demo/billing/invoices/:id` and the older `GET /platform/billing/invoices` as reached by no test. check_r121 and j_21 do call all three, through their `j()` helper: this is a limit of the tool, not a finding. Every element serves R1.21. `select-suites` picks check_r121 for CI.

## Not checked
A real screen reader. A visible (headed) browser: the walk was headless. An intended user's unaided walk (D17, D20 stay with the founder). Stripe's real hosted invoice and Stripe Tax. Whether PST applies to our software subscription (Unconfirmed: no counsel, no accountant; P-701). Commits after b9d69d283. The full CI suite set (360 selected). The team's code retrofit: PF-5 billing is ours, with no team screen to map.

Reviewer: Changes b9d69d283e27f1bb6beaf2a2a875743b83c04308

## Round 2: diff-only, b9d69d283..ab898493ae0d59a6a4e82fc7824d76d08dbeb96f (prototype/)
Commits 5647a0094 (one issue per firm at a time), b97e2ffe6 (the breaker's Minors) and ab898493a (this review's M1, m3, m5, m6, m7). Copies `rev121r2` :4726 and `rev121r2b` :4727, from a worktree at ab898493a.

**Verdict: Approve.** No Blocker or Major is open.

| Run at ab898493a | Result |
|---|---|
| `check_r121_invoice_tax.ts 4726` | 28/28, exit 0 |
| `journeys/j_21.ts rev121r2 4726` | 17/17, exit 0 |
| `check_pf5_signup_billing.ts` (account.ts changed) · `check_pf5s2_billing_browser.ts 4727` | 107/107 · 55/55, exit 0 |
| `tsc` api (no error in changed files) · web | clean |
| Walk and break pass re-run (NS, QC, hostile names, other firm, tokens, 400/1024/1440, keyboard, axe) | as round 1; details below |

**Round-1 findings:**
* **M1: fixed.** `runtimeBillingPorts` is now tested in check_r121's port part. local with no key gives `standIn === billing`. local with a key, test, production, and test with a key all give `standIn === null`. Deleting either clause of `runtime-ports.ts:43` fails "port fail: with a Stripe key (local), or outside local…" (checked by reading: the four cases cover each clause).
* **m3: fixed.** A test now drops another host, another path, `user:pass@` and `javascript:`, while a same-origin stand-in link and a Stripe link pass.
* **m5: fixed, seen live.** CSP has `frame-ancestors 'none'`, `x-content-type-options: nosniff` is sent, and `x-powered-by` is absent.
* **m6: fixed.** At 400 px the Tax cell wraps by word ("$13.86 CAD (HST 14 %, NS)" in a 144 px cell). Status, View and Download now sit in the table's inner horizontal scroll (393 → 493 px of 366). There is no page-level sideways scroll, and Tab still reaches both links. Acceptable.
* **m7: fixed.** No decision id on the invoice: "Stand-in invoice: issued by our billing stand-in for testing, not by Stripe…".
* **m9: fixed** by 5647a0094. **Mutation spot-check:** with the lock bypassed in my scratch copy only, the new 8-call test failed for BC (5 different invoice ids) and passed for ON (27/28). So the test catches the lock's removal, though not on every case, and the race was real.
* **m1: fixed differently.** A plan not priced in CAD is refused with 409 NOT_CAD before an invoice is made. The hard-coded "cad" then always matches the plan.
* **m2, m4, m8, m10:** left as PR notes, accepted as Minors (m2: the breaker checked yearly by hand, with no test).

**New code, checked:**
* `issue` shares one promise per firm, and `fake()` refuses (404) before any lock is taken. A rejected first call releases the lock (`finally`).
* Ids are random (`in_standin` + 24 hex) and numbers are per firm (`SAMPLE-<8 hex of the firm id>-0001`). A's token on another id answers 404. The round-1 walk's "other id" check used a digits-only pattern that no longer fits the new ids; it was re-done with a valid other id.
* `@HoldOpen()` on the issue route; still `agent/subscription:pay`; no session gives 401 (check_r121).
* `account.ts`: reads the stored customer and the stand-in customer together. On a Stripe server `standIn` is null, so only the stored customer is read, as before. Firm B still reads only its own invoices.
* Invoice page `overflow-wrap:anywhere`: long hostile names wrap. Escaping is unchanged and no dialog fired.

**New Minors (no fix needed to merge):**
* r2-m1 `account.ts`: the two-customer read has no test (a firm with both a stored customer and a stand-in invoice). The two lists are joined without sorting by date.
* r2-m2 check_r121's 8-call test caught the lock's removal on one of its two cases. A larger burst, or a short wait inside `issueOnce` in the test, would make it fail every time.

Journey score, round 2: **9.5/10, Pass** (was 8.5). Plain words rises to 1 (m7) and accessibility and screen sizes rises to 1 (m6). Error recovery stays ½ (m8: a stale link shows JSON; invoices are kept in memory).

Reviewer: Approve ab898493ae0d59a6a4e82fc7824d76d08dbeb96f
