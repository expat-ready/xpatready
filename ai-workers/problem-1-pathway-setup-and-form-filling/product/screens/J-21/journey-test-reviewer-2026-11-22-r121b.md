# Journey test (reviewer role): R1.21 follow-up, GST/HST number and old-link page (PR #3124)

22 Nov 2026 · commit 90da148cdd0ff858fdd77bee2f605f299dd6c138 · my own worktree at that commit · copies `rv121bn` :4437, `rv121bq` :4435 (never :4400 or :4728). Headless Playwright (Chromium headless shell 1243) with axe-core. US$0, no Stripe call. The review is `review-r121b-number.md`.

## Journeys (written before testing)
1. **Main (firm Owner):** "I want our invoice, with the seller's tax number on it." Sign in → Plan and billing → View. Expected: the invoice shows `GST/HST registration number: <the number set on the server>`.
2. **Alternate (platform with no number set):** the same steps. Expected: the Sample `000000000 RT 0000 (Sample: not our real number)`.
3. **Error (stale link):** the Owner has the invoice open, the demo restarts (the stand-in forgets its invoices), and the Owner reloads. Expected: a page in words, not JSON, with a way back to Plan and billing.
4. **Error (operator):** the operator sets a malformed number. Expected: the start-up is refused, naming the setting and never the value.
5. **Wrong role / no session:** someone follows the page's "Plan and billing" link without a session. Expected: sign-in first.
6. **Recovery:** after the old-link page, the Owner gets back to their invoices. Expected: Plan and billing shows the current state ("No invoices yet." after a restart).
7. **Break:** a wrong token, an unknown id, no token, a repeated `t`, a 5 000-character id, a wrong-token download, HEAD, and a non-ASCII token.
8. **Boundary:** the invoice page hands back to Plan and billing (R1.21 → PF-5s part 2).

## Walk (what a person sees)
* **J1:** "View" on Plan and billing opened a new tab with `GST/HST registration number: 000000001RT0001` (the copy's setting). No wrong turns, page in 13–38 ms. A note on the words: the line sits right under the *firm's* address, so it is unclear whose number it is (review m3).
* **J3, J5 and J6:** I restarted the copy with no number set and reloaded the old tab. It showed "This invoice link has expired or is not valid." / "Open Plan and billing to see your invoices. Sign in first if you are asked to." I clicked the link and got `/settings/billing` → "Sign in to your firm" (no session in that tab: correct). I signed in again in the first tab, and Plan and billing said "Invoices No invoices yet.", which is true after a restart.
* **J2:** I issued an invoice through the API, because no screen issues one (pre-existing, #2987 m10). View then showed `GST/HST registration number: 000000000 RT 0000 (Sample: not our real number)`.
* **J4:** the start with `<b>secretish123</b>` was refused: "PLATFORM_GST_HST_NUMBER is set but not valid: expected … Values are never shown." The value appeared 0 times in the log. The wording reads as if 9–20 characters were the CRA's format (review m4).
* **Keyboard:** on the old-link page the first Tab reached "Plan and billing" (focus outline auto), and Enter followed it.

## Replayed as automated checks
| State | 400 px | 1024 px | 1440 px | 200 % at 1024 |
|---|---|---|---|---|
| Invoice (number set) | axe 0, no sideways scroll, 0 console errors | same | same | — |
| Old-link page | axe 0, no sideways scroll; only the expected 404 resource line | same | same | no sideways scroll |
The builder's scripted checks, re-run by me: check_r121_invoice_number 13/13 and j_21 17/17. I ran each pass once per state (the 13/13 suite ran twice, once alone and once inside the walk set, with the same result).

## Data underneath
Nothing is written: the stand-in keeps invoices in memory, and the number comes from the environment. The invoices read gave exactly one invoice per firm, and after the restart the list was empty. The loader's `config.billing.gstHstNumber` is the trimmed value (test: `" 123456789 RT 0001 "` gives `"123456789 RT 0001"`). The server enforces roles: the issue route still needs `agent/subscription:pay`, and the page is reached only by its random token.

## Break pass
| Probe | Result | Severity |
|---|---|---|
| Wrong token / unknown id / no token / `t=a&t=b` / 5 000-character id / `&download=1` wrong / HEAD | 404 `text/html`, the same bytes and headers, no attachment | holds |
| The right link with `&download=1` | 200, `attachment; filename="invoice-SAMPLE-….html"` | holds |
| Known id, token of 32 × `é` | **500 `application/problem+json`** (`timingSafeEqual` RangeError, `stand-in.ts:103`) | Minor (local stand-in only; review m1) |
| `/api/demo/billing/invoices/` (another route) | 404 problem JSON with `x-powered-by` | not this PR |

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 and J3 as expected |
| Next step obvious | 1 | the old-link page points to Plan and billing; it reaches sign-in, then the list |
| Plain words | ½ | whose number is ambiguous (m3); the refusal implies a CRA format (m4) |
| Feedback and state | 1 | "No invoices yet." after a restart; Sample labelled |
| Correct data | 1 | the number exactly as set (trimmed); nothing stored |
| Error recovery | ½ | every old link gets the page, except a non-ASCII token → 500 JSON (m1) |
| Accessibility and screen sizes | 1 | axe 0 on 400/1024/1440, 200 % fine, keyboard reaches the link |
| Speed | 1 | 11–38 ms per page |
| Visual quality | 1 | matches the invoice page's plain look (`w3-invoice-link-not-valid-1440.png`) |
| Trust and sources | 1 | Sample labelled "not our real number"; the uncited CRA format stated openly |
**8.5 / 10: pass** (no 0). Fixes that would raise it, most valuable first: m1 (byte-length compare), then m3 and m4 (wording).

## Not tested
A real screen reader. A headed (visible) browser. An intended user's unaided walk (D17 and D20 stay with the founder). The CRA's real number format. Stripe's own invoices. My screenshots are in the session's scratchpad only (not committed); the PR's own `w3-invoice-page-number-sample-1440.png` and `w3-invoice-link-not-valid-1440.png` show the same states.
