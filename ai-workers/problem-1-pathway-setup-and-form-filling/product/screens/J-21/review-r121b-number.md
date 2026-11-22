# Review: R1.21 follow-up, our GST/HST registration number on the invoice and the old-link page (PR #3124)

Reviewer (fresh context, did not build it) · 22 Nov 2026 · **reviewed commit 90da148cdd0ff858fdd77bee2f605f299dd6c138** (`git diff origin/main...90da148cd`, 2 commits: 0b54065bb code, 90da148cd screenshots).
Skills: screen-review and journey-test (reviewer role, report `journey-test-reviewer-2026-11-22-r121b.md`). I used my own worktree at the exact commit and copies `rv121bn` :4437 (number set, then unset after a restart), `rv121bq` :4435 (qa53). pf24 ran on :4438 and pf24w on :4434. I never used :4400 or :4728. Cost US$0, no Stripe call.

**Verdict: Approve** (Ship). No Blocker or Major is open. Six Minors follow: fix them here or list them in the PR.

## What I ran (exact commit)
| Run | Result |
|---|---|
| `check_r121_invoice_number.ts 4437 xr_studio_rv121bn` | 13/13, exit 0 |
| `check_r121_invoice_tax.ts 4437` · `journeys/j_21.ts rv121bn 4437` | 28/28 · 17/17 |
| `check_pf24_secrets` (lists SETTINGS; required = not optional) · `check_pf24w_environment` (counts each setting's reads) | 84 passed · 28 passed, 0 failed |
| `check_forms_qa53` (open-read table, `/api/demo/billing/invoices/:id` already "open") · `check_pf12b_doors` · `check_pf8b_host_suffix` | 43 passed · 33 passed · 17/17 |
| `graph.mjs` | G1 0 · G2 0 · G4 0 · G5 0 (G3 220, G6 17: the tool's known limits); check_r121_invoice_number is linked to stand-in.ts |
| `tsc -p api` | no error in any changed file (15 older errors, all in other tests) · `count-any.mjs` 416 ≤ 433 |
| Live probes, Playwright walk across a restart, axe on 400/1024/1440 px | see journey report |

## The points I was asked to check
* **Plain shape instead of the CRA's format (AGENTS rule 4):** handled honestly. The limit is stated in three places: the code comment (`settings.ts:37-39, 64-67`), the module row `R1-21b.md` and the PR's question to the tech lead, which asks for a Mac read with page, quote and date and then a tightening. No CRA value is asserted in code. The Sample `000000000 RT 0000` is labelled "(Sample: not our real number)" on the page, which rule 4 allows. Real-looking forms (`123456789 RT 0001`, `123456789RT0001`) load; lower case, markup, a double space, too short, too long and hyphens are refused. One wording slip: m4.
* **Loader rules:** `opt(...)` makes it optional in every environment. pf24's "production with every setting loads" passes without it, and the CDK parser (`service-checks.ts:52`) reads `opt` as not required. On a live start with `PLATFORM_GST_HST_NUMBER=<b>secretish123</b>`, the refusal named only the setting ("PLATFORM_GST_HST_NUMBER is set but not valid…"); the value appeared 0 times in the log. The value is trimmed, as every setting is. It is not a secret, so `SECRET_SETTING_NAMES` is unchanged.
* **Escaping:** `esc(gstHstLine(...))` (`stand-in.ts:116`) escapes `& < > " '`. The test prints `<script>` as `&#60;script&#62;`. The loader refuses markup anyway.
* **Old-link page:** a wrong token, an unknown id, no token, `t=a&t=b`, a 5 000-character id, `&download=1` with a wrong token, HEAD, and no stand-in all give 404 `text/html`. The bytes are identical and the header set is identical (checked live: same body, same headers for a wrong token and an unknown id). So the page never says whether an invoice exists. `no-store`, `no-referrer`, the CSP with `frame-ancestors 'none'` and `nosniff` are kept, because they are set before `page()`. `content-disposition` is set only after a successful `page()`, so the page is never an attachment. The right link still gives 200 and downloads as `invoice-SAMPLE-….html`.
* **The catch:** `e instanceof HttpException && e.getStatus() === 404` (`stand-in.ts:155`) is correct by reading and live: a non-404 error still surfaces (a 500 seen live, m1). No test pins it (m2).
* **Other suites:** none needed a change. pf24 and pf24w derive their lists from `SETTINGS`. qa53 already lists the route as open, and the route and its `@OpenRead` are unchanged. The pf12b doors pass. check_r121_invoice_tax only asserts the 404 status, so it is unaffected. `RUNBOOK-secrets.md` lists no optional settings (it omits `PLATFORM_ADDRESS_SUFFIX` too), so omitting this one is not a finding.

## Findings
**Blocker:** none. **Major:** none.

**Minor** (Should; fix, or list in the PR):
* **m1 `stand-in.ts:103`: an invoice link can still answer JSON.** A known id with a non-ASCII token of the right *character* length (32 × `é`) gives **500 `application/problem+json`**, not the page. `same()` compares string lengths, then `timingSafeEqual` throws a RangeError because the byte lengths differ. This predates the PR (#2987), but it is now the one case against this PR's "never JSON". It happens only where the stand-in runs (local, no Stripe key), because `fake()` answers 404 first everywhere else. **Fix:** compare buffers, `const a = Buffer.from(x), b = Buffer.from(y); return a.length === b.length && timingSafeEqual(a, b);`, and add this probe to check_r121_invoice_number.
* **m2 `stand-in.ts:155`: no test pins "only a 404 becomes the page".** Widening the catch to every error would still pass every suite, because no case throws a non-404 from `page()`. That misses STANDARDS §7 [M] "a rule's test fails when the rule is removed" for this rule. I rank it Minor, not Major: the only effect is a server error shown as "link not valid", on the local stand-in only, with no data or security exposure. **Fix:** in the controller part of the test, call `open` with a stub whose `page` throws a 500 HttpException and a plain `Error`, and assert that each is rethrown and nothing is sent.
* **m3 `stand-in.ts:116`: whose number is it?** The line sits directly under the firm's address block ("…to **Sample Walk** / 100 King Street West / … / Canada / GST/HST registration number: …"), so a firm can read it as its own number (screenshot `w3-invoice-page-number-sample-1440.png`). **Fix:** "ExpatReady's GST/HST registration number: …", or put it with the issuer line.
* **m4 `settings.ts:68`, the refusal's wording:** "the platform's GST/HST registration number as the CRA issued it: 9 to 20 digits, capital letters and single spaces" reads as if 9-20 were the CRA's format. **Fix:** "…: checked for a plain shape only (9 to 20 digits, capital letters and single spaces; the CRA's format is not yet cited)…".
* **m5 The PR body says the wrong thing about the deploy:** "test and production start without it and show the Sample". Test and production have no stand-in (`runtime-ports.ts:43`), and nothing on the Stripe path reads `gstHstNumber` (grep: only `stand-in.ts`). So the setting affects only the local stand-in's invoice. A real invoice's number would have to come from the Stripe side. **Fix:** correct the PR body and `R1-21b.md` ("stand-in only"). The Stripe-side number is a launch follow-up for the tech lead (not this PR's scope).
* **m6 The follow-up has no record row.** Tightening `GST_HST_NUMBER_SHAPE` after the CRA read lives only in the PR's question and code comments. Once the tech lead answers, it needs a BACKLOG or STATE line (AGENTS rule 10).
* Still open from before, and not counted here: no screen issues a stand-in invoice; it takes the API (review m10 on #2987).

## D1–D20 (1–5)
D1 5 both asks met (set → printed; unset → labelled Sample; old link → page in words) · D2 4 m1 · D3 5 reuses the loader, the ports and `esc` · D4 N/A · D5 4 after a restart the old tab shows the page and the list says "No invoices yet." · D6 N/A (nothing written) · D7 N/A · D8 4 the page links to Plan and billing, which goes to sign-in, then billing · D9 4 one link, clear · D10 4 m3, m4 · D11 4 refusal names the setting; m1 · D12 5 no sideways scroll at 400/1024/1440 or at 200 % · D13 5 axe clean on both pages at all three widths; the first Tab reaches "Plan and billing" with a visible focus ring · D14 4 plain page, like the invoice · D15 5 11–38 ms · D16 4 pass and fail per rule; m2 · D17 simulated only · D18 5 Sample labelled, limit stated · D19 4 invoice → old link → Plan and billing · D20 simulated only.

## BIC-01–BIC-20
N/A: the stand-in invoice and Plan and billing are firm-account pages, not case-side screens (EXPERIENCE §6 scope).

## Journey score (the one score for this check)
**8.5 / 10, pass** (no criterion at 0). Plain words ½ (m3, m4) and error recovery ½ (m1); every other criterion scores 1. Details: `journey-test-reviewer-2026-11-22-r121b.md`.

## Not checked
A real screen reader. A headed (visible) browser: my walk was headless Playwright. An intended user's unaided walk (D17 and D20 stay with the founder). The CRA's real format (canada.ca is unreachable from this lane). Stripe's real invoice. The CDK unit test run (I read its parser instead). The full CI suite set.

**Verdict: Approve.** Nothing must be fixed before `review: approved`; m1–m6 are Should.

Reviewer: Approve 90da148cdd0ff858fdd77bee2f605f299dd6c138
