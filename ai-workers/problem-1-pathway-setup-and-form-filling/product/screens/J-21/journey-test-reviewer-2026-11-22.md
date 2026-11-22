# Journey test (reviewer): R1.21, the tax on our own invoices (PR #2987, commit b9d69d283)

22 Nov 2026 · reviewer role, the one journey score for this check · copies `rev121` :4724 and `rev121b` :4725 from a worktree at b9d69d283 (`PLATFORM_IDENTITY=local`, no Stripe key, so the billing stand-in is on) · Playwright, headless (no visible browser in this cloud session) · US$0, 0 requests to stripe.com.

## Journeys (persona: a firm's Owner)
| # | Goal in their words | Steps | Result |
|---|---|---|---|
| J1 main | "Show me my invoice with the tax for my province, and let me keep a copy" | sign up via the public door → sign in → My account › Plan and billing → save a Nova Scotia address → (the stand-in issues the period's invoice) → reload → View → Download | PASS: row "SAMPLE-0004 · 22 Nov 2026 · $112.86 CAD · $13.86 CAD (HST 14 %, NS) · Open · View · Download"; the page shows the plan line $99.00, "HST 14 % (NS)" $13.86, total tax, amount due $112.86, the CRA URL, quote "Nova Scotia \| 14% \| N/A" and read 2026-11-22; Download is `attachment; filename="invoice-SAMPLE-0004.html"` |
| J2 alternate | Ontario and British Columbia (j_21, check_r121) and Quebec (walk) | the same | PASS: ON HST 13 % 12.87; BC GST 5 % 4.95 (no PST); QC GST 5 % 4.95 (no QST, P-568 (1)) |
| J3 empty | "Where are my invoices?" before an address or an invoice | open Plan and billing | PASS: "No invoices yet."; the address panel says why it is needed |
| J4 error | invoice asked before the address is saved | stand-in issue | PASS: 409 "Save your business address first: the tax on your invoice is worked out from it." |
| J5 wrong role / no session | issue or read with no session | POST issue, GET read | PASS: 401 for both |
| J6 another firm | firm B reads, then guesses A's link | B's read, then A's token on another id | PASS: B sees [] and then only its own; a wrong, missing or other-id token gives 404 |
| J7 recovery | double or parallel issue; address changed after the invoice | 3 parallel, then 12 parallel; then PUT an Ontario address and issue again | PASS: one invoice each time (no duplicate reproduced); the issued invoice keeps NS (not re-taxed) |
| J8 hostile input | firm name `<img src=x onerror=alert(1)> "Ünïcödé" 移民`; address `<script>…`, `<b>7</b>`, `Rue "Évora" & co` | open the invoice page | PASS: everything escaped and shown as text, accents and CJK kept, no dialog, CSP `default-src 'none'` |
| J9 sizes / keyboard | 400, 1024, 1440 px; 200 % of 1024 (512 px); Tab only | Plan and billing and the invoice page | PASS with a note: axe WCAG 2.2 A/AA 0 violations on both pages; no page-level sideways scroll; Tab reaches "View invoice SAMPLE-0004 (stand-in) (opens in a new tab)" and "Download invoice SAMPLE-0004". At 400 px the Tax cell breaks per character and Download sits in the table's inner scroll |
| J10 boundary | the next screen | j_21 W5 | PASS: "Manage plan and billing" (R1.22's first step) is offered |

Scripted runs at the exact commit: j_21 17/17 · check_r121_invoice_tax 23/23 · check_pf5_signup_billing 107/107 · check_pf5s2_billing_browser 55/55.

## Data underneath
`GET /api/platform/billing/invoices` matches the row and the page to the cent (`subtotalCents` 9900, `taxCents` 1386, one `taxLines` entry {HST, NS, 140000, 1386}, `amountDueCents` 11286, currency CAD). There are no database writes for the invoice (it is kept in the stand-in's memory), and `platform_subscription.stripe_customer_id` stays empty. Exactly one audit line comes from the address save (j_21 W2). The server log carries the route template, never the token. Roles are enforced on the server (401, firm scope).

## Findings (details and file:line in `review-r121-tax.md`)
* Major: M1. The rule "stand-in only on a local server with no Stripe key" (`runtime-ports.ts:43`) has no failing test.
* Minor: m6, the Tax cell at 400 px. m7, "(P-796)" printed on the firm's invoice. m8, a stale or wrong link opens raw JSON. m10, no person can make the invoice appear on the demo without an API call. The rest are in the review.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: tax listed, opened, downloaded |
| Next step obvious | 1 | View · Download beside each invoice; the address panel says it is needed for tax |
| Plain words | ½ | the list reads plainly; the invoice prints "Stand-in invoice (P-796)" (m7) |
| Feedback and state | 1 | 409 in words; "Not worked out yet" when the provider has not said; status Open |
| Correct data | 1 | ON, BC, NS and QC exact; read = list = page |
| Error recovery | ½ | a restart forgets the invoices (documented); a stale link shows JSON (m8); race window at this commit (m9) |
| Accessibility and screen sizes | ½ | axe clean, keyboard fine, 1024 and 200 % good; 400 px Tax cell per character (m6) |
| Speed | 1 | invoice page 2–4 ms server; one read per view |
| Visual quality | 1 | 1440 and 1024 aligned, team table; the invoice page is clean and simple |
| Trust and sources | 1 | CRA URL, quote, read date, Sample prices, "Unconfirmed: no counsel, no accountant" |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

Fixes that would raise it, most valuable first: drop the decision id from the invoice words (m7); give the 400 px Tax cell a normal wrap (m6); show a plain HTML "link no longer valid" page instead of JSON (m8).

## Not tested
A visible (headed) browser, a real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder). The :4400 demo. Stripe test mode with Stripe Tax (owed under P-796). Commits after b9d69d283 (5647a0094, ff321442e). Screenshots from this walk are outside the repository and not committed.
