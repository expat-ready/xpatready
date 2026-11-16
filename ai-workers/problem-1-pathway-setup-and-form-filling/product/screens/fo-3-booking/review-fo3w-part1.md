# Review: FO-3w part 1, the public booking pages (PR #1921, commit 52d96246d)

Reviewer: Opus 5.5, effort high, fresh context (did not build it). Skill `screen-review` and the journey test (`journey-test-reviewer-fo3w-part1-2026-11-16.md`, **8/10**). Date 16 Nov 2026, ~09:30 IST.
The bar: brief `lead-b-briefs/FO-3w.md`, with amendment **A1** (P-626-order.md, `lead-b-front-office`: no PF-13 wait, `/book/:firmKey`, no agreement link or tick; part 1 is J-P1..J-P5, J-P9, DW10, DW11) and **P-629** (a slot under the firm's name). Also concept `fo-3-booking` r2 §3 BR-1..BR-7 and BR-11, §4 Public, §5 Public, §6, and FO-3pa's `service.ts` publicList, publicSlots and publicBook.
Head moved after this review: 6d26fb72f changes screenshots only. My first suite run used the shared tree, so some of those images may be mine; they come from the same suite at the same code. The builder's uncommitted work on `type-page.tsx`, `time.ts` and `contract.ts` is **not reviewed**.

**Verdict: Block. Ship after fixes:** one Major of mine (R1) and three of the breaker's Majors that I confirmed (B-M1..B-M3). The pages are sound: zone maths, consent, slot-taken recovery, double-click, axe and widths all hold.

## Done when, re-run by me (ports 4541-4544 and 4841-4845; never :4400)
| Line | Result |
|---|---|
| J-P1, BR-2 | Pass. Two cards; the empty text and `mailto:`; six not-found addresses give one identical text. The "case type" stands in as a retired type. The schema really has only `FREE_CONSULT` (`front-office-booking.prisma:20-22`), so this deviation is accepted. |
| J-P2 | Pass. Dubai 22:00, London 19:00, stored 18:00Z with `visitor_time_zone` Europe/London. A zone change sends **no** API call (my network log). |
| J-P3 | Pass. Keyboard-only booking works. Consent goes only when ticked. **Mutation:** sending consent whenever the firm has a sentence makes the test fail ("no marketing consent stored", 59/60). The rule's test bites. |
| J-P4 | Pass. Two tabs on one time give one booking plus the slot-taken text. A double click books once. The stamp is released on failure (`service.ts:848-856`). |
| J-P5 | Pass. Fall day: eight times, none twice, note shown. Spring day: no 02:xx. A plain day has no note. |
| J-P9 | Embed, honeypot, 429 and widths pass. **But the "44 × 44 px targets" claim fails in the zone dialog (R1).** I also embedded the real app (:4541): no X-Frame-Options or CSP header, and it renders. |
| DW10 | Pass. axe finds nothing serious; no outside host; shots at 360, 375, 1024 and 1440. |
| DW11 | **Pass, run by me** (still unticked in the PR): `check_pf1_module_routes.ts` 28/28; `check_fo4_sales_browser.ts` 45/45 on a fresh `PLATFORM_IDENTITY=local` copy. |
| Suite | `check_fo3w_booking_browser.ts` **60/60 twice**, on two fresh copies. |

## D1–D20
D1 4: BR-1..7 and BR-11 behave; R1 and B-M1 are gaps · D2 5: one row and one `booking.scheduled` audit per booking (14/14); no duplicate under double click or two tabs; UTC instant exact · D3 4: team controls, but the phone regex is copied from the API (`type-page.tsx:23`) · D4 N/A · D5 3: B-M3 (a lost answer shows nothing); reload after booking drops the confirmation (break m1) · D6 N/A (the audit line is present) · D7 N/A (no AI) · D8 4: firm name and step headings · D9 4: about 5 clicks to book; Reschedule and Cancel are dead ends until part 2 (stated) · D10 4: concept copy, with undeclared strings (m2) · D11 4: busy button, skeletons, summary focus · D12 4: header 16 px off the content (m4) · D13 3: R1, focus lost (m1), hover-only tooltip (m3) · D14 4 · D15 5: list 280 ms cold, times 83 ms · D16 4: a mutation bites; the dialog is a blind spot · D17 simulated only · D18 4: every time carries its zone · D19 4: books end to end; manage is part 2 · D20 simulated only.

## BIC (concept §4c; evidence: `screenshots/fo3w-*-1440.png`, `-1024.png`, steps)
BIC-01 N/A (no known person on a public page) · BIC-02 **Met** (phone only for a phone call, J-P9 at 360 px) · BIC-03, 05-10, 12, 15-17 N/A · BIC-04 **Met** (nothing optional to mark; refused at the field) · BIC-11 **Met** (one primary: Choose per card, Book this time, Add to calendar) · BIC-13 **Partly**, Should (on the field and in the summary, input kept, focus to the summary; the summary lines are not links, `type-page.tsx:185`) · BIC-14 **Partly**, Should (zone tooltip is a `title` on a `<p>`, `:66`: hover only) · BIC-18 **Met** (empty, skeletons, slot taken, DST, not-found) · BIC-19 **Met** (five inputs and one tick) · BIC-20 **Partly**, Must with R1 and m1 (keyboard path complete, 200 % at 1024 and 1440 has no sideways scroll, headings in order; dialog targets and focus loss).

## [M] lines (STANDARDS, EXPERIENCE), only those that apply
Met: §3.10 every BR with a pass and a fail · §5 one request per view (one slots call per month; none on a zone change) · §6 server answers are RFC 9457, read by `problemOf` · §7 strict TS, comments say why, axe on every state, a rule's test fails when the rule is removed (spot-checked) · §8 rate limit, honeypot, no outside host · §9 budgets · EXP §1 status in words · §4 states (empty, loading, error, long names wrap on the list) · §5 no ids on the page; the token never reaches the address bar (R3).
Not met: EXP §2.12 accessible (R1, m1) · §4 "error (on the field, with the fix)" for a lost answer (B-M3) · §7 module card: CI `module-cards` is red because the body says "Card unchanged." and not `Card unchanged: <reason>`.
Studio shell: N/A (concept §4: own frame). Demo chrome: none on the pages. Retrofit: concept §2 says "UI: new", so there is nothing to map.

## Issues, ranked
**Majors (Must)**
1. **R1. At 360 px the zone dialog's targets are under BR-6's 44 × 44 px, and the J-P9 line that says so is ticked.** Close is 24 × 24 (`controls.tsx:88`, `p-1` on a 16 px icon); "Use this zone" is 126 × 40 (`type-page.tsx:70`, `size="lg"` = `h-10`). Scenario: 360 px → "(change)" → measure. The test never sees it: `small()` reads only `main …` (`check_fo3w_booking_browser.ts:254`), and the dialog is portalled outside `main`. Fix: `h-11` on the button; a 44 px Close for this dialog; run `small()` with the dialog open over `[role=dialog]` too.
2. **B-M1 (confirmed by code). A zone change can hide real times at the month's edge.** The key holds no zone (`type-page.tsx:32`), but the range is worked out in the zone at fetch time (`:36`). Scenario: Dubai → America/Toronto on a month's last day: times after 20:00Z (Dubai's midnight) are never fetched, so 15:00-17:00 Toronto is missing. Fix: fetch a padded range (±1 day), or put the zone in the key.
3. **B-M2 (confirmed). The picker accepts zones the server refuses.** `realZone("+05:30")` returns "+05:30" (`time.ts:9`). The server's `ZONE_NAME` (`service.ts`, the `Zone` schema) refuses it, so booking fails with "Please check the highlighted details." and nothing is highlighted (`type-page.tsx:165-166`). Fix: offer and accept only the server's shape.
4. **B-M3 (confirmed). A lost network answer on "Book this time" shows nothing.** `publicCall` does not catch a `fetch` failure (`contract.ts:42`). In the catch, `p.issues.map` throws on the `TypeError` (`type-page.tsx:161`), so no message appears. The visitor does not know whether they are booked. Fix: map a failed fetch to a Problem and show "We could not take this booking. Please try again." (§5).

**Minors (Should)**
- m1 (= break m7). Focus drops to `BODY` after choosing a time (`type-page.tsx:49-52`), after "Back to times" (`:174`), and after the zone dialog closes by Escape or "Use this zone". The dialog has no Trigger, so Radix returns focus nowhere (`:69`). Fix: focus each step's `h1`, as the confirmation already does (`:220`), and return focus to "(change)".
- m2. Strings not in concept §5, not declared in the PR (it names only one): "This page could not be loaded. Please try again." (`frame.tsx:28`), "We could not load the times. Please try again." (`type-page.tsx:96`), "the firm's office" (`:223`). Declare them for §5, or use §5's own words.
- m3. Zone-line tooltip is a native `title` (`type-page.tsx:66`): not shown on keyboard focus or touch (BIC-14).
- m4. The header name sits 16 px left of the content at ≥ 928 px: `frame.tsx:12-13` pads the `<header>`, but `:18` pads inside `max-w-4xl`. Visible in `fo3w-booked-1024.png`. Fix: pad the inner div.
- m5. The test named "J-P2 fail: … the zone unchanged" never checks the zone line (`check_fo3w_booking_browser.ts:143`).
- **CI (must be green before the label):** `pr-rules` says `MISSING: no "Done when"; no "Duplicate check:" line`. `module-cards` needs `Card unchanged: <reason>`. DW11's result goes in the body; mine is above.

Noted, not findings: Reschedule and Cancel lead to "This page is not available." until part 2 (stated; the brief splits it). The break report's other Minors are the breaker's to track. P-33: the demo shows this page only once a type exists, and FO-3st3 creates types; that is backlog order, not scaffolding inside this page.

## Graph (P-86)
I ran `graph.mjs` (in a scratch worktree): G1 0, G4 0. The graph reads only App.tsx pages, so `/book/*` and every PF-1 module page are outside it, and it records the FO-3w suite as "visits [':p']". This is a limit of the tool, not a finding against this PR. `/api/public/firms/*` routes are not in G3.

## Could not check
- A real screen reader. An unaided walk by a visitor (D17, D20 stay with the founder).
- A visible (headed) browser: none here; headless Playwright only.
- Safari/Firefox zone spellings.
- Mail content (J-38).

**Verdict: Block.** Fix R1, B-M1, B-M2 and B-M3 and make CI green. The Minors are Should items.
