# Review: FO-3w part 2, the booker's manage page (PR #1982) at 3285d306c

Reviewer: Opus 5.5, effort high, fresh context (did not build it). Skill `screen-review`; journey test `journey-test-reviewer-fo3w-part2-2026-11-16.md` (**9/10**). 16 Nov 2026, ~18:15 IST.
**Scope:** `booking-public/manage-page.tsx` (new), `routes.tsx` (one route line), `tests/check_fo3w_manage_browser.ts` (new). `git diff 47b00ddae..3285d306c` touches no API file: `service.ts` and `public.controller.ts` are as on `main`.
**The bar:** brief `lead-b-briefs/FO-3w.md` part 2 (J-P6..J-P8); concept r2 BR-2, BR-6, BR-8..BR-10, §5 "Public" (Manage); AG-4-36..38 (trace tool); Lead B's QA-496 ruling (rev 16.68).

**Verdict: Approve.** Every J-P6..J-P8 line holds on the real app and in the suite. No Blocker or Major. Seven Shoulds and one nit are below; none blocks.

## Runs (copy :4541, held server :4841; never :4400 or :4533)
- **Suite:** `check_fo3w_manage_browser.ts` **44/44, exit 0, twice**, each on a fresh copy. The code was 3285d306c, run from a scratch worktree, so no tracked screenshot was rewritten.
- **Mutation (QA-496):** I declared `/manage` after `/:slug` and rebuilt. Result: **43/44**. Only the source-order check fails.
  - React Router v6 ranks the static `manage` segment above `:slug` anyway, so every page check on the swapped build still passes.
  - The ruling's order is kept, and the behaviour does not depend on it.
  - The reserved-slug case is sound: with a type stored as `manage`, `/book/maple/manage` on the real app shows the bad-link text, never that type (`check…:118-119`).
- **Walks:** headless Chromium, acting as a person. Details are in the journey report.

## Judgment calls
1. **One switch off → the allowed button plus "This booking cannot be changed online…"** (`manage-page.tsx:83,98`). Accepted: the brief's J-P7 asks for exactly this, and §5 has only this sentence. Its wording next to a live button is S2.
2. **Times in the booking's own zone.** Accepted. AG-4-36's example ("22:00 Dubai time") and the emails use the booker's zone. The page names that zone ("Times shown in Asia/Dubai"), and the move sends the same zone back, so the messages keep it.
3. **Token in the fragment, replaced by `replaceState`.** Accepted and verified on the real app:
   - a reload after each of two moves reopens the booking;
   - Back leaves to the page before (history length 3), never to a dead link;
   - API calls carry no token in a query (suite check, and in my walks).
4. **UUID-shaped first part, fragment excluded from the no-id check.** Accepted. `tokens.ts:18-20`: that part is the token row's own random UUID, not the booking's or a person's. It is part of the email's capability, never shown in page text. Page text and the path carry no id (`check…:241,245`).
5. **"No free times in the next two weeks…" is not in §5** (`:154`): flagged as S3.

## Code
- **Sound:**
  - Double click: the `sending` ref (`:130,169`). The suite's double click on Move moves once (sequence 1).
  - Two tabs, one link: the second gets the bad-link text (`check…:175-185`). My walk: one tab cancels, the other's Reschedule gives the bad-link text.
  - The limit passing mid-page: the next action shows BR-9's sentence (`check…:217-221`).
  - A pasted link reloads through `hashchange` (`:56`).
  - Public calls: `credentials: "omit"`, no staff header. No per-row request. No migration.
- **Rules are tested both ways:** removing the offline line, the `replaceState` or the route makes a named check fail (`check…:148,166,225,117`).
- **Graph (P-86):** `graph.mjs` (run in the scratch worktree) does not model module routes, so no G-gap names `/book/*`. The suite claims no capability id. No scaffolding: the walk went from part 1's confirmation link into the page.

## BIC scorecard (concept §4c; 1440 and 1024 px)
| Check | Score | Evidence |
|---|---|---|
| BIC-04 | Met | "Reason (optional)" in words; optional; at most 500 characters (`:188`; server `CancelBody` max 500) |
| BIC-11 | Met | One primary per panel: Reschedule (card), Move to this time (move step), Cancel booking (dialog, destructive) |
| BIC-13 | Met | Server refusals become §5 sentences (`noticeOf`, `:44-51`); the reason is kept while the dialog is open |
| BIC-18 | Met | Skeletons on load and slots; bad link, limit, updated, cancelled and no-times states drawn (`screenshots/fo3w-manage-*`) |
| BIC-19 | Met | One optional input on the whole page |
| BIC-20 | **Partly** | Keyboard path complete, with a visible 3 px ring. 200 % zoom at 1024 and 1440 has no sideways scroll. But 142-148 Tab stops to reach "Move to this time" (S1) |
| BIC-01, 02, 03, 05-10, 12, 14-17 | N/A | Per §4c. No chip, icon-only button or tooltip on the manage page |

## D1-D20
- **D1 5:** BR-8, BR-9, BR-10 and AG-4-36 rules 3, 5, 9 and §12 each map to a check.
- **D2 4:** server rechecks under the lock; double click and two tabs hold. S4 leaves a refused button on screen.
- **D3 4:** reuses part 1's `contract.ts`, `time.ts` and `frame.tsx`.
- **D5 4:** reload, Back, `hashchange` and 429 all hold. S5: focus is lost after a refused cancel.
- **D8 4:** the firm's name sits in the frame and the tab title.
- **D9 5:** one action per state; Move stays disabled until a time is picked.
- **D10 4:** §5's words, with S2 and S3.
- **D11 5:** "Booking updated" is a status; focus goes to the heading after a move or cancel; buttons show busy.
- **D12 4:** clean card, matches part 1.
- **D13 3:** S1.
- **D14 4:** S8.
- **D15 5:** opens in 135-218 ms; slots about 110 ms; a move about 150 ms.
- **D16 4:** 44 checks, run twice by me. S6.
- **D18 4:** the zone is named, and the limit sentence carries the firm's phone.
- **D19 4:** book → confirmation → manage → move twice → cancel, all from the product's own pages.
- **N/A:** D4, D6, D7. **Simulated only:** D17, D20.

## Issues, ranked (all Should; none blocks)
- **S1 (BIC-20, D13).** Each time is a `role="radio"` button and its own Tab stop, and arrow keys do nothing (`:143-149`). In my walk, ArrowRight left focus where it was, and reaching "Move to this time" took 142-148 Tabs. A radio group promises arrow keys to screen-reader users. **Fix:** a roving tabindex with arrow keys (one stop for the group), or plain `aria-pressed` buttons as on the type page.
- **S2 (judgment 1).** With only Cancel off, the page says "This booking cannot be changed online." beside a working Reschedule button. **Fix:** at the next concept revision, Lead B adds per-switch lines. No code change in this PR.
- **S3 (judgment 5).** The no-times sentence (`:154`) is not in §5 and has no check. **Fix:** add it to §5 at the next revision, and add a check.
- **S4.** If staff turn a switch off after the page opened, the refused button stays, and the sentence can show twice (`:97` and `:98`). The cause: `canMove` and `canCancel` read the first answer's flags (`:81-83`). **Fix:** on kind `off`, clear the matching flag. Found by reading the code.
- **S5.** A cancel refused because the limit passed closes the dialog and removes its trigger, so focus falls to `BODY` (`:175`, `:80`). The `role=alert` still announces it. **Fix:** move focus to the heading or the notice. Found by reading the code.
- **S6.** The suite never reschedules a second time after a move (AG-4-36 §11 test 1, "bug 5"). My walk did it: two moves, then cancel; DB sequence 3; four audit lines ending "Consultation cancelled by the booker. A reason was given."; the reason is stored and not shown back. **Fix:** add one check.
- **S7.** The firm key in the address is never checked: `/book/other-firm/manage#<Maple token>` shows Maple's booking. The token routes take no firm, so the page cannot check it without an API field. Nothing leaks, because the token is the key. This is for the FO-3pa lane, not this PR.
- **S8 (nit).** Small departures from the team's components and §5:
  - a raw `<textarea>` (`:188`) instead of the team's `Textarea` (`controls.tsx:44`);
  - the h1 "Your booking" followed by the line "Your booking: …";
  - "Back" (not in §5);
  - the loading tab title "Book a meeting" (`frame.tsx` Gate).

## Could not check
- A real screen reader, a headed browser, Safari and Firefox.
- An intended booker's unaided walk (D17 and D20 stay with the founder).
- CI at this head.
- `/book/maple/manage/extra` opens the Studio shell's "Page not found". That comes from App.tsx's catch-all, the same for any deeper `/book/…` address: outside this PR.
- Axe with WCAG 2.2 tags flagged `target-size` once on the move step. It did not repeat in four more runs, so it is not a finding.
- Uncommitted edits to `manage-page.tsx`, the test and screenshots, plus `break-report-fo3w-part2.md`, appeared in the shared copy at 12:42-12:45 UTC. They came from another session, not from me. This review covers 3285d306c only.

Verdict: Approve 3285d306cd94592b24a48f8db3334fa20af8658c

## Re-review at 51c813833 (diff only, P-277; 16 Nov, ~18:45 IST)

**Diff read:** `git diff 3285d306c..51c813833`. Code changed in two files only: `manage-page.tsx` and `check_fo3w_manage_browser.ts`. Everything else is records and screenshots. No API file changed.

**Runs** (copy :4542, held :4842; never :4400 or :4533):
- **Suite:** `check_fo3w_manage_browser.ts` **49/49, exit 0, twice**, each on a fresh copy. Run from a scratch worktree at 51c813833; the worktree is now removed.
- **My walk on the real app:**
  - A reason with Persian text and a ZWNJ, a tab, an RLM, a newline and a BEL was stored as `"می‌خواهم line one line two"`: the ZWNJ kept, the RLM and BEL dropped, the tab and newline made spaces.
  - Tabbing through every time (153 at 1440, 151 at 512 px, which is 1024 at 200 %): **none** was hidden under the Move bar.
  - After the cancel, focus is on the heading.

| Item | Status | Evidence |
|---|---|---|
| Breaker M1: a pasted reason refused without a word | **Fixed** | `cleanReason` matches `CancelBody`'s refused set (service.ts:151-156); line breaks are left for the server to make spaces. A 400 stays in the dialog on the field (`Field error`). Checked with a tab and an RLM; my walk above |
| Breaker M2: lost answer → "try again" on a change already made | **Fixed** | `afterLoss` re-reads the link only on status 0, and a 404 then becomes `lost`: no buttons. Three checks: a move made, a cancel made, and a move never sent ("try again", the times kept). The `lost` sentence is **not in §5** (the coordinator raises it with Lead B): a Should, as S3 |
| Breaker M3: a focused time hidden under the sticky bar | **Fixed** | `scroll-mb-28` on each time. The new check covers 360 px; my walk covered 1440 and 200 % |
| m1 / my S5: focus lost after a refused change | **Fixed** | The heading takes focus on every change of step, state or notice after the first draw (the `drawn` ref). First draw leaves focus alone (`BODY`), as it should |
| m5: a token over 400 characters | **Fixed** | Treated as a bad link and never sent. FO-3's tokens are 80 characters, and `parseToken` refuses over 100 |
| m8: a move into the self-service window | **Fixed** | Shows the limit sentence, with no buttons. It uses the browser's clock; a skewed clock is still refused by the server on the next action (BR-8) |
| My S6: no second reschedule by the newest link (bug 5) | **Fixed** | New check: sequence 2, the new time stored, "Booking updated" shown once |

**Read and found sound:**
- `afterLoss` treats a schema failure (status 0) the same way. That is safe: a dead link after a successful change still gives the check-your-email sentence.
- The lone-surrogate lookbehind in `cleanReason` adds no new browser risk: the bundle already holds the same regex from existing code.

**Still open (Shoulds; none blocks):**
- S1: 151-153 Tab stops, and `role=radio` without arrow keys.
- S2 and S3, plus the new `lost` sentence: copy for Lead B to add to §5.
- S4: a switch turned off mid-session leaves its button on screen.
- S7: the firm key is not checked (an API question).
- S8: nits.

**Scores:**
- D5 4→5 and D16 4→5. Other D scores unchanged.
- BIC-20 stays Partly (S1).
- Journey score stays **9/10**: M2's recovery and S5's focus were already scored at their level on my walk.

**Could not check:** CI at 51c813833; a real screen reader. FO-3w part 1's suite (67/67) and `check_pf1_module_routes.ts` (28/28) were not re-run by me. The diff touches neither `routes.tsx` nor part 1's files.

Verdict: Approve 51c8138336c4c5eb5d49b034623ae27632161247
