Reviewer: Approve d62cdbe081c7e3dadc3322ba53c9233a673e535b

# J-57 review, round 2: PR #3692 (`tests/journeys/j_57.ts`, R1.57 part 0), fresh reviewer, 25 Nov

**Scope:** this review covers only the diff `5abc7c41..d62cdbe0`: `j_57.ts` and round 1's records under `product/screens/J-57/`. I measured it against `screens/FO-7c/shape-r1.57.md`, `fo-7s-money/concept-settings.md`, `fo-7s-money/concept-payments.md` and part 2a's code (#3633 head 5ea245dd: `card/pay.ts`, `card/account.ts`, `card/rail.ts`). I did not build this PR and did not review round 1.

**Runs:** both on the isolated copy `j57r` on :4435, started from the main checkout at #3633's head 5ea245dd, with this PR's `j_57.ts` copied in. No Stripe key was in the environment, and no call went to Stripe.
* Without `J57_STRIPE_ACCOUNT`: **10/24**, exit 1. The builder reported the same.
* With `J57_STRIPE_ACCOUNT=acct_FAKEnotreal000` (a fake id): **10/24**, exit 1. W1 reads `{"status":"PENDING",…}` and fails. W3's card reads `{"offered":false}` and fails. Round 1 got 9/22 here, with W1 passing.
* Cleanup: I deleted the copied file and restored the one screenshot the run changed (`w2-invoice-pay-link-1440.png`) with `git checkout --`. `git status` in the main checkout is clean.

## Round 1 Majors
* **M1 (W1 passed from the journey's own seed): fixed.**
  * `:96` now seeds `PENDING`, with charges and payouts off.
  * In part 2a, nothing moves PENDING to ACTIVE except a signed account event (`account.ts` `receive` → `readAccount` → `stateFrom`). `view()` only reads the row, and the journey sends no event. So W1's API step (`:102`) can pass only once the account's state comes from Stripe.
  * W3's card (`:113`) depends on `cardAccount()` (`pay.ts:125-129`), which needs `ACTIVE` and `chargesEnabled`. A PENDING row offers no card. That makes W3's screen step and W4-W6 unreachable too: the Pay button is clicked only when the count is 1 (`:162`).
  * The fake-id run confirms both.
* **M2 (wrong screen path and words): fixed.**
  * `:143` opens `/money/settings/getting-paid` (`concept-settings.md:5`).
  * `:145` looks for the ACTIVE words exactly as `concept-settings.md:24` gives them: "Clients can pay invoices by card. Money goes to your own Stripe account."
* **M3 (W9's part not named): fixed.**
  * `:204` names FO-7s3a part 1. The `/operating/` text match is gone, and the header says why (`:19-20`, `concept-payments.md:8,17`). Operating is still proven in W5's data (`:173`).
  * The builder put the dependency to the Lead on #3692. I did not block on it, as instructed.
* **M4 (labels not naming their parts): fixed.**
  * `needs(...)` (`:45-46`) now gives every step its part text, whatever `T5` says. The fake-id run shows it: every failing label still names its parts when `T5` is empty.
  * The names are right against the shape:
    * W1 API: part 5.
    * W1 screen: FO-7s2 part 1 and part 5.
    * W2 screen: FO-7s2 part 2 ("Copy pay link" is in its row).
    * W3 card: part 2a and part 5.
    * W3 screen and W4: part 2a, FO-7s2 part 2 and part 5.
    * W5 data and W6's reason: part 2b and part 5.
    * W9: FO-7s3a part 1, part 2b and part 5.
  * W8 (`:117`) can no longer pass on a missing route: it needs `link.status === 200`, and firm B's 404 must carry a problem `code` (a bare framework 404 has none).
* **M5 (two fail cases missing): fixed.**
  * Trust request (`:120-123`). The step requires:
    * the route to exist (`link.status === 200`);
    * the trust request's id to get the 404;
    * the trust request's `pay_link_token_hash` to read `none`.
  * That last check reads the row, so the step fails if the insert failed (no row) or if the SQL errors. It cannot pass vacuously. Part 2a's own wall (`pay.ts:92`, `invoiceInScope`) is what gives the 404.
  * Settled link (`:124-127`). The step requires the link made (200), the full E-transfer payment recorded (201 in my run), then `404 LINK_NOT_WORKING` (`pay.ts:117`). See n1 for the one gap left.

## New Blockers / Majors
None.

## Minors (new; round 1's m1-m9 stay open for the next round, as the builder says)
* **n1 `:124-127`** The settled-link step never reads `token3` before the payment. A link that never worked would also give `LINK_NOT_WORKING`. W2's URL check and W3's read of `token` cover the same code, so this is not vacuous today. Still, one `GET /public/pay/${token3}` → 200 before `paidOff` would make the step stand alone.
* **n2 `:167`, `:188`, `:191`** The W5 return page and the W6 decline and unpaid steps leave out part 2a. Each needs part 2a's hosted session to reach Stripe's page, which W4's label already names.
* **n3 `:11`, `:23`** The header has two gaps:
  * It still lists "W1, W3's card, W4-W6" as the steps that fail without Stripe. W9 now does too, and the quoted label text no longer matches the `needs …` form.
  * Round 1's M5 asked the header to say the deposit invoice (shape W2) is out until FO-7w1. It does not say so.
* **n4 `:94-95`, `:102`** "ACTIVE comes from Stripe through part 5's account read". But the shape's part 5 lists only "the walk's Stripe wiring (Q5)", and Q5(c) says the runner gets no webhooks. So on the runner, the move from PENDING to ACTIVE belongs to no named part until part 5 adds an account read. A note for the Lead with the W9 question, not a block. The label correctly names part 5.
* **n5 `:120`** The trust answer is now set to Yes for the rest of the walk. That is the condition under which "Received into" shows (`concept-payments.md:8`), so W9 could check "Operating" on screen again. This is optional, because W5's data already proves it.

## Screen dimensions and graph
N/A: there is no screen in this PR, and the same holds as in round 1.

## Journey score (reviewer; the one score for this check): 8.5/10
Up from 7.5. The walk now fails honestly on every part not merged, and no step passes on its own seed. Two things keep the score below 10. Two of the shape's checks are still read from data rather than on screen (W6's reason, W9's operating; round 1's m6 and m9). And n1's settled link lacks its "before" read. I wrote no separate journey-test report for round 2: the caller asked for this one file.

## Not checked
* I made no Stripe test-mode run, as instructed. W4-W6 on Stripe's page were read, not run.
* I did not recheck round 1's Minors m1-m9 one by one (only m3: the trust request this round adds creates no `money_trust_entry`, so W5's firm-wide count still holds).
* W9's chain question is the Lead's to answer on #3692.

**Verdict: Approve**: no open Blocker or Major at d62cdbe081c7e3dadc3322ba53c9233a673e535b.
