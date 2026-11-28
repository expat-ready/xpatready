# J-57 journey test, reviewer role, 25 Nov (PR #3692 head 5abc7c41)

**What is under test:** the journey `tests/journeys/j_57.ts` itself (R1.57 part 0, written first under P-606), not a built screen. None of its screens is built yet (FO-7s2 parts 1-2, FO-7s3a part 1). The question is whether the walk proves R1.57's done-when once those parts merge, and whether it fails honestly until then.

## Journeys (from the shape's W1-W9)
1. The Owner sees card payments Active; a case officer is refused (W1).
2. Staff make the pay link: full amount only, none for a trust request (W2).
3. The client opens the link with no sign-in (W3). Then the card pays (W4) and is booked to operating, never trust, with one receipt (W5).
4. A declined card leaves the invoice unpaid, with the reason (W6).
5. Firm B, with no account, shows its offline details (W7).
6. Walls: another firm's staff get 404; an unknown or settled link is not found (W8).
7. Across the boundary: Money › Payments shows the payment as operating (R1.58's first step, W9).

## Walked
On copy `j57r` (:4435), from the checkout at #3633's head (part 2a), headless:
* Without `J57_STRIPE_ACCOUNT`: 8/22.
* With a fake `acct_` id and no Stripe key: 9/22. W1 then passes only from the journey's own seed (review M1).

I could not walk a screen by hand: none of the journey's screens exists yet. `/money/pay/:token` and `/settings/payments` render no product page on this head.

## What held
* Part 2a's API answers match the journey's expectations: the token shape, `amountDueMinor`, `card.offered`, `offline.details`/`contact`, `LINK_NOT_WORKING`, 403 for the case officer, 404 across firms.
* The data checks are the right ones for the done-when: `CARD:OPERATING:<due>`, exactly one card payment and one receipt, zero trust entries, the declined invoice's due amount unchanged with no payment. W5 and W6 are guarded by `paidOnStripe` and `declined`, so neither passes without a card having been tried.
* Every SQL column the journey reads exists (`received_into`, `money_receipt.payment_id`, `audit_event.entity_key`; checked with psql on the copy).

## Findings
See `review.md` M1-M5 and m1-m9:
* W1 passes from its own seed.
* W1's screen path and words do not match the concept.
* W9 needs FO-7s3a part 1, and a trust answer of Yes.
* Some labels name no part.
* The trust-request and settled-link fail cases are missing.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Runs to its summary, exit 1 as designed, both runs |
| Next step obvious | ½ | Most labels name their part; W8, W3-card and W9 do not, and none do once the account id is set (M4) |
| Plain words | 1 | Labels read as sentences with the rule cited |
| Feedback and state | 1 | Each failure prints the answer it got |
| Correct data | ½ | Operating, one receipt and never trust are checked; W1 checks its own seed (M1); the trust count is absolute (m3) |
| Error recovery | ½ | Part amount, declined card and unknown link are tried; trust request and settled link are not (M5) |
| Accessibility and screen sizes | ½ | 1440 px only, which the shape allows; the 375 px claim is unmet (m2); no axe (the screen tests own it) |
| Speed | 1 | Waits are bounded (30-90 s), with no sleeps on the non-Stripe path |
| Visual quality | ½ | Screenshots at each decision point; there are no screens yet to judge |
| Trust and sources | 1 | Sample marked, "Unconfirmed: no counsel", test mode only |
| **Total** | **7.5/10** | Below the 8 pass. Fix M1, M4 and M5 first: they raise "correct data", "next step" and "error recovery" |

## Not tested
A Stripe test-mode run (as instructed), pure main, a real screen reader, and an intended user's unaided walk (D17/D20 stay with the founder).
