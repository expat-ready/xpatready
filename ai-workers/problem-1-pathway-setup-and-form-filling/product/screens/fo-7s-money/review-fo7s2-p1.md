# Review: FO-7s2 part 1 (R1.57): Money → Getting paid → Card payments

Independent reviewer (Opus 5.5, did not build it), 26 Nov 2026. Commit reviewed: **`5c61983b6dfbdcbaf3094c7c2649126f0b514f0f`** on `claude/runtime-fo7s2-settings`, PR #3808, against `origin/main...5c61983b6`. Spec read: `concept-settings.md` ("Card payments" table, the non-Owner line, walk step 3); the BACKLOG row FO-7s2 (Getting paid bullet only) and rev 16.36; FO-7c part 1 `card/account.ts`, `card/routes.ts`, `features/client-money-card.ts`; PF-4b `step-up.ts`; PF-6 `staff/step-up.tsx`. Journey report: `journey-test-reviewer-fo7s2-p1-2026-11-26.md`.

**Copies:** the builder's suite on its copy :4762 (`xr_studio_fo7s2`). For my own walk I used a short-lived copy `rvfo7s2` on :4763, fresh database, `PLATFORM_IDENTITY=local`, no Stripe key, AI off, US$0. I stopped it afterwards. I needed it because a parallel session signed in as the same Owner on :4762 during my walk ("You signed in on another device"). I never used :4400.

## Verdict: Ship (Approve). 0 Blocker, 0 Major, 7 Minor (Should). Journey score 8/10 (pass)
* **Suite:** `check_fo7s2_card_browser.ts 4762 xr_studio_fo7s2` passed **35/35 twice** on the same database, in 14 s.
* **Screenshots:** the runs rewrote one screenshot. I restored it, so the PR's `build/fo7s2-*.png` are unchanged.

## Concept fit and the three choices put to me
* **The five states: met.** Each state shows the concept's words exactly, with one next step, and the RESTRICTED state is split on charges (`contract.ts:27-37`).
  * Codes never show (S1 scans the section's text).
  * The break is a `role="alert"`, and Active is not one.
  * The words "No trust card account" never appear.
* **Step-up first (concept: 401 `STEP_UP_REQUIRED` → "Confirm it's you"): met.**
  * The server rule is FO-7c's (`account.ts`: `ready()`, then `requireStepUp`). FO-7c's own check DW1 covers it.
  * The dialog is PF-6's shared one. `check_pf6_staff_browser.ts` tests it against the real server.
  * One POST on a double click, because the button is busy.
  * A foreign address in the answer is not followed (`safeStripeUrl`, https and `stripe.com` only).
* **Choice 1 (S4 stubs the onboarding POST): acceptable.**
  * By design, the copy has no fake rail without a key (`features/client-money-card.ts:26-31`), so the real path stops at 503 before the step-up check.
  * The sign-in again in S4 is real. Only the two onboarding answers are stubbed, and the stubbed 401 has the same `code` the real rule sends.
  * Gap: S4 does not check that the resend carries the new token (m6).
* **Choice 2 (non-Owners see only "Only the Owner manages card payments"): acceptable for part 1, and it must be carried forward.**
  * The concept states this line itself (`concept-settings.md:27`).
  * The "on / off" status comes from a `cardPayments` boolean "in their own reads" (rev 16.36), and no read on main answers it. I grepped `api/src` and found none.
  * The BACKLOG row's check "a non-Owner sees the status and no Connect button" is therefore **not met** by this part. See m5.
  * The server is correct: a forced GET or POST by the Case Manager or Case Officer gets 403.
* **Choice 3 (the step-up dialog's words): not good enough. Minor m1.**
* **Concept walk step 3:** walked as far as Stripe's page, with the stub. On a server with no key, the person gets the honest message "Card payments are not set up on this server yet. Nothing was changed." Nothing is written: 0 audit lines and no account row.

## D1-D20
* D1 Requirement fit, 4: the table and step-up are built as written. The non-Owner on/off line is waiting on a read (m5).
* D2 Data integrity, 5: a refusal writes nothing, and the server lock and idempotent create are FO-7c's.
* D3 Reuse, 5: `staffChange`, `ConfirmItsYou`, Notice and Button; zod at the edge. D4 N/A.
* D5 Stability, 4: the page holds on reload. The `?account=return` line is stale after a reload (m3).
* D6 Governance, 5: the audit line is FO-7c's (`payment_account.onboarding_started`). D7 N/A (no AI).
* D8 Orientation, 4: Money › Getting paid, and the menu item is marked active. D9 Flow, 5: one button per state.
* D10 Language, 3: m1, m4, m3. D11 Feedback, 3: m3, m4.
* D12 Visual, 4: team card and tokens. D13 Access, 3: axe 0 at 375, 1024, 1440 and 200 %; focus is lost twice (m2). D14 Team look, 4.
* D15 Speed, 5: the status words appear about 20 ms after navigation, on one GET.
* D16 Testability, 3: each line has a pass and a fail, but see m6 and m7. D17 simulated only.
* D18 Provenance, 5: "Money goes to your own Stripe account", and only Stripe addresses are followed. D19 N/A. D20 simulated only.

## BIC scorecard (EXPERIENCE §6)
| Check | Score | Evidence |
|---|---|---|
| BIC-11 One primary | Met | `fo7s2-card-*-1440.png`: one filled button per state, none when Active |
| BIC-13 Errors | Partly | refusals are in words (S3, foreign URL); a failed status read shows "Internal Server Error" with no fix (m4) |
| BIC-18 States | Partly | every status, read-only, refused and error state is drawn; loading is the text "Loading card payments…" (no skeleton); the back-from-Stripe line goes stale (m3) |
| BIC-19 Cognitive load | Met | one h1, one h2, one primary button |
| BIC-20 Keyboard / zoom | Partly | the keyboard reaches Connect in 11 Tabs, with no sideways scroll at 1024 px or 200 % (my `rv-zoom200`); focus drops to `body` after Connect and after the dialog closes (m2) |
| BIC-01-10, 12, 14-17 | N/A | no questions, documents, AI, applications, tooltips, filing or review |

## Issues, ranked (all Should; none blocks)
* **m1. The dialog contradicts itself, and "Confirm it's you" appears three times.** `section.tsx:30` passes the concept's "Confirm it's you: sign in again, then try once more." as the body. The shared description underneath says "After you sign in, the change is sent once more for you." The person is told both to retry and that nothing more is needed (`fo7s2-card-step-up-1440.png`).
  * **Fix:** pass a body that matches what happens, e.g. "Sign in again. Stripe's set-up page then opens by itself.", and add a `challenge.md` note that the concept's sentence assumed a manual retry.
  * **Fail test:** in S4, assert the dialog text does not contain both "try once more" and "sent once more".
* **m2. Focus is lost (WCAG 2.4.3).** Connect sets `busy` (`section.tsx:24`), which disables the focused button. After the refusal, after Escape and after Cancel, `document.activeElement` is `body`, so a keyboard user starts again from the top.
  * **Fix:** return focus to `[data-card-step]` when the request ends or the dialog closes, or keep it focusable with `aria-disabled`.
  * **Fail test:** press Enter on Connect, wait for `[data-card-refused]`, then assert the active element is `[data-card-step]`. Do the same after pressing Escape in the dialog.
* **m3. The back-from-Stripe line goes stale, and its promise is not kept.** `?account=return` stays in the URL. After the account became Active and I reloaded, the page still said "Back from Stripe… Stripe now checks your details; this page shows the result when Stripe tells us." directly above "Clients can pay invoices by card" (my `rv-return-active.png`). The page never re-reads by itself: `refetchOnWindowFocus: false` in `lib/api.ts:46`, and there is no poll (`contract.ts:41`, `section.tsx:18,47`).
  * **Fix:** clear the parameter once it has been shown (`setSearchParams` with replace), and say "Reload this page to see the result", or re-read on focus.
  * **Fail test:** open `?account=return` while ACTIVE and assert there is no `[data-card-back]` after a reload.
* **m4. A failed status read shows the server's raw title.** A 500 gave "Could not load card payments / Internal Server Error", with no fix and no retry (`section.tsx:48` uses `q.error.message`, which falls back to `problem.title`). This misses EXPERIENCE §4's error state ("with the fix").
  * **Fix:** "Card payments could not be loaded. Nothing was changed. Try again", with a Try again button that calls `q.refetch`.
  * **Fail test:** route the GET to a 500 and assert the words have no "Internal Server Error" and that a Try again button is present.
* **m5. The non-Owner on/off line is open.** The concept's "Card payments: on / off" and the BACKLOG check "a non-Owner sees the status" are not met (`section.tsx:38-41`). S2 (`check_fo7s2_card_browser.ts:99`) asserts the interim line instead.
  * **Fix:** keep Question 1 open, and once the tech lead answers, add the check to part 2's row in BACKLOG so it is not left only in the PR body.
  * **Fail test:** in part 2, a Case Officer sees "Card payments: off" or "on", and no button.
* **m6. The API change and the resend are untested.** No test checks that FO-7c's return and refresh addresses and the break email's link now point to `/money/settings/getting-paid` (`account.ts:88,178`). The fake rail does not record `AccountLinkInput`, and `check_fo7c` does not read the mail text. S4 counts the calls (`:115,133`) but not the token sent on the resend.
  * **Fail tests:**
    * In `check_fo7c`, capture `accountLink`'s input and assert `returnUrl === appUrl + "/money/settings/getting-paid?account=return"`. Assert the break email contains the same path.
    * In S4, record `authorization` per call and assert that call 2's token is the new `xr-staff-session` token and differs from call 1's.
* **m7. Walk step 3 depends on a row no screen writes.** The Sample seed has no `money_payment_settings` row (0 on my fresh copy), and the suite inserts one (`check_fo7s2_card_browser.ts:49`). With a Stripe key, a fresh firm's Connect answers "Set up payments first…", and Getting paid has nowhere to do that (gap G1, FO-7s1 part 3).
  * **Fix (for the tech lead, not this PR):** record the dependency in STATE or the FO-7s1 part 3 row.
  * **Fail test (once G1 lands):** a fresh firm saves its operating details on this page, and Connect then reaches Stripe without any seed SQL.
* **Note (not counted):** `safeStripeUrl` also accepts `*.fake-rail.example` in the shipped bundle (`contract.ts:55`). `.example` is reserved (RFC 2606) and cannot resolve, so this is harmless. The page title "Product Studio" is the platform frame's.

## Code checks
* **Server authorisation:** both routes take `agent/payment-rail:connect`, and the firm comes from the session. Non-Owners get 403. No per-row requests: one GET per view. No migration.
* **Concurrency:** a double click sends 1 POST; FO-7c holds the per-firm lock and the idempotent create.
* **Rule removal:**
  * If the Owner gate is removed, S2's words fail, because a 403 error appears instead.
  * If `safeStripeUrl` is removed, S4's foreign-site line fails.
  * If the STEP_UP branch is removed, there is no dialog and S4 fails.
  * If any state's words leak a code, the S1 regex fails.
* **Graph:** `graph.mjs --check` gave G1 0, G2 0, G3 318, G4 0, G5 0, G6 26. It lists `POST …/payment-account/onboarding` as "no test reaches", and the suite names no capability (`caps: []`). The page calls the route through the `ONBOARDING_PATH` constant, which the tool does not resolve, as in earlier money reviews. This is a limit of the tool; there is no PR finding beyond m6.

## Could not check
* Real Stripe onboarding, which needs a test key.
* The real server's 401 → sign in → resend for this route in a browser (covered by its parts: FO-7c DW1 and the PF-6 browser check).
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* CI on 5c61983b6.

Reviewer: Approve 5c61983b6dfbdcbaf3094c7c2649126f0b514f0f
