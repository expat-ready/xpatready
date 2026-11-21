# Review: PF-5s part 2, Plan and billing (S6)

PR #2881 (draft) · commit `c73b0f37d2329ac2637a40da4b7565d44b281bc9` · independent reviewer (I did not build it) · 21 Nov 2026. Read: concept `pf-5s-saas/concept.md` r2 (origin/lead-b-front-office) §3 BR-8, BR-9, BR-10, BR-14, §4 S6, §5, §6, §7b B1, M5, M6, m9 (binding); PF-5 part 2 on main (`api/src/platform/billing/account.ts`, `routes.ts`, the fake `BillingPort` in `ports/billing.ts`); `git diff origin/main...c73b0f37d`; `challenge.md` part 2. Walked on my own isolated copy at :4702 (never :4400), PLATFORM_IDENTITY=local, live AI off, US$0. The builder's `check_pf5s2_billing_browser.ts 4702`: **36/36 pass**. The journey test is in this file (the brief allows only this one file): **7.5/10, below the pass mark**.

**Verdict (skill scale): Ship after fixes.** Two Majors, both small and local to `billing-page.tsx`. The split is reasonable: S4 belongs with the trial start, S5 and S8 wait on PF-5 routes that are not built yet, and S7 belongs with the hold guard and Home in part 3. The gaps recorded in challenge.md are accepted: no amount for M6, no marker on the portal return, the Home trial line, S5, and the postal code wording.

## Findings (ranked)
**Major 1 (Must): BR-9 fails when a firm comes back from the card Checkout with a card already on file.** `billing-page.tsx:51` polls only while `cardOnFile !== true`, and `:100` shows "Card saved · Stripe confirmed your card." whenever `cardOnFile` is true. An overdue firm whose declined card is still on file therefore gets no "Checking for changes from Stripe…" line. Step: Admin, record OVERDUE with cardOnFile true, open `/settings/billing?card=saved`, and the record moves to ACTIVE on its 3rd read. Seen: "Card saved / Stripe confirmed your card" appears at once next to the **Payment overdue** chip, the page reads the record only once in 10 s, and the status never changes without a reload. The claim comes from the return link, not from a change in the record (contracts §0.4), and an Admin can conclude the payment failed and pay again. Fix: when the page loads with the marker, keep the first record read and poll until status, cardOnFile or currentPeriodEnd differs from it (or the 60 s limit passes). Add a DW4 case for an overdue firm with a card on file.
**Major 2 (Must): B1, the server's warning is lost on the way to Stripe.** `billing-page.tsx:87-93` calls `toStripe(then)` even when `PUT billing/address` answers with a `next` (from `account.ts:90-92`: "Saved here. We could not update our billing provider yet…", or "Your held invoice could not be released yet…"). The warning notice is set and then the page navigates away at once, so nobody sees it. Step (J4): Admin, no address, press Add a card, save, and the answer is `onStripe:false` plus a `next`. Seen: the page goes straight to `checkout.stripe.com/...`. The Stripe customer then has no address, so the first invoice is taxed without it. That is exactly what binding B1 exists to prevent. Fix: if `next` is present, stay on the page with the warning and leave the Stripe button for the person to press again. Add a test for it.
**Minor 3 (Should): BIC-14 is only partly met.** The status chip and seats tooltips are `title=` attributes (`billing-page.tsx:106, :112`), so they show on hover only. The chip cannot take focus, so keyboard and touch users never reach them. `components/ui/tooltip.tsx` exists for this.
**Minor 4 (Should): Words differ from the concept and the change is not recorded** ("never deviate silently"):
* The chip says "Free trial" where BR-8 says "Trial" (`billing-contract.ts:31`).
* The Admin's button says "Add a card" during a trial, where BR-8 says "Update card or pay" (`:66`).
* The Owner also gets a second card button, which BR-8 does not list.
* Invoice "View" opens a new tab, where BR-14 says the same tab (`billing-page.tsx:35`).

Fix: follow the concept, or record each change in challenge.md.
**Minor 5 (Should): The invoices empty state ignores the status.** `billing-page.tsx:28` always says "Your first one comes when your trial ends." It does so on Active and Payment overdue firms too: J3 screenshot, and Billing / Finance on the seeded Active firm.
**Minor 6 (Should): BIC-13 is only partly met in the address panel.** After a 422, focus stays on the dialog. The summary sits at the bottom, reads "Please check the fields marked above." and names no field (`address-panel.tsx:119, :137`). The field words "This is required." and "This is not one of the allowed choices." come from PF-28's shared rule; challenge.md records only the postal code wording. Fix: move focus to the first field in error, and add the missing-field words to the PF-28 note.
**Minor 7 (Should): Most BR-8 states have no test.** DW1–DW5 cover only TRIAL. Active, Payment overdue, Payment hold (the hold line), Ended and "Cancels on" have no test. If the cancel branch at `billing-contract.ts:57` is deleted, all 36 checks still pass. BR-8 itself shows correctly when I rewrite the record (J5).
**Minor 8 (Should): The PR changes another screen's files.** Commit c73b0f37d regenerates 8 `screens/fo-3-booking/screenshots/fo3st1-*.png` files, which are FO-3's evidence and outside this PR's scope. Revert them.
**Minor 9 (Should): Demo gaps that are not recorded.**
* The seeded sample firm is ACTIVE with no Stripe customer. On it, the Owner's primary button answers "Your free trial has not started yet. Sign in again to finish starting it." (409) on an Active firm (J1).
* The fake adapter returns real-looking `checkout.stripe.com` and `billing.stripe.com` links where concept §6b asks for "Test checkout" and "Test billing page", so the demo lands on dead Stripe pages.

Both belong to PF-5. Record them in challenge.md.
**Minor 10 (Should): Loading states are text, not skeletons** (`billing-page.tsx:27, :65`; EXPERIENCE §4 [M]). Other platform pages do the same, so this is a house pattern.
Note: the test's default port 4700 is outside the screens range 4440–4449 (WAY-OF-WORKING l.18).

## Code (check 5)
* **Authorisation is enforced on the server.** As a Case Officer, GET billing, PUT address, POST checkout and POST portal all answer 403. The page and the menu entry follow the keys (`subscription:pay`, `:update-card`, `:cancel`, `subscription-invoice:view`).
* **No double sends.** A double click sends one PUT (the `busy` guard) and one hand-off (the `leaving` guard).
* **Data is right.** The address is saved once, audited once and upper-cased (H3B 1K9).
* **No per-row requests.** The page makes 2 GETs. `stripeUrl` refuses any hand-off that is not an https stripe.com page, and invoice links are checked the same way.
* All hooks run before the early returns.
* **Removing a rule fails a test:** without B1 (`:84`) DW3 fails; without the M5 next step, DW1 fails for the Case Officer; without the marker-driven checking line, DW4 fails. Without the cancel line, nothing fails (Minor 7).

## D1–D20 (1–5)
D1 3: BR-8, BR-10 and M5 hold, but BR-9 fails for a firm with a card on file (Major 1) and B1 leaks (Major 2) · D2 4: one write per save, audited, the server's postal code rule enforced · D3 4: reuses Panel, Field, Notice and PF-28 · D4 N/A · D5 3: double click and Stripe 503 recover, the slow line shows at 60 s, but a warning is lost on navigation · D6 4: address change audited · D7 N/A (no AI) · D8 5: crumb "My account › Plan and billing" and menu entry · D9 4: one primary per role plus the hint line · D10 3: tooltips by `title`, words differ from the concept, the empty state ignores the status · D11 3: saved and refused notices are visible, but "Card saved" shows with no change in the record · D12 4: calm card, tokens, team components · D13 4: axe clean at 375, 1024 and 1440, keyboard path, 200 % with no sideways scroll; the tooltips do not open on focus · D14 4: platform frame and controls · D15 5: menu to summary in 136 ms · D16 3: 36 checks, but most BR-8 states and Major 1's case have none · D17 simulated only · D18 4: status comes from our record, Sample marked · D19 3: the hand-offs reach Stripe, but S4, S5 and S7 are not built yet (by the split) · D20 simulated only.

## BIC scorecard (concept §4c; steps above, builder's screenshots in `screenshots-part2/`)
| Check | Score | Check | Score |
|---|---|---|---|
| BIC-01 address once | Met (the same value as the profile, B1) | BIC-11 one primary | Met (DW2; J5 all states) |
| BIC-02 fields PF-5 needs | Met (the office shape) | BIC-12 | N/A |
| BIC-03 | N/A | BIC-13 errors on the field and in a summary | Partly (Minor 6) |
| BIC-04 optional and missing | Met ("Not added yet", not an error) | BIC-14 tooltips | Partly (Minor 3) |
| BIC-05/06/07/08 | N/A | BIC-15/16/17 | N/A |
| BIC-09 cancel on Stripe, "Cancels on" | Met (J5 active-cancel) | BIC-18 states | Partly (Major 1, Minors 5 and 10) |
| BIC-10 | N/A | BIC-19 (public pages) | N/A here |
| BIC-20 keyboard, 200 %, 1024 | Met (J7: Tab to the primary, panel, Enter submits) | | |

## Journey test (reviewer role, 21 Nov 2026)
Journeys, run in a browser through the sign-in card and the menu (my script, not committed):
* J1 Owner on the seeded Active firm: menu, then the primary button.
* J2 Owner, trial, no address: Manage plan and billing, the address panel (B1 on the portal path), a double click on Save, the portal, then Back.
* J3 Admin, overdue with a card on file, comes back with `?card=saved`.
* J4 Admin: the save answers with Stripe's address not updated.
* J5 Owner sees Active with a cancel set, Payment overdue, Payment hold for an address, a trial with a cancel set, and Ended.
* J6 Case Officer and Billing / Finance open the page by URL, and the Case Officer calls the API.
* J7 Owner, keyboard only, at 1024 px and at 200 % zoom.
* J8 refused address save.
* Break-it: a 140-character Québec street with accents (shows whole, no sideways scroll at 375 px) and a double click (one write).

What held: B1 on both paths, the roles, the data underneath, keyboard and zoom, speed, look.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J2 and J7 reach Stripe with the address first; Billing / Finance reads invoices |
| Next step obvious | 1 | one filled button and the "Opens Stripe's secure billing page" hint |
| Plain words | ½ | Minors 4, 5, 6; J1's 409 words on an Active firm |
| Feedback and state | ½ | Major 1: "Card saved" with a stale status and no checking line |
| Correct data | 1 | one PUT, one audit row, the server's 403s |
| Error recovery | ½ | Stripe 503 recovers; Major 2; Minor 6 focus |
| Accessibility and sizes | ½ | axe clean, keyboard, 200 %; tooltips by hover only (Minor 3) |
| Speed | 1 | 136 ms |
| Visual quality | 1 | J3 and J7 screenshots: calm, aligned, team controls |
| Trust and sources | ½ | from our record, Sample marked; but "Stripe confirmed" comes from the return link (Major 1) |
| **Total** | **7.5/10** | below the pass mark of 8. Fixing Major 1 lifts feedback and trust; Major 2 lifts recovery; Minor 3 lifts accessibility |

## Could not check
Real Stripe pages (founder's keys, Mac only). A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). `graph.mjs` lists the five billing routes under G3 because it does not parse `staffApi(...)` calls (true of all platform pages), so it shows nothing about this screen.

Verdict: Changes. Majors: 1 (BR-9, `billing-page.tsx:51,:100`), 2 (B1 warning, `billing-page.tsx:87-93`). Minors: 3–10. No Blocker.

Reviewer: Changes c73b0f37d2329ac2637a40da4b7565d44b281bc9

## Round 2 (21 Nov 2026): `git diff c73b0f37d d93712f25` and the new challenge.md section only (P-277)
Ran the builder's check on my own copy at :4702: **48/48 pass**. I also ran my own targeted checks there. I stopped the copy and restored the two PNGs the test had rewritten.
* **Major 1 (BR-9) holds.** `confirmed(first, now)` (`billing-contract.ts`) needs a card that keeps access (trial or active, firm not held), and either a first read that was already good or a record that has moved since that read. `billing-page.tsx` polls until then and removes the marker only once confirmed.
  * New DW4 cases cover overdue with the old card moving to Active (Checking first, then Active) and a hold with a card (Checking stays, no "Card saved").
  * Reverting the fix fails the overdue case.
  * The slow line no longer claims anything about the card.
* **Major 2 (B1) holds.** `saved()` goes on to Stripe only when the answer has no `next`. My check: a warned save stays on `/settings/billing`, shows the warning in a status notice, and focus returns to the button that opened the panel. DW3 now fails if the page navigates.
* **Minor 3 holds.** The chip and seats are focusable Radix tooltips. Tabbing to the chip shows its words, and axe finds nothing with the tooltip open.
* **Minor 5 holds** ("No invoices yet."). **Minor 6 holds:** focus moves to the first refused field and the summary names it ("Please check: Postal code."). **Minor 8 holds:** FO-3's PNGs match main again.
* **Recorded and accepted as written in challenge.md:** Minor 4 (Trial label fixed; the other deviations kept, with reasons), Minor 9 (PF-5's seed and fake adapter), Minor 10 (loading text everywhere on platform pages), shared PF-28 field words, last save wins on `PUT billing/address` (PF-5's route takes no version).
* **Minor 7 mostly holds.** Active, Next billing date, Cancels on (active and trial), Ended, overdue and hold now have tests.
* The breaker's Majors also hold:
  * **A trial set to cancel** asks for no card and shows "Cancels on" the trial end.
  * **A refused hand-off** moves focus to its words.

### New in round 2 (Minors, not blocking)
* **R2-m1 (Should): a passed trial end still gives a future instruction.** `billing-contract.ts:48-55`, `:61`. Scenario: the trial end has passed but Stripe's pause has not landed, so our record still says TRIAL with no card. I reproduced it: "Free trial: ended on 21 Nov 2026. **Add a card before then to keep access.**", and the dates line says "Trial ends 21 Nov 2026". With a card, the line would read "Your first payment is on <past date>". The DW1 "ended on" test checks only the start of the line, so it misses this. Fix: when `past`, drop "before then" (for example "Add a card to keep access.") and write "Trial ended <date>".
* **R2-m2 (Should): the footer Close button discards a typed address without asking.** `address-panel.tsx:49`. Its `onClick={() => onOpenChange(false)}` skips the new `confirmClose`. Escape, the X and the overlay ask "Discard the address you typed?", but Close does not. I reproduced it: typed a city, pressed Close, no question, and on reopening the typed city was gone. Fix: run the same `confirmClose` check in the footer button.

Verdict: Approve. No Blocker or Major is open. Round 1's Majors 1 and 2 are fixed with failing tests. Minors R2-m1 and R2-m2 are new, small, and can go in the same PR or a follow-up.

Reviewer: Approve d93712f25add4452dc49433790da75cb23ff738f
