# PF-5s part 2 follow-up: review of the round-2 Minors fix (diff only, P-277)

* **Head reviewed:** `6677f50c1bc97cc8e50cefe9f8fd5652e05a5ae0` (PR #2899), `git diff origin/main...6677f50c1`, 5 files. A fresh context; I did not build it.
* **Scope:** R2-m1, R2-m2 and R2-m3 as written at the end of `challenge.md`. The rest of PF-5s part 2 was reviewed in round 2 and is not re-scored here (no D1 to D20 or BIC table: diff only).
* **Run:** an isolated copy `rev_pf5s3` on :4702 (`PLATFORM_IDENTITY=local`, fake BillingPort), never :4400. `tests/check_pf5s2_billing_browser.ts`: **52/52 passed**. The copy is stopped and the 4 PNGs the test rewrote are restored with `git checkout`. The working tree is clean except this file.

## Does each test fail without its fix?
I put the `origin/main` source back over each fix (the test stayed at head), rebuilt, ran the test, then restored the file from the head commit.
* **R2-m1** (`billing-contract.ts` at main): FAIL at l.106, which gets `["Free trial: ended on 19 Nov 2026. Add a card before then to keep access.","Trial ends 19 Nov 2026"]`, and FAIL at l.109, which gets `"Card saved. Your first payment is on 19 Nov 2026."`.
* **R2-m2** (`address-panel.tsx` at main): FAIL at l.259 with `asked = []`: the footer Close shut the panel without asking.
* **R2-m3** (`billing-page.tsx` at main): the run stops with a `TimeoutError` at l.192 (`[data-address-form]` never opens because the button went straight to Stripe), so the R2-m3 check cannot pass.
All three tests do their job: each one fails when its rule is removed.

## Correctness of each fix
* **R2-m1:** correct for the three lines the challenge named: `trialLine` drops "before then" when the end has passed, the card line no longer gives a payment date in the past, and `datesLine` says "Trial ended". The tests check the whole line text, not a prefix. The cancel-at-period-end branch is not covered (Finding 1).
* **R2-m2:** correct. `mayClose` is the same check as `confirmClose`. The footer calls the page's `onOpenChange` directly, not Radix's wrapped handler, so there is never a second question. The X, Escape and overlay still go through `confirmClose`. An untouched panel closes without a question (walked). In the test, `.last()` selects the footer button: the X comes first in the DOM (`controls.tsx:125` before `:128`), and the page behind the dialog is hidden from `getByRole`.
* **R2-m3:** fixes the case the challenge asked about: after a warned save, a button that goes to Stripe re-opens the filled panel, and only a clean save hands off. There is a gap when the retry warns again (Finding 2).

## The DW3 rewrite: does it keep the test honest?
Mostly yes. The server's own answer is fetched first and every save really runs: `audits() === n0 + 2`, the postal code is in the database, and the rewritten body still goes through the client's `SetAddressAnswer.parse`. The first rewrite now changes nothing, because the server already returns that exact warning. The second rewrite (`onStripe: true`, `next` removed) forges an answer whose real shape is proven on the server side: `tests/check_pf5_signup_billing.ts:433` asserts `onStripe === true` and that the fake customer received the address. So DW3 honestly tests what the client is responsible for: it saves the address again and hands off only after a clean answer.
What the rewrite hides: on this fake, the server warns on **every** save. `runtimeBillingPorts` builds its own `fakeBilling()` with no customers (`api/src/platform/firms/runtime-ports.ts:43`), separate from the one sign-up uses. So the real local behaviour after this PR is the endless loop in Finding 2. That is not dishonest, because the test does not claim to show it, but the test should say so (Finding 3).

## Reviewer journey (journey-test, reviewer role, scoped to the diff)
Walked headless by a script on :4702 as the Owner (Representative), looking only at what a person sees. The score is in this file, with no separate report, because the brief said to write only this file.
1. **Trial end passed, no card (1024 px):** shows "Free trial: ended on 19 Nov 2026." and "Dates: Trial ended 19 Nov 2026", with no step in the past. Pass.
2. **Same, set to cancel:** shows "…ended on 19 Nov 2026. Your subscription is set to cancel then, so no payment will be taken." and "Cancels on 19 Nov 2026". Both are still in the future tense (Finding 1).
3. **Main path for R2-m3 (no address, Manage plan and billing):** the panel opens, the Owner types an address and saves. The warning shows and focus goes back to the button. Pressing the button again opens the filled panel (axe: no serious or critical issue). The Owner saves again and the warning comes back. Over three rounds: **3 warnings, 3 re-opens, 0 hand-offs, 3 audit lines** for the same address. After a reload, a single press goes straight to the Portal (Finding 2).
4. **R2-m2 by keyboard at 400 px:** the Owner presses Edit, types "Ottawa" and presses Enter on the footer Close. The question appears; answering No keeps the panel and the text (no sideways scroll). Answering Yes closes the panel, focus returns to Edit, and the database still says Toronto. Pass.
5. No page errors and no request to Stripe except the intercepted Portal.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Main path reaches Stripe only after a clean save. Locally (and whenever the retry warns again) it never does, short of a reload (journey 3) |
| Next step obvious | ½ | The re-opened panel does not say why it opened again ("Before you add a card: your business address…", even from the Portal button); the warning is behind the overlay |
| Plain words | 1 | The new lines are plain and in the past tense (journey 1) |
| Feedback and state | ½ | The second and third warnings are identical to the first: nothing tells the person the retry also failed |
| Correct data | 1 | Address saved exactly, audited each save, a discard leaves the database untouched (journeys 3 and 4) |
| Error recovery | ½ | The only way out of the loop is a reload, which then skips the retry |
| Accessibility and sizes | 1 | axe clean on the re-opened panel, keyboard Close and focus return work, 400 px with no sideways scroll |
| Speed | 1 | Every step under 1 s on the copy |
| Visual quality | 1 | Same panel and notice as round 2; nothing new out of place |
| Trust and sources | 1 | Sample labels unchanged; no new claim |
| **Total** | **8/10** | Pass (8 or more, no 0). Fixing Finding 2 raises the four ½ scores |

Not tested: a real screen reader; real Stripe (test mode); an intended user's unaided walk (D17 and D20 stay with the founder).

## Findings
1. **Minor: `web/src/modules/platform/saas/billing-contract.ts:51` and `:61`. R2-m1 is incomplete for a trial set to cancel.** Scenario: a trial with `cancelAtPeriodEnd` whose end passed before the webhook moved the record. The page says "Your subscription is set to cancel then, so no payment will be taken." and "Cancels on 19 Nov 2026", which is the same "as if still ahead" wording R2-m1 removes elsewhere (journey 2). Fix: when `past`, use past tense in both lines (for example "…ended on <date>. Your subscription was set to cancel then, so no payment is taken." and "Cancelled on <date>"), with a whole-line test next to l.106.
2. **Minor: `web/src/modules/platform/saas/billing-page.tsx:93`. The retry gate never lets the person through when the retry warns again, and it disappears on a reload.** The gate is `savedNote?.tone === "warn"`, and only a clean save clears it. Scenario A: Stripe's `customers.update` keeps failing while Checkout and the Portal work (rare in production; **every** save on a local copy, see the DW3 note). The Admin can never reach Checkout, and the Owner can never reach the Portal, which is also where they cancel. Each round adds another identical warning and another audit line (journey 3). Scenario B: a reload clears page state, so the next press goes to Stripe without retrying (journey 3, last step). The webhook's held draft still prevents losing tax, as `challenge.md` notes. Fix (one of): retry once, so that a second warned save from a `beforeStripe` panel hands off, or the panel then says it could not reach Stripe and offers "Continue to Stripe"; and/or give the re-opened panel a line explaining why it re-opened. A test where the second answer also warns.
3. **Nit: `tests/check_pf5s2_billing_browser.ts:3-5` and `:182-188`.** The header still says "Two answers are rewritten"; DW3's address answer makes three. The DW3 comment should also state that with no rewrite the local server warns on every save, so a reader knows the loop in Finding 2 exists and is not covered.
4. **Nit: `web/src/modules/platform/saas/billing-page.tsx:73`.** `trialLine(b, Date.now(), …)` and `datesLine(b)` each read the clock. At the exact millisecond of the trial end the two lines could disagree. Pass one `now` to both.

No Blocker or Major. R2-m1, R2-m2 and R2-m3 are fixed as recorded, each with a test that fails without its fix. Findings 1 and 2 are new Minors from the same items, for the builder to fix or record in `challenge.md`.

**Verdict: Approve** (no open Blocker or Major), for this commit only.

Reviewer: Approve 6677f50c1bc97cc8e50cefe9f8fd5652e05a5ae0

## Round 2 (head `9ecfd7060062a59f19e5426d281b4c0fa2d202db`, diff from `6677f50c1` only)
* **Run:** a fresh copy `rev_pf5s3` on :4702 (`PLATFORM_IDENTITY=local`). `check_pf5s2_billing_browser.ts`: **55/55 passed**. The copy is stopped and the 6 PNGs the test rewrote are restored. The working tree is clean except this section.
* **Fails without the fix?** I swapped in the 6677f50c1 sources (the test stayed at head), rebuilt, ran the test and restored the files each time.
  * With `billing-contract.ts` and `address-panel.tsx` swapped: the follow-up m1 check at l.110 FAILS with `["…Your subscription is set to cancel then…","Cancels on 19 Nov 2026"]`. The run then stops with a TypeError because the old contract has no `WORDS.retryStripe`.
  * With only `billing-page.tsx` swapped: the R2-m3 check ("saying why") FAILS, and the run stops with a `TimeoutError` at the follow-up m2 hand-off, because the old code reopens the panel instead of going on.
  * Every new check fails when its rule is removed.
* **Fixes:**
  * **m1:** holds, with "was set to cancel then" and "Trial ended <date> (set to cancel)".
  * **Nit 4:** holds; `billing-page.tsx:75` uses one `now` for both lines.
  * **Nit 3:** holds; the header and the DW3 comment are updated.
  * **m2:** holds for the loop. The retry happens once, the panel says why ("We couldn't send your address to Stripe last time…"), and a press after a second warning goes on to Stripe.

### Retry state, walked (fake BillingPort, the server warns on every save unless rewritten)
1. **Portal path, no address:** press, then the panel says "Before you add a card…". Save warns. Press, then the panel shows the retry words. Save warns again and focus returns to Manage plan. Press: the Portal opens. Pass.
2. **Edit-button save that warns (1024 px):** Edit, then save warns. Pressing Add a card opens the retry panel. Closing it unchanged asks nothing and the retry stays due, so the next press reopens it. Save warns. Press: Checkout opens. Pass, and no loop.
3. **Reload while the retry is due:** one press goes straight to the Portal. The retry lives in page state, so a reload drops it. This is round 1's accepted residual (the webhook's held draft keeps the tax), unchanged.
4. **Retry used up, then a new address:** Edit save warns (due). An Edit save succeeds (`retry` becomes "done", not null). Edit to city Ottawa warns. Add a card then goes **straight to Checkout** while Stripe still holds Toronto (database: Ottawa). At 6677f50c1 this press reopened the panel (Finding R2-1).
No page errors.

### Findings (round 2)
1. **Minor: `web/src/modules/platform/saas/billing-page.tsx:102`. A clean save leaves `retry` at "done" for the rest of the page's life, so a later warned save gets no retry.** `setRetry(retry === "due" ? "done" : next && retry === null ? "due" : retry)`: "done" is never reset.
   * **Scenario:** a save warns, then a save reaches Stripe, then the person changes the address and that save warns. The next card or portal press goes straight to Stripe, and Stripe still has the old address (walk 4).
   * **Impact:** because Stripe holds an address, PF-5's hold-for-missing-address does not apply, so a first invoice could be taxed for the old province. This is narrower than before the PR but new for this path; the reload case is equivalent and already accepted.
   * **Fix:** reset on a clean save, e.g. `setRetry(!next ? null : retry === "due" ? "done" : "due")`. "done" still lets the press after a warned retry go on, so there is still no loop. Add a test: a warn, then a clean save, then a warn, then a press opens the retry panel.
2. **Nit: `web/src/modules/platform/saas/billing-contract.ts:61`.** The new non-trial branch, "Set to cancel on <past date>" (an Active firm set to cancel whose period end passed before the webhook), has no test. The wording is acceptable.
3. **Nit: `tests/check_pf5s2_billing_browser.ts`, the last DW3 pass check.** Its failure detail prints `posts`, not `posts2`, so a failure would show the wrong list.

No Blocker or Major. Round 1's findings 1 to 4 are fixed. R2-1 is a Minor for the builder to fix or record in `challenge.md`.

**Verdict: Approve** (no open Blocker or Major), for this commit only.

Reviewer: Approve 9ecfd7060062a59f19e5426d281b4c0fa2d202db
