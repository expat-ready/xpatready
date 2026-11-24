# qa capability R1.56 (qa 9), 24 Nov ~22:4x IST

Cloud qa lane qa 9 (Track A), Opus 5.5 medium, under Lead 32. Main 4cd0091f4 (after #3305, FO-7s1 part 1, merged as a5b043164; then #3442 and #3467). Isolated copy `q9j56` on :4471, live AI off, US$0, no Stripe call.

## Verdict
**Partial, parts missing: FO-7w1, FO-7c. No verdict (P-606).**

## What ran
* `tests/journeys/j_56.ts` with qa 8's W9 alignment (262d86310, cherry-picked onto main as this PR's journey change), run from its header with `npx --prefix studio tsx` (ffmpeg is missing in the cloud): **16/18 twice, the same steps.** Was 15/18 on afe9727ee and 16/18 on #3305's head 86e04deeb (qa 8).
* Passing: setup; W2 (CRA table, cited; a rate in the request refused); W3 (Bill-to NS gives 14 % HST, PARTY_PROVINCE; a 14th code refused); W4 (no rate takes the default; an own rate never stored); W5 (government fee its own 0-tax line; taxing it refused in words); W6 (integer cents, total = sum of lines); W7 (INV- number, due date, audit line, tax frozen, PDF); W8 (401 without a session, 404 for firm B); **W9 (new)**: Money › Invoices lists the issued invoice by its number (`[data-invoice-row]`), its page opened from the list shows Totals › Tax as issued and each taxed line with its rate.

## Failing steps (each a part not built)
| Step | Answer | Part |
|---|---|---|
| W1: a draft from the client's signed retainer carries its 1,500.00 fee row | 422, `retainerId` not accepted | **FO-7w1** (BACKLOG: `POST /front-office/money/invoices` takes `retainerId`; FO-7s1's "Start from retainer"); no PR open |
| W9 last: the walk ends at R1.57's first step, a card payment link on the invoice | no Pay link / card button on the invoice page | **FO-7c** (card payment through the firm's Stripe account) |

## Not tested
Headed walk and 400/1024 px: the score waits on the parts (P-606). walks.yml j_56 on main is asked of the Lead (cloud lanes cannot dispatch, P-439).

## Stale wording (journey, Minor, no bug row)
W4, W5 and W7 labels still say "part missing: FO-7g part 1w / FO-7b part 1b"; those parts are on main and the steps pass. Tidy when W1 or W9 is next aligned.

## Questions for the Lead
* Is FO-7w1 in a lane? It is the only part for W1.

## Suggestions
* None new.
