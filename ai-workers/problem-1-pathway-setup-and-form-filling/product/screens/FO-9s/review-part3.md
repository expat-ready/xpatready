# FO-9s part 3 review: the guided merge dialog on Sales › People to merge (R1.29)

Reviewer (fresh context, did not build it), 25 Nov 2026. Commit **`b6522db08704f7bf3e18a8a0b937e6058934c352`**, branch `claude/screens-fo9s-merge-dialog`, PR #3716 (stacked on part 2's `claude/compassionate-rubin-tcheu7`). Scope: `git diff origin/claude/compassionate-rubin-tcheu7...b6522db08`. While I read, the branch moved to `c83c73740`. That commit changes only two files that are not code (`web/src/MODULE.rows/FO-9s-3.md`, which adds the module card row, and `review-part2.md`), so the code I ran is the same at both commits. Spec: concept r3 §4 S3, BR-8, BR-9, §5, and board S3 (branch `claude/runtime-fo9s-concept`); `build-notes-part3.md`. Running app: isolated copy `rev3` on :4587 (PLATFORM_IDENTITY=local, Sample data), and `j29r` on :4591 for the journey. Both are stopped.

## Verdict: Ship (Approve)
No Blocker or Major. The dialog does what S3, BR-8 and BR-9 ask, over FO-9b's real preview and merge routes. These checks ran on my copies:
* `check_fo9s_merge_browser.ts` passed 20/20 twice (11 s each).
* `j_29.ts` passed 27/27 (31 s). W3 now merges by screens.
* `tsc -p web` has 0 errors.

The server enforces the roles: a Case Officer sees no Merge…, and gets 403 on both preview and merge. Five Shoulds are open (issues 1-5). Fix each one, or list it in the PR as a follow-up. Journey score **8.5/10, a pass** (`journey-test-reviewer-part3-2026-11-25.md`).

## Concept fit (S3, BR-8, BR-9, §5, the six errors)
* **S3:** title "Merge A and B"; the steps "1 · Choose what to keep · 2 · What moves · 3 · Confirm" (`aria-current="step"`); side by side with a radio per field; "Merge 2 people". Back keeps the choices (G3, and my keyboard walk). Met.
* **BR-8:** each field is pre-picked with the server's default and says why ("only value", "same", "newer", "neither has it"). A changed field says "your choice". Which record stays is the person's choice, and switching it re-reads the preview and resets the picks. Database: the non-default last name I chose was kept, and the fields I left alone kept their defaults (language `fr`, phone, email). Met.
* **BR-9:** "What moves to <survivor>: 1 lead, 1 note from <loser>'s record". Consent and checks are described in words, then "Nothing is deleted", and Undo is explained. The counts match the database (G3; my J1: 2 leads on the survivor afterwards). The line for two open cases is correctly absent. Met.
* **BR-7 at the dialog:** a case or money that the preview finds is stated before any step, and Next is off (G6). The server refuses a case or money that arrives later, in its own sentence.
* **Errors, all seen in the dialog:** STALE_VERSION: "One of these records changed. Reload to see it." with Reload (G5; Merge is off until you reload, then it goes through). HAS_MONEY: the server's sentence (G6). NEEDS_CASE_SIDE (a case added meanwhile): "This person has a case; merge them from the client record." MERGED_AWAY: "One of these people was merged into another record after this pair was listed. Nothing was changed." Kept separate in another tab: "This pair was already decided." (DECIDED). No answer (aborted request): "Could not merge. Nothing changed." word for word. NOT_LISTED takes the same generic `e.message` path (`merge-dialog.tsx:36`); I could not produce it by screens.
* **Deviations in the build notes:** the inline notice "Merged into <name>." with Undo instead of a 10 s toast; focus on that Undo instead of the next pair; the first record of the pair stays by default. All three are stated in the PR. They are not findings.

## Issues, ranked (all Should unless marked Minor)
1. **Should: the notice names the survivor's old name.** If the person keeps the other record's name, the notice is wrong. `merge-dialog.tsx:34` passes `nameOf(p.survivorId)` (the name before the merge) to `people-to-merge-page.tsx:160`. In G1 the survivor is "…Parks" and the chosen last name is "Park": the notice reads "Merged into …Parks.", but the record is now "…Park" (the check's own run, `fo9s3-04`). Fix: build the name from the picked first and last name values (`pickOf`), or read it back after the merge.
2. **Should: in J-29 the confirm step cannot tell two records with the same name apart.** The title reads "Merge Lena Park and Lena Park" and step 3 reads "Lena Park will be merged into Lena Park. 1 lead, 1 note move." (`j_29` W3 screenshot `w3-merge-dialog-confirm-1440.png`; `merge-dialog.tsx:51`, `:77-82`). Step 1 already names each record with its lead number (`card()`). Fix: use `card()` in the step 2 and step 3 sentences (and the title), as part 2 did with "(two records)".
3. **Should: after a final refusal the dialog and the list stay stale.** Final refusals are DECIDED, MERGED_AWAY, NEEDS_CASE_SIDE and NOT_LISTED. `onError` (`merge-dialog.tsx:35-37`) neither refreshes the list nor disables "Merge 2 people" (`:47` disables it only for a stale record). A second click gets the same 409. After closing, the pair is still on To review: in all four of my cases the row was still listed, and the case pair still offered Merge…. Fix: `refresh()` in `onError`, as part 2 r2 did for Undo, and disable Merge 2 people for these codes.
4. **Should: at 375 px the "keep the other value" column is out of view, with no cue that it scrolls.** `merge-dialog.tsx:65-66` uses `min-w-[34rem]` inside `overflow-x-auto`. The table overflows by 251 px, and the other record's values and Why are hidden (`fo9s3-06-choose-375.png`). This is UXL-10, and concept §4 lists 375 px. The build notes call it a known gap. Fix: stack the two values under the field at narrow widths, or show a scroll cue.
5. **Should: tests.**
   * The check has no case for any refusal other than STALE and HAS_MONEY, and none for MERGE_FAILED. The Lead's hand-over lists six errors, so add at least one generic refusal and the aborted request (`page.route` abort).
   * G2 (`check_fo9s_merge_browser.ts:108`) says "the choices reset" but asserts only that the columns swap. Removing `setPicks({})` at `merge-dialog.tsx:63` would still pass.
6. Minor: `fieldWhy` (`review-contract.ts:45-50`) re-derives the server's `defaultPick` (`ports/person-merge.ts:86-95`) on the web, with a different blank test: the server trims whitespace, the web does not. A whitespace-only value, or a tie on `updatedAt`, would show "newer" for a pick made by another rule. STANDARDS §7 says logic is not duplicated between web and API. Fix: base the label on `f.pick` plus the server's own `present` test, or have the preview send the reason later (API, not this part).
7. Minor: focus after Back lands on the dialog container (the Back button unmounts; `:45`), so a keyboard user tabs again from Close. Next to Merge 2 people keeps focus.
8. Minor: wording against S3 and the board.
   * The other record's column has no "Keep this one instead" (board S3 header). Only the radios' `aria-label` "…: keep X" says it.
   * Step 3's list has no "and" ("1 lead, 1 note move.").
   * Switching who stays silently drops the choices already made.
9. Minor: at 375 px Next and Merge 2 people are 36 px tall. UXL-09 asks for 44 px (P-795). This is the shared `Button` size.
10. Minor: `j_29.ts:190` uses a fixed `waitForTimeout(500)` after the survivor switch. Wait for the preview instead (for example the email row of the new survivor).

## Standards [M] lines this part touches
* **STANDARDS:**
  * §1: React Query, zod and `controls` (`Dialog`, `Notice`, `Button`). Met.
  * §3.10: a pass and a fail per rule. Met, except the gaps in issue 5. Spot-checked by reading: dropping `choices` fails G1, dropping `updatedAt` fails G5, dropping `blocked` fails G6, dropping Back's state fails G3.
  * §4: optimistic concurrency, a stale merge is a 409 with Reload. Met.
  * §5: one preview request per view, nothing per row. Met.
  * §6: server authorisation (403 and 403 for the Case Officer). Met.
  * §7: strict TypeScript, why-comments with numbers. Met. No duplicated logic: Partly (issue 6). Module card: the row is added in `c83c73740`, not in `b6522db08`.
  * §9: dialog open in 154 ms, merge in 250 ms. Met.
* **EXPERIENCE:**
  * §1: team tokens and one primary per footer, right-most. Met.
  * §2.3: the merge happens in a dialog and the page keeps its tab. Met.
  * §2.7: reasons ("only value", "newer"). Met.
  * §2.8: confirm step and Undo. Met.
  * §2.12: keyboard path, focus returned (Escape goes back to Merge…, after the merge focus is on Undo), 1024 px and 200 % (720 and 640 px) with no sideways scroll. Met.
  * §3: wizard of 3 steps or fewer. Met.
  * §4: loading skeleton, preview error with Try again, conflict with Reload. Met.
  * §5: §5's copy word for word. Met, apart from issue 8.

## D1-D20 (1-5)
* D1 4: every S3, BR-8 and BR-9 element is present and tested; issue 1.
* D2 4: stale check, server refusals, one POST on a double click.
* D3 4: reuses the part 2 contract and the `controls` components; issue 6.
* D4 N/A.
* D5 4: a reload mid-dialog merges nothing, Reload recovers a stale record; issue 3.
* D6 4: one `person.merged` audit line by `staff:<id>`.
* D7 N/A (no AI).
* D8 4: Sales › People to merge, with the steps named.
* D9 4: 3 steps and one primary.
* D10 4: §5 copy; issues 2 and 8.
* D11 3: the notice and errors in words, but issues 1 and 3.
* D12 4: clean at 1024 and 1440.
* D13 4: axe (WCAG 2.2 AA tags) clean at 1024, 720, 640 and 375 px, keyboard complete; issues 4, 7 and 9.
* D14 4: team controls.
* D15 5: 154 and 250 ms.
* D16 4: 20 checks, green twice; issue 5.
* D17 simulated only.
* D18 4: defaults say why, "your choice", nothing deleted.
* D19 4: J-29 now walks S1 → S2 → S3 → Undo by screens (27/27).
* D20 simulated only.

## Scorecards
* **BIC-01…20 (EXPERIENCE §6): N/A.** This is a front-office screen (concept §4c).
* **The "Always" checks, for information:** BIC-11 Partly (the wizard's "Next" on steps 1-2; the final primary is named) · BIC-14 Met · BIC-18 Met · BIC-19 Met at 1440 and 1024 px · BIC-20 Met.
* **UXL (1280 and 375 px):** 01 Met · 02 Met · 03 Met · 04 Met · 05 Met (primary right-most) · 06 Met · 07 Met · 08 N/A · 09 Partly (issue 9) · 10 Not met at 375 (issue 4) · 11 Partly (issue 4) · 12 Met · 13 N/A · 14 Met (radios and text, not colour).

## Graph, retrofit, scaffolding
* `graph.mjs`: G1 0 · G2 0 · G4 0 · G5 0. `merge-dialog.tsx` is not in G6. The G3 and G6 items for duplicates (`POST duplicates/check`, `features/front-office-duplicates.ts`) come from before this part. The graph's `webUse` misses template-literal URLs (preview and merge show `webUse: false` even though this dialog calls them); that is a tool limit, not a finding.
* Retrofit: new, as concept §2 records (AG-2-68 "Not built").
* P-33: the check's fixtures set pairs OPEN by SQL and add money by SQL. That is test set-up. j_29 W3 now merges by the screen.

## Not checked
A real screen reader (step changes have no live announcement; only `aria-current` and the heading change) · an intended user's unaided walk (D17 and D20 stay with the founder) · a visible headed browser (none in the cloud container; headless Playwright clicked and typed) · NOT_LISTED by screens · `check_fo9s_review_browser.ts` (part 2's) and the full CI run on this commit. The two checks rewrote the committed screenshots; I restored them to the committed versions.

Reviewer: Approve b6522db08704f7bf3e18a8a0b937e6058934c352

Verdict: Approve (no Blocker or Major open; Shoulds 1-5 to fix or list as follow-ups in the PR)

## Round 2 (25 Nov, commit `9f717a61ed57e3edc8ed1b7ecc6ffd5925dd0e5d`, diff since `b6522db08`)
Diff in `studio/`: `merge-dialog.tsx`, `review-contract.ts`, `people-to-merge-page.tsx`, `check_fo9s_merge_browser.ts`, `check_fo9s_review_browser.ts` and the module row. Re-checked on my copy `rev3` on :4587, and on `j29r` on :4591 for j_29; both are stopped and the screenshots are restored:
* `check_fo9s_merge_browser.ts` **24/24 twice**.
* `check_fo9s_review_browser.ts` 38/38.
* `j_29.ts` 27/27.
* `tsc -p web` 0 errors.
* My own walk (headless; clicks and keys only; database read only to verify). No page errors.

**The breaker's Majors: both closed.**
* **M1 closed.** I made the merge's answer get lost after the server had merged (`route.fetch()` then abort). The dialog says "We did not hear back, so the merge may have gone through. The list was read again: check the Merged tab before trying again." Merge 2 people is off, and the pair has already left the list behind the dialog. The database shows the pair `MERGED`.
  * Kept separate in another tab (409): Merge is off, and after Cancel the row is gone.
  * A case added meanwhile (409): Merge is off, and after Cancel the row shows Merge… off with BR-7's sentence.
  * A 503 problem answer: the server's "… Try again." shows, Merge stays on, and the retry merges.
  * A 500 with an HTML body: "Could not merge. Nothing changed." word for word (G8).
  * Code: `merge-dialog.tsx:52-60`, and `onRefresh` at `people-to-merge-page.tsx:160`.
* **M2 closed.** With focus on Next, 12 quick Enters moved exactly one step (step 2) and sent 0 POSTs. Focus is on the heading "Step 2 of 3: What moves", and the dialog's own `aria-live` region says the same. Step 3 and Back do the same (`:32`, `:77-78`). Three fast clicks on Merge 2 people send one POST (the `sending` ref).

**My Shoulds: all closed.**
* **S1:** I kept the other record's first name, and the notice reads "Merged into <the name the record now carries>.", which matches the database (`afterName`; G4 asserts it).
* **S2:** for same-name records the title reads "Merge Same Name · L-00040 and Same Name · L-00039", and step 3 reads "Same Name · L-00039 will be merged into Same Name · L-00040. 1 lead and 1 note move."
* **S3:** covered by M1.
* **S4:** at 375 px there is the hint "Scroll the table sideways to see both records.", and the table sits in a region you can reach by keyboard (`role=region`, `tabIndex=0`). The other column now shows at the edge. No page sideways scroll; axe (WCAG 2.2 AA) clean.
* **S5:** G8 covers the lost answer and the server failure; G2 now asserts that the choices reset and that the screen says so; G7 holds Enter. Spot-check by reading the code: removing `onRefresh()`, the `MERGE_UNKNOWN` branch, `final`, the heading focus or `setPicks({})` would each fail a named check.

**Minors.**
* Closed:
  * "· keep this one instead" on the other column's header.
  * "and" in the step lists.
  * `fieldWhy` handles a tie ("the record that stays").
  * The stray outside click: the guard asks "Discard your unsaved changes?" and the dialog stays open on dismiss; a double click on Next stays on step 2.
  * No preview runs for the last pair's survivor (`mine`).
  * Focus after Back now goes to the step heading.
  * Switching who stays is said ("Your field choices were reset…").
  * Part 2's carried-over Should: the Merged tab at 375 px has Undo merge at x 309 of 375, and How and When sit under the names.
* Still open (Minor, follow-ups only, not blocking):
  * (a) After the lost-answer message, Back then Next clears the error (`go()` at `:32`) and turns Merge 2 people on again. A second click gets 409 "This pair was already decided.", which is safe but drops the "check the Merged tab" advice.
  * (b) The breaker's m5: very long unbroken names in the column headers (`:94`) and in the "… stays" labels still overflow at 1024 and 375 px.
  * (c) The breaker's m6: the notice can still read "Merged into …" after the merge was undone in another tab.
  * (d) `fieldWhy`'s blank test still does not trim like the server's.
  * (e) The primary buttons are 36 px at 375 px (UXL-09, the shared `Button`).
  * (f) `j_29.ts:190` still has a fixed 500 ms wait.
  * (g) The step 3 sentence names the survivor by its current name, not the name it will carry (the notice is right).

**Journey score, round 2: 8.5 → 9.5/10.** Feedback and state goes from ½ to 1 (S1, S3 and M1). Accessibility and screen sizes stays ½ because of the 375 px button height and the long-name overflow.

**Round 2 verdict: Ship (Approve).** No Blocker, Major or Should is open.

Reviewer: Approve 9f717a61ed57e3edc8ed1b7ecc6ffd5925dd0e5d

Verdict: Approve 9f717a61ed57e3edc8ed1b7ecc6ffd5925dd0e5d
