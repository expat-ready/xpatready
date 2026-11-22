# PF-5s part 2 (S6 Plan and billing): break report (PR #2881, head c73b0f37d)

Breaker (Opus 5.5), 21 Nov 2026. Isolated copy `brk_pf5s2` on :4703 (`PLATFORM_IDENTITY=local`, fake BillingPort), stopped at the end (database dropped). Real Chromium (Playwright) and fetch against the real routes; psql on the copy's database for states (trial dates, hold, `cus_brk`); `GET billing` answers rewritten only for what the fake cannot reach (card on file, cancel at period end, Stripe down, seat limit null, since `seats_limit` is NOT NULL). Stripe pages were intercepted. One Chromium speculative connection to checkout.stripe.com was refused by the sandbox proxy in one run (the page itself was fulfilled locally). Later runs used `--no-proxy-server` plus host-resolver rules. No request reached Stripe. No code edited, nothing committed. Scope: concept `pf-5s-saas` r2 S6, BR-8 to BR-10, BR-14, §7b B1, M5, M6. Line numbers refer to files under `web/src/modules/platform/saas/`, unless the line names an API file.

**Blockers: none. Majors: 4. Minors: 13.**

## Attempts that held
| # | Attempt | Result |
|---|---|---|
| H1 | Every route as each role (fetch) | Owner 200 on all five routes. Admin: 403 on portal only. Billing / Finance: 200 on invoices, 403 on the rest. Case Officer: 403 on all. No token: 401. The UI matches: no portal button for Admin, invoices only for Billing / Finance. |
| H2 | Double-click Add a card (with checkout slowed by 400 ms); double-click Save address, also after a 422; double-click Save and continue to Stripe; Enter pressed twice in a field | Each sends 1 POST or 1 PUT, adds 1 audit row and makes 1 Stripe hand-off. |
| H3 | Back from Stripe (intercepted) to the page | Buttons are enabled and not busy. No stuck spinner. |
| H4 | Address input: French/CJK/Arabic, ZWJ, emoji, `<img onerror>`; control char, U+202E, newline, 151 characters, blank, `ZZ` province, extra `country`, number instead of text, 2 MB body | Good text is saved and shown escaped. Bad input gets a 422 on the field ("This is too long: at most 150 characters." on Street name), nothing saved. The 2 MB body gets a 413. `m5v1a1` is saved as `M5V1A1`. |
| H5 | Firm on PAYMENT_HOLD (with hold event): Owner, Admin, Billing / Finance | The page loads, with 0 × 402. "Payment hold" chip and "On hold since 19 Nov 2026 (payment needed)… kept until 17 Feb 2027". The card hand-off works on hold. The menu entry stays. Billing / Finance sees invoices only. |
| H6 | `?card=saved`, record never moves | It polls every 3 s (4 GETs in 10 s) and stops at 60 s. It then shows the slow words; the marker stays until the record moves. |
| H7 | Hostile invoice links (`https://invoice.stripe.com@evil.example/x`, `https://evil.example/?x=.stripe.com`) | Not rendered as links. Forged hand-off URLs are already refused by `stripeUrl` (DW4). |
| H8 | 375, 1024, 200 % (640 css px at DSF 2), 400 % (320 css px), with sample data | No sideways scroll. The panel's Save button stays visible in its pinned footer. |
| H9 | Keyboard only | Tab order: header, menu, Manage plan and billing, Add a card, Edit. The panel opens on Unit. Escape or Save puts focus back on Edit. |
| H10 | Seat limit null; trial end null; ENDED subscription with firm on hold | "5 seats used". No trial line and no dates line. "Ended" chip with the hold line. |

## Findings
**M1 (Major, B1) The page goes on to Stripe after the server says Stripe did not get the address.**
- Steps: no address. Add a card, fill the panel, save. The PUT answers `{"saved":true,"onStripe":false,"next":"Saved here. We could not update our billing provider yet…"}`.
- Expected: B1 puts the address on the Stripe customer before any card or payment, so the first invoice is taxed. With `onStripe:false` the page should stay put and ask the person to try again.
- Actual: the page still hands off to `checkout.stripe.com/c/pay/cs_setup_cus_brk`. The warning flashes behind the navigation. With a draft invoice that needs the address, PF-5's webhook then puts the firm on hold for "business address needed".
- Where: `billing-page.tsx:87-92` (`saved()` calls `toStripe` whatever `next` says), `address-panel.tsx:31`.

**M2 (Major, BR-9) A held firm back from Checkout is told "Card saved" while the record is still on hold, and the page stops checking.**
- Steps: firm on PAYMENT_HOLD after a declined payment, so a card is already on file (`cardOnFile:true`). Update card or pay, then return to `?card=saved`.
- Expected: "Checking for changes from Stripe…" until the record moves (the hold lifts), then the new state.
- Actual: on the first read the page shows "Card saved. Stripe confirmed your card." next to a "Payment hold" chip and the hold line. It makes 1 GET in 8 s, never polls again, and drops the marker. Nothing has moved, yet the page claims it has.
- Where: `billing-page.tsx:51`, `:55`, `:100`. The only signal for "the record moved" is `cardOnFile`.

**M3 (Major, BR-8, M6) When a trial is set to cancel, the trial line promises a payment or gives a next step that cannot keep access.**
- Steps: TRIAL with `cancelAtPeriodEnd:true`.
- Actual, case 1 (card on file, `currentPeriodEnd` null): "Card saved. Your first payment is on 30 Nov 2026." and no "Cancels on" line.
- Actual, case 2 (no card, period end set, as the webhook stores it for a trialing subscription): "Free trial: 9 days left… Add a card before then to keep access." next to "Cancels on 30 Nov 2026".
- Expected: no payment promise and no "keep access" step while the subscription is set to cancel. "Cancels on <date>" should show (BR-8).
- Where: `billing-contract.ts:46-60` (`trialLine` never reads `cancelAtPeriodEnd`; `datesLine` needs `currentPeriodEnd`).

**M4 (Major, WCAG 2.4.3, BR-14) Focus falls to the page after any refused hand-off.**
- Steps: keyboard Enter on Add a card with checkout answering 503, or Manage plan and billing on a firm with no Stripe customer (409), or Save and continue followed by a 503.
- Expected: focus stays on the button or moves to the error.
- Actual: `document.activeElement` is BODY (both buttons are disabled while focused). The next Tab lands on Edit, past the error and the button.
- Where: `billing-page.tsx:95-96` (`disabled={!!leaving}`), `:77-80`.

**m1 (Minor, BR-10)** With the trial end 3 days past and the record still TRIAL, the page reads "Free trial: ends today (18 Nov 2026). Add a card before then to keep access." The line should give no "today" and no "before then" for a past date. Where: `billing-contract.ts:42`, `:50`.

**m2 (Minor, BR-9)** The slow words "Your card is saved at Stripe; refresh in a minute." come from the return link alone. They show for a typed `?card=saved` and when Stripe is unreachable (`cardOnFile:null`, `billingAvailable:false`); in that case the page also polls for 60 s for a value that cannot come. Where: `billing-contract.ts:84`, `billing-page.tsx:51-53`.

**m3 (Minor, STANDARDS §3 [M] optimistic concurrency)** Two sessions saving the address: the Owner opens the panel, an Admin saves "999 Admin Avenue, Vancouver BC", then the Owner saves the stale form plus a unit. The answer is 200 and the stored address is Toronto again; the Admin's value is lost without a word and the tax province changes. The PUT has no version. The route is PF-5 part 2's (`account.ts:76-84`), so the panel has nothing to send.

**m4 (Minor)** On a 422 the focus stays on the panel container, not on the first marked field. The City field reads the raw "no control characters". Where: `address-panel.tsx:33`; wording in `account.ts:23`.

**m5 (Minor)** Escape, the overlay or the X throws away a typed address without asking, although Panel supports `confirmClose`. Where: `address-panel.tsx:38`.

**m6 (Minor, very long text)** A saved 150-character unbroken street name and a 100-character city cause 820 px of sideways scroll at 375 px and 387 px at 1024. The address paragraph has no `break-words`. Where: `billing-page.tsx:129`.

**m7 (Minor)** The empty invoices line "No invoices yet. Your first one comes when your trial ends." shows for Active, Payment hold and Ended firms too. Where: `billing-page.tsx:28`.

**m8 (Minor)** One invoice with a currency that Intl refuses (`C$`) throws `RangeError` and blanks the whole page, summary included (no error boundary). Invalid `createdAt` shows "Invalid Date". A null `number` reads "Draft" on an uncollectible invoice. Stripe data makes these unlikely. Where: `billing-page.tsx:33`, `billing-contract.ts:74`.

**m9 (Minor, copy)** The 503 error says "try again" twice: "We couldn't open Stripe. Try again. We could not reach our billing provider. Try again in a few minutes." Where: `billing-page.tsx:78`.

**m10 (Minor, cross-part)** The Sample firm (ACTIVE, no Stripe customer, as seeded) gets "Your free trial has not started yet. Sign in again to finish starting it." when it presses Manage plan and billing. The page shows the 409's words as they come (`account.ts:104`, `billing-page.tsx:78`).

**m11 (Minor, BR-9 "portal or Checkout", cross-part)** The portal's return address carries no marker (`account.ts:106`), and the page only reads `?card=saved`. An Owner back from the portal never sees "Checking for changes from Stripe…".

**m12 (Minor, M6)** The card-on-file line reads "Card saved. Your first payment is on 30 Nov 2026." M6's wording also names the amount ("First payment of $149 + tax on…"). Where: `billing-contract.ts:49`.

**m13 (Minor, screen readers, not checked with a real reader)** "Checking for changes from Stripe…" mounts as a new `role=status` that already holds its text, in place of the loading line, so many readers will not announce it. The status chip's explanation and the seats definition exist only as `title` attributes, which keyboard and touch users cannot reach. Where: `billing-page.tsx:100-101`, `:106`, `:112`.

Verdict: Changes

## Round 2 (head d93712f25, only `git diff c73b0f37d d93712f25`)
Same copy and method (`brk_pf5s2` on :4703, fresh database, stopped at the end). Requests stayed on localhost (`--no-proxy-server`, host-resolver rules); no PNG was rewritten. m3, m4, m10, m11 and m12 are recorded in `challenge.md` and were not re-tested. **Blockers: none. Majors: none. Minors: 3.**

**Held:**
- **M1:** a save that comes back with a warning (`onStripe:false`) stays on the page. The warning shows, nothing goes to Stripe, and focus returns to Add a card.
- **M2:** a firm on hold with a card on file and a record that never moves keeps "Checking…" (3 reads in 7 s) and `?card=saved`. When the record moves to Active on the third read: "Card saved", Active chip, marker removed. An overdue firm whose record stays Overdue gets the new slow words after 61 s.
- **M3:** a trial set to cancel (no card, a card, or card unknown) reads "…set to cancel then, so no payment will be taken." with "Cancels on 30 Nov 2026", including when `currentPeriodEnd` is null.
- **M4:** a 503, a 409, a forged hand-off URL, and Save and continue with a fast 503 all move focus to the error box; Shift+Tab goes back to the button. One "Try again" each (m9).
- **m2, m7:** the slow words no longer claim the card is saved; the empty line reads "No invoices yet.".
- **m5:** Escape and X now ask "Discard the address you typed?". Cancel keeps the panel; OK closes it and focus goes to Edit.
- **m6, m8:** a 150-character street, 100-character city and 80-character invoice number cause no sideways scroll at 375 or 1024. Currency `C$` shows "149.00 C$", a bad date "date not known", a null number "No number"; no page error.
- **m13:** Tab reaches the status chip and the seats line, each opens its tooltip, and Escape hides it.
- **422 and axe:** the panel says "Please check: Street name, Postal code." and focus lands on Street name; a 403 shows the server's words. axe (WCAG 2.2 AA, 1440 and 375, error box and a tooltip open): 0 violations.

**R2-m1 (Minor, round 1 m1 only partly fixed): a past trial end still gets future words.** With the record still TRIAL and the end 3 days past: no card reads "Free trial: ended on 18 Nov 2026. Add a card before then to keep access."; a card on file reads "Card saved. Your first payment is on 18 Nov 2026." `billing-contract.ts:52`, `:54` (only `left` at `:49` knows `past`).

**R2-m2 (Minor, round 1 m5 only partly fixed): the footer's Close button throws away a typed address without asking.** It calls `onOpenChange(false)` directly, so it skips `confirmClose`; Escape and X do ask. `address-panel.tsx:49`.

**R2-m3 (Minor, B1 after M1's fix): pressing the button again after the warning goes to Stripe without retrying the address update.** The address is on our record now, so the panel does not open, and the Stripe customer still has no address. The warning says "save it again in a few minutes", but nothing makes that happen first. PF-5's webhook still holds a draft invoice that needs the address. `billing-page.tsx:89-101`.

Not findings (design): a typed `?card=saved` on a trial whose record already shows a card says "Card saved. Stripe confirmed your card." at once (`confirmed()` treats a good first read as "the webhook was first"); an overdue firm that only changes its card gets the slow words.

Verdict: Approve
