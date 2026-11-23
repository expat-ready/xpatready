# PF-16 trial banner: independent review (PR #2935)

Reviewed head `05067ca66d335288dae123ee9433840b35b97c34` against `origin/main`. I did not build this part. I judged it against the PF-16 row (BACKLOG line 386, the banner clause only), the existing Plan and billing trial line (`web/src/modules/platform/saas/billing-contract.ts` `trialLine`), the platform card `api/src/platform/MODULE.md`, the web card `web/src/MODULE.md`, STANDARDS and EXPERIENCE. There is no concept folder for this part. Plan changes, "Start my subscription now" and emails are out of scope and were not judged.

**Verdict: Block** (skill scale: Ship after fixes; per the reviewer brief, an open Major blocks). There are two Majors, both in the banner's words, and both are small fixes. The read, the permissions, firm scoping, the frame mount and accessibility hold.

## What I ran (isolated copies on runtime ports 4433 and 4434; never :4400)
* `check_pf16_banner_browser.ts` passed **21/21 twice** (exit 0, about 20 s each run).
* qa's `j_90.ts` (from `origin/claude/compassionate-babbage-1v6qyi`, run from a scratch copy so nothing was written to the repository) scored **29/32**. All five W3 steps passed: the banner counts days on Home and Team, and the read gives `daysLeft 3`, `tone amber`. The 3 failures are W4 (private link: PF-5/PF-5s, another part). This matches the builder's report.
* I ran my own probes on the copy, setting the stored state with SQL: a trial end in the past with the status still TRIAL; ACTIVE with the trial end kept; 5 hours left; keyboard Tab order; 512 px (200 % zoom at 1024); the role of the banner. Screenshots are in the scratchpad (paths in the hand-back), not committed.
* Graph (`graph.mjs`): `GET /platform/billing/banner` is listed under G3 with `testedBy: []`. The check reaches it with `fetch`, not `call()`, and it cites no capability id.

## Findings

### Major
**M1: the banner says "ends today" with a date that has passed, and asks for a card "before then". Plan and billing, directly under it, says the trial ended.**
* Cause: `web/src/modules/platform/trial-banner.tsx:23` maps `daysLeft === 0` to `Free trial: ends today (${end}).`, and the server clamps every passed end to 0 (`api/src/platform/billing/banner.ts:22`). Because a part day counts as a day, 0 only ever means "already past": with 5 hours left the read gives `daysLeft 1` (probe P3). So the "ends today" wording only appears once the trial has passed, and then it is always wrong.
* The comments at `banner.ts:7` and `:21` ("0 on the last day") describe this wrongly.
* Reproduction: status TRIAL, `trial_ends_at = now() - 2 days` (the record not yet moved by Stripe's event; with the fake port in lanes and the demo, nothing ever moves it).
  * Read: `{"show":true,"daysLeft":0,"tone":"amber",...}`
  * Banner: "Free trial: ends today (20 Nov 2026). Add a card before then to keep access." (today is 22 Nov)
  * Page: "Free trial: ended on 20 Nov 2026."
  * Screenshot: `probe-past-end-1024.png`.
* `trialLine` fixed exactly this case (its R2-m1 comment: "nothing is said as if it were ahead") and drops the card sentence once the end has passed.
* Fix: return the stored end's passed state (or `ended: true`) from the read. Build the words with `trialLine`'s rule: "ended on <date>", and no "before then" sentence.
* Test it with a pass/fail pair: an end 2 days ago gives "ended on", never "ends today".

**M2: a trial set to cancel is told to add a card, or is promised a payment that will not be taken.**
* `banner.ts:28-33` never reads `cancelAtPeriodEnd`, although `BillingPort.subscription()` returns it (`stripe.ts:39`). Cancel stays in the Customer Portal (row text: "card, invoices and cancel stay there"), so an Owner can reach this state during a trial.
* The banner then says "Card saved: your first payment is taken when the trial ends." (card on file) or "Add a card before then to keep access." (no card).
* Plan and billing on the same page says "Your subscription is set to cancel then, so no payment will be taken." (`trialLine`, break M3).
* This is a false money statement in the app's own frame.
* Fix: pass `cancelAtPeriodEnd` through the read (null when Stripe cannot be reached) and use `trialLine`'s cancel sentence. The simplest route is one shared words function for the line and the banner, so they cannot drift again.
* Test it with a pass and a fail on the fake port.

### Minor
* **m1: the test does not prove the "not in a trial" rule.**
  * B3 sets `status = 'ACTIVE'` **and** `trial_ends_at = null` (`tests/check_pf16_banner_browser.ts:105`). Removing `sub.status !== "TRIAL"` (`banner.ts:30`) would still pass, because `!sub.trialEndsAt` alone gives `show: false`.
  * A converted firm keeps its trial end (`webhook.ts:148`: `snap.trialEnd ?? row.trialEndsAt`). Probe P2 shows the code is right today, but nothing guards it.
  * Fix: keep `trial_ends_at` set (for example 5 days ago) in B3.
* **m2: after "Add a card" succeeds, the banner can lag behind the page.** On return, Plan and billing polls every 3 s until the card is confirmed (`billing-page.tsx:56`). The banner's query (`trial-banner.tsx:29`, `staleTime 60 s`) is not refreshed, so "Add a card before then" can sit above "Card saved" for up to a minute. Fix: invalidate `["pf","billing-banner"]` where the billing page confirms the card (`billing-page.tsx:104`).
* **m3: untested paths.** `cardOnFile: true` ("Card saved…"), `cardOnFile: null` (Stripe unreachable: no card claim) and a reader without `update-card` have no check. All three are short words branches in `trial-banner.tsx:24,32`.
* **m4: placement on Home.**
  * On Home the banner sits under the demo "Release 1 screens" card (the `intro` slot renders first, `frame.tsx:98-99`), not at the top of the page.
  * It is also wider than Home's centred column (`b2-home-3-days-amber-1440.png`).
  * On Team and Plan and billing it sits at the top.
  * Fix: mount it above `{intro}`, so the product's own notice comes before demo chrome (P-35 spirit).
* **m5: graph (P-86).** Route G3 has `testedBy: []` and the test names no `C` capability id. Calling the read through the shared `call("GET", "/api/platform/billing/banner")` helper, or adding the C-id the row proves, would close it.

## What holds (with evidence)
* **Permissions**
  * The server: `@PermissionKeys("agent/subscription:pay")`. Only OWNER and ADMIN hold it (pf3 migration lines 1130-1131).
  * Case Officer: 403 (B4). Admin: 200.
  * The web gate: the page never asks without the key (B4: `asked 0`).
  * `@HoldOpen` is right: billing is reachable on hold.
* **Firm scope:** `firmScope(s.firmId, …)` is the only query (`banner.ts:29`) and runs under PF-12's walls. It writes nothing and makes no Stripe call from the browser (B5 final line). The server only reads `BillingPort.subscription` when a Stripe subscription exists.
* **Web card:**
  * The page calls the API through `staffApi`, and the query key starts with `"pf"`, so a change of person drops it.
  * The banner is mounted once, in PF-6's frame, after the terms gate: the frame diff is the import plus one line.
  * Front-office pages share `PlatformFrame`.
  * The row files are in `MODULE.rows/PF-16t.md`, with no frozen line edited.
* **Days rule:** the same `ceil` rule as `billing-contract.ts:42`. 2.5 days reads 3; amber at 3 days or fewer and neutral at 4 (B1 edge).
* **Accessibility:** axe WCAG 2.2 A/AA shows 0 violations at 400/1024/1440 in both tones, with no sideways scroll.
  * At 512 px (200 % zoom at 1024): no sideways scroll.
  * `role="status"` (polite, not alert).
  * The "Add a card" link is keyboard-reachable with a visible focus ring.
  * Amber is not the only cue: the text carries the days.

## D1-D20 (this part only)
D1 Requirement fit ½ (the row's lines met; M1/M2 words wrong in two real states) · D2 Data integrity 1 (read only, nothing written) · D3 Reuse ½ (reuses `day`, but repeats `trialLine`'s rule, and that copy is where M1/M2 drift came from) · D4 Rule integrity N/A · D5 Stability 1 (a failed read shows nothing; Stripe down gives null, never guessed) · D6 Freshness N/A · D7 AI trust N/A · D8 Orientation 1 · D9 Flow 1 ("Add a card" goes to Plan and billing, B2) · D10 Language ½ (M1, M2) · D11 Feedback and state ½ (m2) · D12 Visual quality ½ (m4) · D13 Accessibility 1 · D14 Team look 1 (team `Notice` tones) · D15 Speed 1 (one small read, 60 s cache, no per-row request) · D16 Testability ½ (pairs present; m1, m3) · D17 simulated only · D18 Provenance 1 (from the stored trial end, wording marked Sample in code) · D19 End-to-end ½ (R1.90 W3 passes; W4 is another part) · D20 simulated only.

## BIC-01-BIC-20 (EXPERIENCE §6)
N/A: §6 scopes case-side screens, and this is the platform frame's billing notice.

## Journey score (reviewer, the one score for this check)
**7.5 / 10: below the 8 pass line, no criterion at 0.** Details are in `journey-test-reviewer-2026-11-22.md`. Fixing M1 and M2 lifts plain words, correct data and trust to 1.

## Could not check
* A real screen reader.
* An intended user's unaided walk (D17/D20 stay with the founder).
* The cancel-at-period-end state in a browser: the fake port's subscription was not set to cancel, so M2 is shown from code (`banner.ts:28-33` against `billing-contract.ts:51-52`).
* A live Stripe call (US$0 by rule).

## To fix before Approve
1. M1: say "ended on <date>" (no card ask) when the stored end has passed. Correct the "0 on the last day" comments. Add a pass/fail pair.
2. M2: carry `cancelAtPeriodEnd` and use `trialLine`'s cancel words. Add a pass/fail pair.

Minors m1-m5 should land with the fixes, but they do not block.

Verdict: Block

Reviewer: Block 05067ca66d335288dae123ee9433840b35b97c34

## Round 2: head `4bbdc547fcd0aac379505fc00421f2a02dba2816` (diff since `05067ca66` only)

### What I re-ran
I ran these on an isolated copy `rev2_pf16b` on :4435 (never :4400), and stopped it afterwards.

* The check passed **29/29 twice** (exit 0).
* qa's `j_90` scored **29/32**. All 5 W3 steps passed; W4 (private link) belongs to another part.
* My round 1 probes, re-run at 1440 px:
  * **P1** (end two days ago, status still TRIAL): the read gives `daysLeft 0, tone amber`. The banner says "Free trial: ended on 20 Nov 2026.", the same as the page, with no card ask.
  * **P2** (ACTIVE with a kept trial end): `show:false`.
  * **P3** (5 hours left): `daysLeft 1`.
  * At 512 px there is no sideways scroll, and the banner is `role=status`.
  * "Add a card" is now the first stop after the menu and breadcrumb (Tab 14, was 31).

The check rewrites its screenshots on each run, so I restored the committed ones; the copies under `screenshots-banner/` were not changed by me.

### Round 1 findings
* **M1: closed.**
  * The banner's words now come from `trialLine` (`trial-banner.tsx` `bannerWords`). A passed end reads "ended on <date>" with no card ask.
  * The "0 on the last day" comments in `banner.ts` are corrected.
  * The pass/fail pair is B6, with screenshot `b6-home-ended-1440.png`.
* **M2: closed.**
  * The read passes on `cancelAtPeriodEnd`, which is null when Stripe cannot be reached (`banner.ts:36`).
  * On screen, a trial set to cancel reads "…set to cancel then, so no payment will be taken.", with no "Card saved" and no "Add a card".
  * B7 covers this both on the read (through a stub BillingPort) and on screen.
* **m1: closed.** B3 now keeps a trial end on the ACTIVE row, so removing `sub.status !== "TRIAL"` would fail.
* **m3: closed.** Card saved, Stripe down and set to cancel each have a check in B7.
* **m4: closed for placement.** The banner is first in the content, above the demo "Release 1 screens" card (`b2-home-3-days-amber-1440.png`, `b5-home-amber-400.png`). Its width on Home remains a Minor, as the builder listed.
* **m2 and m5: open as Minors**, as the builder listed: the banner's 60 s cache is not refreshed when the card is confirmed, and the graph tool shows the route as untested.

### The builder's other changes
* **Held firm** (breaker m3): `show:false` when the firm is PAYMENT_HOLD.
  * The new `platformFirm.findUnique({ where: { id: s.firmId } })` reads by the caller's own id, the same way as `account.ts` `view` and `routes.ts` `PaymentHoldGate`, under PF-12's walls.
  * There is a pass/fail pair: on hold gives `show:false`; the hold lifted gives the banner.
* **No link to the page you are on** (breaker m6): on `/settings/billing` the "Add a card" link is hidden; the sentence stays and the page's own button is just below. B2 checks this.
* The frame diff is still one moved line, and the module rows are unchanged.

### New in this round
* **n1 (Minor):** with a card saved, the banner reads "Card saved. Your first payment is on 2 Dec 2026." and no longer says how many days are left. This is the same line Plan and billing uses, so the two agree, and the end date is given. A days count would match R1.90's "counts days" more literally. This does not block.

### Scores
* **Journey score (reviewer), round 2: 9 / 10, pass.**
  * Plain words, correct data and trust go from ½ to 1.
  * Feedback and state stays ½ (m2: the 60 s cache).
  * Visual quality stays ½ (width on Home).
* **D1-D20 changes:** D1 1, D3 1 (one rule shared by the line and the banner), D10 1, D12 ½, D16 1. Everything else is unchanged.

### Open, not blocking
m2, m5 and n1 (Minors), plus the banner's width on Home.

Verdict: Approve 4bbdc547fcd0aac379505fc00421f2a02dba2816

Reviewer: Approve 4bbdc547fcd0aac379505fc00421f2a02dba2816
