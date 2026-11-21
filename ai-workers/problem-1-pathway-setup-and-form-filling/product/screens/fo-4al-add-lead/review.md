# Review: FO-4 Add a lead (R1.27, QA-606), PR #2612

**Verdict: Approve** on `3422e9f4cabac9090e68a8889d958dd22292cad8`, the fourth round (round 3 also approved `a0b33f63e`). No Blocker or Major is open.

Reviewer: a fresh agent (`screen-review`) that did not build it. Rounds: `376411977` Block (two Majors) · `7e2823578` Block (one test gap) · `a0b33f63e` Approve · `3422e9f4c` Approve (diff only: the fresh-copy flake). Copies: isolated `:4531`, `:4534` and my fresh `:4441` (stopped); never :4400. Live AI off, US$0.

**The bar:** concept r2 (`origin/lead-b-front-office:…/screens/fo-4-sales/concept.md` §3 BR-2, BR-10; §4 Leads and Panels), brief FO-4 part 2, AG-2-4 (from the trace tool), `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`.

**Journey report:** `journey-test-reviewer-2026-11-20.md`: 7.5/10 on round 1, now **9/10** (next step 1, plain words ½ for S2, correct data 1, accessibility 1, trust ½ for S1; the other five unchanged at 1).

## Findings and what became of them
**M1 (Major): fixed in `7e2823578`.**
- Round 1: after a Save on a known person, the match box opened below the panel's visible area, both at 200 % zoom (720×450) and on a 1366×657 laptop. Only the footer button turning into "Add as new" was in view, and focus stayed on it.
- Now the box takes focus 50 ms after it appears and scrolls into view: at 720×450 its top is at 247 px with the panel body ending at 389 px; at 1366×657, 454 px against 596 px.
- "Add as new" now sits inside the box, and Save lead is switched off while a match waits. Enter on the box saved nothing, and Tab from it lands on "Use existing person".
- Tested at 720×450: the box is on screen and focused, and nothing is saved.

**M2 (Major): fixed in `7e2823578`; its test was made able to fail in `a0b33f63e`.**
- Round 1: the source suggestions offered the raw stored code `WEBSITE`. Picking it would save a phone or walk-in lead as a web-form lead.
- The fix: `suggestions()` drops stored codes (where `words(x) !== x`) and sources that differ only by case or spaces.
- Live on :4534 the API still returns `WEBSITE`, and the suggestion list shows `["Email","Phone call","Walk-in","Referral"]`.
- Round 2 found the test empty on a fresh copy: no `WEBSITE` existed there, so it could not fail.
- Round 3 test: it inserts a WEB_FORM lead with source `WEBSITE` owned by the Case Officer, asserts `GET leads/sources` includes `WEBSITE`, then asserts the suggestion list does not.
- On my fresh copy the setup printed `{"sources":["Phone call","WEBSITE","Walk-in","phone   CALL"]}` and both M2 assertions passed.
- The builder reports a mutation run: with the filter removed, 25/27, with M2 and m4 failing. I did not redo that, because it needs a web rebuild. The logic holds, since the setup now proves `WEBSITE` is present.

**Breaker items, checked in the diff, all sound:** B1 (the choice moved into the box; two clicks 250 ms apart save nothing) · m1 (`fieldset disabled` while saving) · m3 (server refusals in the panel's words; an emoji-only source gives "Pick a source.") · m4 (case and space twins offered once) · m5 (the keyboard lands on the choice).

**Round 2 Minor (focus ring on the match box): fixed in `a0b33f63e`** with `focus:ring-[3px] focus:ring-ring/50`.

**S4 (Should): fixed in `7e2823578`.** `confirmClose` now asks before Escape, the X or the overlay discards typed details. Cancel still closes at once, like the house Dialog guard. Tested.

**Still open as Should, listed in the PR or asked of the tech lead:**
- **S1:** the match line lacks AG-2-4 rule 4's label, what matched and the owner. FO-2's 409 sends only `{personId, name, lead}` (`api/src/front-office/sales/leads.ts:159-161`, on main). BR-2 is met.
- **S2:** no error summary at the top (BIC-13); server messages pass through as written, so "Not an email address." still gives no fix; a server field error shows at its field but focus does not move to it.
- **S3:** the first note is saved but no screen shows it until the lead timeline (part 2b).
- **S5:** J-27 switches the web form on by SQL (#2556 is the screen) and posts the embed call with `fetch`. Swap in the settings screen before `Completes: R1.27`; the PR does not claim it yet.

**Round 3 Should (the check was flaky on fresh copies): fixed in `3422e9f4c`.**
- The likely cause was in the panel itself: it cleared its fields in an effect after opening, and on a slow copy that clear could land after typing, so Save found empty fields and sent nothing.
- Now Leads gives the panel a new `key` on each open, the request id is made in a `useState` initializer, and the clearing effect is gone. The check waits for the heading and the button, and checks the typed values before pressing.
- On freshly started copies of mine (start, run at once, stop): 27/27 three times out of three, against 2 of 4 before.
- Walked: Escape with the discard question accepted closes the panel and focus returns to "Add a lead"; reopening shows empty fields and no errors; three Adds sent three different request ids (one of them after Cancel and reopen without a reload).

**Outside this screen (FO-2's API; recorded, not findings):** Use existing person on a person with an open lead leaves both leads OPEN with `previous_lead_id` empty (AG-2-4 rules 5 and 7), and the details typed alongside it are dropped without a word.

## D1–D20 (independent reviewer, browser and code; round 4)
| Dim | Score | Evidence |
|---|---|---|
| D1 | 3 | rules 1, 6, 8, 10 and BR-2 met; rule 4 partial (S1); the check runs at Save, which is still "before saving" |
| D2 | 4 | one request id per panel; a double click or Enter twice makes one lead; two tabs on one new email make 1 person; Read-only POST gets 403; no `WEBSITE` (M2) |
| D3 | 4 | reuses Panel, Field, `useSources`, `staffApi` and FO-2's route |
| D4 | N/A | no dependent questions |
| D5 | 4 | after a 502 the input is kept and the retry saves once; a reopened panel is fresh; asks before discarding; fresh-copy flake fixed (27/27 three times) |
| D6 | 4 | audit line `lead.created`, "Lead L-… arrived by hand.", with the staff actor |
| D7 | N/A | no AI |
| D8 | 4 | path Sales › Leads; the panel says "You will own the lead." |
| D9 | 4 | 4 inputs plus Save; the match is focused with its two choices |
| D10 | 4 | plain copy; "(optional)" in words; S2 remains |
| D11 | 4 | busy button, field errors, failure notice, toast "Lead L-… added. You own it." |
| D12 | 4 | house look; one filled button per area |
| D13 | 4 | axe finds 0 violations; keyboard path complete; focus rings visible; no sideways scroll at 375 to 1440 px; 200 % zoom works |
| D14 | 4 | the sales module's look |
| D15 | 5 | Leads 354-382 ms; panel opens in 77-104 ms; Save 245 ms |
| D16 | 4 | a pass and a fail test per rule; the M2 test can now fail; the check reruns clean on fresh copies |
| D17 | — | simulated only |
| D18 | 3 | source shown on the lead; the match does not say what matched (S1) |
| D19 | 3 | J-27 runs form, Leads, Add a lead, filter and lead page; the form switch is by SQL (S5) |
| D20 | — | simulated only |

## BIC scorecard (EXPERIENCE §6, the concept's 4c)
| Check | Score | Evidence |
|---|---|---|
| BIC-01/02/03/05/06/07/09/10/12/15/16/17 | N/A | no case facts, AI, documents, tasks or filing in this panel |
| BIC-04 | Met | "(optional)" in words; hint "An email or a phone number is needed." |
| BIC-08 | N/A | the panel adds a lead; Leads' chips belong to part 1 |
| BIC-11 | Met | one filled button: Save lead, or "Add as new" inside the match box while Save is switched off |
| BIC-13 | Partly (Should) | errors on the field, input kept, client errors focused, server refusals in the panel's words; no summary (S2) |
| BIC-14 | Partly (Should) | no tooltip on the match line; its visible sentence "Nothing is saved until you choose." covers the need to act |
| BIC-18 | Met | saving, failed (input kept) and read-only (no button, plus the reason line) are all shown |
| BIC-19 | Met | one heading, one primary, 3 type sizes, red only for errors, at 1440 and 1024 px |
| BIC-20 | Met | keyboard complete, rings visible, no sideways scroll, the match in view at 200 % (720×450) |

## Graph (P-86) and scope
`graph.mjs`: G1 0, G4 0, G5 0; `POST /front-office/leads` is reached by tests. The graph models C-ids only, so R1.x items and `tests/journeys/` are not in it (a tool gap, not this PR's). Every element serves AG-2-4 (P-33). The listed limits are not findings (P-26): phone region, ⌘K, Interested in, referrer, marketing tick, rule 7.

## Not checked
A real screen reader · a visible headed browser (walked headless with screenshots) · an intended user's unaided walk (D17, D20) · the M2 mutation run (needs a web rebuild) · the retrofit mapping to the team's `confirmToken`/`createAnyway` (FO-2's to record).
