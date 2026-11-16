# qa capability batch: Release 1 map rows 19, 21, 100, 28, 30, 31, 59 (16 Nov, main 90ea6cfe6)

**Mode:** `/qa capability` on seven rows the board shows as Built ("every part merged") that qa's file did not mark Works. Ordered by the cheapest likely Proven first. Model Opus 5.5, effort high (P-608). Live AI off, US$0 (P-175).
**Commit:** main `90ea6cfe6` (PR #1908's merge). Stacked on qa PR #1929 (head `a80c8d359`, not merged yet), which already gave R1.19 and R1.59 Partial and named the missing parts for 21, 28, 30 and 31. This round re-tests all seven on a running copy and changes three verdicts.

## Verdict: none is Proven. 4 Partial, 2 Not built, 1 Partial confirmed

| Row | Verdict | Met | Missing part (what blocks Proven) |
|---|---|---|---|
| 19 Firm created once, with plan, trial and owner | **Partial** (confirmed) | the door's checks; one pending sign-up kept as typed; one firm, one Owner and audit lines in PF-5's pack | QA-481: no person can confirm the sign-up (the code reaches no inbox); no sign-up page (PF-5s); trial end never stored (PF-5 part 2) |
| 100 Recorded acceptance of terms, privacy, data agreement | **Partial** (was "Built, awaiting qa (part)") | current versions named; refused with none, two of three, or a non-current one; acceptance rows with who, when, version | finishing sign-up (QA-481); acceptance shown nowhere; "asks again on a new version" in no part |
| 59 Money arithmetic | **Partial** (confirmed) | integer cents, currency on every amount, mixed currencies refused (FO-7a 123/123) | the rounding rule: QA-482; FO-7b ("rounded per line by FO-7b", the schema's own comment) |
| 28 Consent recorded per purpose | **Partial** (was Not built) | web form tick → one consent row with channel, purpose, wording, source, time; no tick → none; an edit refused by the database | withdrawal reachable by nobody (`ConsentPort.withdraw` has no caller); PF-19b part 2 (one-click unsubscribe) and FO-2 part 3 |
| 30 Lead lists, filters and board | **Partial** (was Not built) | Unassigned, Mine and All open at 400, 1024 and 1440 px; axe clean; no sideways scroll; search | filters by stage, owner, source, date; the board (drag and keyboard): FO-4 part 2 |
| 21 Our own invoices with sales tax | **Not built** (confirmed) | — | `GET /api/platform/billing/invoices` 404: PF-5 parts 2 and 3 |
| 31 Stage kinds; won by signature; totals per currency | **Not built** (confirmed) | FO-1a's stage tables only | prospects API 404: FO-2 part 3, FO-4 part 2 |

**Why the board said Built:** the board's merge test matches an id in a merged PR's title (FORMULAS R1b, an accepted limit). "PF-5 part 1", "FO-2 part 1/2" and "FO-4 part 1" match PF-5, FO-2 and FO-4. BACKLOG splits each into later parts that are not on main. Rows 19, 28 and 59 also need parts their checklist row does not name: PF-5s, PF-19b part 2 and FO-7b (questions 1-3).

## How it was tested
* **Packs on this commit (cloud copy, `cloud-setup.sh`):** `check_pf5_signup_billing.ts` 53/53 · `check_fo2_leads_prospects.ts` 113/113 · `check_fo7a_money_schema.ts` 123/123 · `check_pf19a_messages_schema.ts` 94/94 · `check_fo4_sales_browser.ts` 45/45 (isolated copy, `PLATFORM_IDENTITY=local`).
* **Like a person, and underneath:** new `prototype/studio/tests/qa/check_qa_r1_platform_fo_walk.ts`. It covers the sign-up door by API (the page a person would use is not built), the hosted web form in a browser at 400 px, and Leads signed in as the Case Manager at 400, 1024 and 1440 px with axe. Each step is checked against the database. Run twice headless on two fresh isolated copies and once headed under xvfb: **20/32 each time, the same lines.** Its 12 FAIL lines are the missing parts and QA-481, QA-482 and QA-484. They pass when built.
* **Screenshots:** `2026-11-16-capability-r1-batch/r1-28-web-form-thanks-400.png`, `r1-30-leads-{400,1024,1440}.png`.
* **Probes that held:** a 5,000-character firm name → "firmName: 2 to 120 characters"; a stamp not ours → "This form is too old. Reload the page and send it again."; a firm name with accents and CJK is stored as typed; the 11th sign-up from one place in 10 minutes → 429 "Too many tries from here. Wait a few minutes and try again." (seen on the 2nd run on one copy); a verify with an unknown token or an empty body → 404 "This link is not valid any more. Sign up again, or sign in."

## Bugs
* **QA-481** (Gap · Major, from #1929): re-seen on 90ea6cfe6. After a valid sign-up the platform inbox for that address is empty, and no route exposes the stand-in's code.
* **QA-484** (UX · Minor, **new**): an empty sign-up answers in the validator's words ("email: Invalid input: expected string, received undefined").
* **QA-482** (Gap · Major, from #1929): stands; no code in `api/src` rounds tax.
* Totals for this round: 0 Blocker · 0 Critical · 0 new Major · 1 new Minor (QA-484).

## Coverage
Not measured this round (c8 not run): no app code changed under these rows since the last coverage report. The 5 packs above are the rows' own tests, each with a pass and a fail per rule.

## Not tested
* The shared demo on :4400, read-only: it is not running in this cloud copy.
* Keyboard-only and 200 % zoom on Leads: FO-4's pack covers keyboard Take it. Zoom was not walked; there is no new screen since FO-4 part 1's review.
* Gate A for any row: none claims Works.

## Questions for the Lead
1. **Row 19:** add PF-5s (the sign-up screens) to checklist row 19, beside PF-5 part 2? A person cannot sign up without them. (Extends #1929's question 1.)
2. **Row 28:** add PF-19b part 2 (one-click unsubscribe, the first caller of `ConsentPort.withdraw`) to checklist row 28? "Withdrawing one keeps the others" is reachable by nobody until then.
3. **Rows 59 and 100:** #1929's questions 2 and 4 still stand: FO-7b or a named rounding part for row 59, and which row builds "a new terms version asks again at the next sign-in" for row 100.
4. **Board:** should the board's built test count an id as merged only when no later "part n" of it is open in BACKLOG? Otherwise rows like 21, 30 and 31 read Built with a part missing.

## Suggestions
* *Needed for the proof · Scaffolding:* a demo-only route that shows the local identity stand-in's verification email (like `/api/demo/platform-inbox`), so qa and the founder can walk sign-up end to end before Cognito. Or send the stand-in's email through `MailPort`'s local adapter. QA-481's fix may already be one of these.
