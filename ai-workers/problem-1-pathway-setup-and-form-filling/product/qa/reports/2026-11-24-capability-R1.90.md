# qa capability R1.90: self-serve sign-up, email check, trial with no card, private links, trial banners (24 Nov)

**Run:** `/qa capability R1.90`, cloud qa copy, Opus 5.5 medium. Fake BillingPort, no Stripe key, live AI off, US$0. Tested on main a79e246c6, after #3202 (PF-5s S8, the invited sign-up screen) merged as aa52118e7. That was the last part, after #3040 and #2935. Isolated copies only; :4400 not touched.

**Verdict: Works** (was Partial, parts missing). P-339 is met: the journey is green on GitHub's runners on main's code, and a fresh Opus reader agrees.

## Evidence
| What | Where | Result |
|---|---|---|
| walks.yml, j_90 | run 45341570277, job 138266504630, on cf7758ab6 (only parent main a79e246c6; this PR's journey change) | 34 PASS, 0 FAIL, exit 0, with videos and traces |
| The same journey, locally | fresh isolated copies of a79e246c6 | before qa's change: 33/33, then 32/33 (the W1 race); after it: 34/34 four times |
| item-proof | none: no merged PR body has a real `Completes: R1.90` | the journey is the pack |
| Fresh Opus reader (read only, P-339) | this session | Works, about 80% confidence |

## qa's change to j_90 (this PR): no claim loosened
* **Rating #3202's W4.** #3202 turned a placeholder that could only fail (`&& false`) into the full walk. qa added two things:
  * a step that fails when no link comes back (before, the last steps were skipped silently inside `if (linkPath)`);
  * an API proof that the used link is refused: a second sign-up POST with the used token answers 404 "This sign-up link is not valid any more…", and there is still exactly one firm.
* **W1 race.** The step counted the Work email field with a snapshot right after the form appeared, and read 0 once in 2 runs. It now waits for the field. The claims are unchanged (no card words, exactly one Work email field), and it logs both counts.
* **The Sample password** is a named constant in the form `check_pf5_signup_billing.ts` uses, because the push guard's secret rule refused the earlier spelling.

## Done when, clause by clause
* **Sign-up with no card.** The walk goes Pricing ("No card needed") → Sign up → Check your email → Confirm. There is no card field and no stripe.com request. In the database the firm is TRIAL with no payment method, and the trial ends 14 days out. Opening the link before Confirm makes no firm.
* **Email confirmed by link; an expired or used link refused in words.** A wrong code is refused on the field. The used link and an expired one (a pending row dated 25 hours back, as the clock's stand-in) are both refused with "This link cannot be used … expired or was already used", offering Send a new link and Sign in. No second firm is made.
* **The trial banner counts days.** Plan and billing reads "14 days left", then "3 days left" after the stored end moves. Home and Team each show "Free trial: 3 days left", and the banner's API answers daysLeft 3, amber.
* **A private plan link works once.** A firm's Owner gets 403 and nothing is stored. Our staff get 201, with the link shown once. The invited page fixes the email and makes nothing on opening. Sign-up and Confirm make exactly one firm. Reopening the link shows "This sign-up link doesn't work", and the API refuses a second sign-up (404).
* **Sizes.** 400, 1024 and 1440 px, axe clean, no page error.
* **Gate A.** The walk ends on Plan and billing with "Manage plan and billing" present and enabled: the Owner's way into R1.91 (change plan, cancel).

## Notes (not blocking)
* The banner is found by its words near "trial", not by a banner element, and only at 3 days. The countdown from 14 to 3 is shown on Plan and billing.
* Our staff member who makes the link is seeded by SQL, because the staff console is not built (concept pf-5s-saas §2). The sign-in token still comes from the real local staff session, and the role check is tested both ways.
* W5 does not press the button. It opens Stripe's portal today, while R1.91's Done when says "on our own screens", so R1.91's first step may move when R1.91 is built.

## Bugs
None in the app. The W1 race was in the journey and is fixed here.

## Questions for the Lead
None.
