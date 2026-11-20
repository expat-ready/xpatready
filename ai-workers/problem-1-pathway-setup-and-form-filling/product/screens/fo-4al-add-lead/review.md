# Review: FO-4 Add a lead (R1.27, QA-606), PR #2612

Reviewer: fresh agent (`screen-review`), did not build it. Commit reviewed: `376411977ab984fba6456321e0d3c1ea48f18749` (code); head now `6f34d1d8b`, which adds only 5 refreshed PNGs (`fo4al-0*`), no code. Copy used: isolated `:4531` (`xr_studio_screens_al`, PLATFORM_IDENTITY=local), restarted with `isolated.sh restart` because it had stopped (TTL). Never used :4400. Live AI off, US$0.
Bar: concept r2 (`origin/lead-b-front-office:…/screens/fo-4-sales/concept.md` §3 BR-2, BR-10; §4 Leads, Panels), brief FO-4 part 2, AG-2-4 (trace tool), `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`. Journey report: `journey-test-reviewer-2026-11-20.md` (score **7.5/10, below the pass**).

**Verdict: Block** (Ship after fixes): 2 Majors open (M1, M2). Both are small fixes in `add-lead-panel.tsx`, and each needs a test that fails without the fix.

## Suites re-run by the reviewer (on :4531)
`check_fo4al_add_lead_browser.ts` 19/19 (exit 0). `j_27.ts` 11/11, run twice, exit 0 both times. I put the screenshots these runs overwrote back to their committed state. `count-any`: 416, under the baseline of 433.

## Issues, ranked
**M1 (Must, Major): the known-person block can open off screen, and the only change in view is the filled button turning into "Add as new".** (`add-lead-panel.tsx:87-97`, with the footer at `:73`)
- Evidence: Save on a known phone, then measure the block `[data-known-person]` against the panel body.
  - 1440 px at 200 % zoom (a 720×450 viewport): block top 546 px, body bottom 389 px, so out of view.
  - 1366×657, a common laptop's browser viewport: block top 605 px, body bottom 596 px, so out of view.
  - 1024×768: just in view.
- After the 409, focus stays on the footer button, which now reads "Add as new". Pressing Enter again or clicking it makes the duplicate person that AG-2-4's check exists to prevent, and "Use existing person" is never seen.
- Breaks EXPERIENCE §2.12 [M] (200 % zoom must work) and §2.8 [M] (duplicate check before save). It is BIC-20 Partly.
- Fix: when the 409 arrives, move focus to the block (give it a heading with `tabIndex=-1`) and scroll it into view, or render it above the fields. Add a check at 720×450 that asserts the block is in view and has focus.

**M2 (Must, Major): the source suggestions offer the raw stored code `WEBSITE`, and a manual lead can be saved under the web form's source.** (`add-lead-panel.tsx:38-39`)
- `offered` passes `useSources()` through unmapped.
- Evidence: `GET /api/front-office/leads/sources` for the Case Officer returns `["Email", "…", "Phone call", "WEBSITE", "Walk-in"]`, so typing "W" offers "Walk-in" and "WEBSITE".
- Picking "WEBSITE" stores a phone or walk-in lead as `WEBSITE`. On Leads it then shows as "Website form" and sits in R1.30's "Website form" filter. That is the wrong source on the very property R1.27 proves.
- Breaks EXPERIENCE §5 [M] (no codes on the main path) and gives wrong data (D2).
- Fix: leave the web-form doors' stored sources out of the manual suggestions (at least the codes in `WORDS` / `words()`), and test that "WEBSITE" is not offered.

**S1 (Should): the match line lacks AG-2-4 rule 4's label (lead, prospect, client), what matched (email or phone) and the owner.**
- The panel shows only "Possible match: <name> (L-…)", because FO-2's 409 sends only `{personId, name, lead}` (`api/src/front-office/sales/leads.ts:159-161`, on main, not changed here).
- BR-2's rule (name only people the viewer may see) is met.
- Fix: a follow-up on FO-2's answer, then the line. List it in the PR.

**S2 (Should): no error summary (BIC-13 Partly), and server field errors leave focus where it was.**
- Client checks focus the first field in error (good). A server field error such as "Not an email address." (shown for `bad@`) does not move focus, and the words give no fix.
- Server wording "this is required." can reach the Source field: a source of only punctuation passes the client check, but the server's word test refuses it with that text.
- Fix: focus the first invalid field on a 422 too, and give a fix in the message ("Enter an email like name@example.com").

**S3 (Should): the first note is saved (`fo_note`, 1 row) but no screen shows it yet.** The lead page has no timeline until part 2b, so what the adder typed vanishes from view. Say so in the PR, or show it with the timeline row.

**S4 (Should): Escape, the overlay or the X throw away a half-typed phone enquiry without asking.** `Panel` has `confirmClose` for exactly this (the identity panel uses it). The other sales panels do not, so this is consistency, not a rule break.

**S5 (Should): J-27 has two steps that are not walked through the product's own screens. The PR body does not claim `Completes: R1.27`.**
- It switches the web form on by SQL (#2556 is the screen).
- W2 posts the embed call with `fetch`; J-26 walks the embed by screens.
- Acceptable while #2556 is open, but swap the SQL for the settings screen once #2556 merges, before `Completes: R1.27`.

**Outside this screen (FO-2's API, for the record, not this PR's findings):**
- Use existing person on a person with an open lead leaves the new lead OPEN with `previous_lead_id` empty: J2 gave L-00049 and L-00050, both OPEN. AG-2-4 rules 5 and 7 (Link fields, "Combined into") are server behaviour, as the brief says.
- The details typed alongside Use existing person are dropped without a word.

## D1–D20 (independent reviewer, browser + code)
D1 3: rules 1, 6, 8 and 10 and BR-2 work. Rule 4 is partial (S1), and the check runs at Save instead of live while typing (still "before saving", as the concept says).
D2 3: one request id per panel; Enter twice and a double click each make one lead; two tabs saving the same new email make 1 person and the second tab sees the match; Read-only POST gets 403. But M2.
D3 4: reuses Panel, Field, `useSources`, `staffApi` and FO-2's route. There is no source master yet (AG-2-8 later).
D4 N/A: no dependent questions.
D5 4: after a 502 the input is kept and the retry saves once; a reopened panel is empty with a new request id; Escape returns focus to "Add a lead". S4.
D6 4: audit line `lead.created` "Lead L-00049 arrived by hand." with the staff actor.
D7 N/A: no AI.
D8 4: path Sales › Leads; panel title and description say whose lead it will be.
D9 3: 4 inputs plus Save; after saving it opens the new lead with the toast "Lead L-… added. You own it." M1 hides the choice.
D10 3: plain copy and "(optional)" in words; M2's raw code; S2's wording.
D11 4: busy button, field errors, notice on failure, toast.
D12 4: team components, one filled button, calm.
D13 3: axe finds 0 violations in the empty, match and error states (wcag2a/aa, 21, 22aa); full keyboard path (Tab order First name, Last name, Email, Phone, Source, Note, Cancel, Save); focus ring visible; no sideways scroll at 375, 400, 720, 1024 and 1440 px. M1 at 200 %.
D14 4: house Panel and the sales module's look.
D15 5: Leads first view 354-382 ms; panel opens in 77-104 ms; Save to the lead page 243-245 ms.
D16 4: pass and fail test per rule. Removing the client source check fails AL2 (the server's text differs). Zoom and suggestions are untested.
D17 simulated only. D18 3: the source shows on the lead; the match line does not say what matched (S1). D19 3: J-27 runs form, Leads, Add a lead, filter and lead page; the form switch is by SQL (S5). D20 simulated only.

## BIC scorecard (EXPERIENCE §6, the concept's 4c)
| Check | Score | Evidence |
|---|---|---|
| BIC-01/02/03/05/06/07/09/10/12/15/16/17 | N/A | no case facts, AI, documents, tasks or filing in this panel |
| BIC-04 | Met | "Last name (optional)", "First note (optional)"; hint "An email or a phone number is needed." (`fo4al-04-panel-1440.png`) |
| BIC-08 | N/A | the panel adds a lead; Leads' chips are part 1's |
| BIC-11 | Met | one filled button: "Save lead", or "Add as new" in the match state; "Use existing person" outlined |
| BIC-13 | Partly (Should) | errors shown on the field, input kept, client errors focused; no summary; S2 |
| BIC-14 | Partly (Should) | the match line has no tooltip (concept 4c); its visible sentence "Nothing is saved until you choose." covers the need to act |
| BIC-18 | Met | saving busy, "Something went wrong on our side. Please try again." with input kept, Read-only sees no button (and Leads' read-only reason line) |
| BIC-19 | Met | one heading, one primary, 3 type sizes, red only for errors, at 1440 and 1024 (`fo4al-04-panel-1024.png`) |
| BIC-20 | Partly (Must) | keyboard complete, focus visible, no sideways scroll; at 200 % zoom the match is off screen (M1) |

## Graph (P-86) and scope
- `graph.mjs` ran: G1 0, G4 0, G5 0. `POST /front-office/leads` is reached by tests. The check file is listed, but with `caps: []`: the graph models C-ids only, so R1.x items and `tests/journeys/` are not in it. That is a tool gap, not this PR's.
- Every element serves AG-2-4 (P-33).
- The SQL web-form switch is in J-27 setup only, not in the product path (S5).
- The listed limits (phone region, ⌘K, Interested in, referrer, marketing tick, rule 7) are not findings (P-26).

## Not checked
- A real screen reader: `role=status` on the match block is in the code but was not heard.
- A visible headed browser: walked headless with screenshots.
- An intended user's unaided walk (D17, D20 stay with the founder).
- The retrofit mapping of `KNOWN_PERSON`/`personId`/`confirmedNew` to the team's `confirmToken`/`createAnyway` is FO-2's to record; it is not in this PR.

## Re-review (P-277, diff only): `376411977` → `7e28235788c103904986ff474466cf0e17e40dde`
Read: `git diff 376411977 7e2823578 -- …/prototype` (`add-lead-panel.tsx`, `check_fo4al_add_lead_browser.ts`). Walked on :4534 (`xr_studio_screens_al2`, which serves this head). The new check was also run on a fresh copy of mine (:4441, since stopped): 26/26.
- **M1: fixed.** The match box takes focus and is in view.
  - 720×450: top 247 px, body bottom 389 px.
  - 1366×657: 454 px against 596 px.
  - "Add as new" now sits inside the box. Save lead is switched off while a match waits, and Enter on the box saves nothing (0 persons).
  - Tab from the box goes to "Use existing person". The new check asserts the box is on screen and focused, and nothing is saved.
- **M2: behaviour fixed, but its fail test does not fail without the fix (Major, still open).**
  - Live on :4534 the API still returns `WEBSITE`, and the datalist offers `["Email","Phone call","Walk-in","Referral"]`, so the fix works.
  - But `check_fo4al…:167-171` never makes a web-form lead. On a fresh copy (CI's case) the list has no `WEBSITE` to drop: my run printed `["Phone call","Walk-in","Email","Referral"]`, and the copy's leads were only Walk-in, Email, Referral, Phone call and "phone   CALL".
  - So the assertion passes even with `suggestions()` removed. That breaks STANDARDS §7 [M] (a rule's test fails when the rule is removed) and WAY-OF-WORKING step 4 (each Major fixed with a fail test).
  - **Fix:** create one web-form lead visible to the Case Officer first (switch the form on and submit as j_27 W1 does, or post it). Then assert `GET /front-office/leads/sources` includes `WEBSITE` before asserting the datalist does not.
- **Also checked in the diff, sound:**
  - B1 (choice moved into the box; the test clicks twice 250 ms apart and nothing is saved).
  - m1 (`fieldset disabled` while saving).
  - m3 (`fieldWords`: "required" becomes the panel's words; the emoji-only source gives "Pick a source.").
  - m4 (case and space twins offered once; the test is meaningful, since the adder owns "phone   CALL").
  - S4 (`confirmClose` on Escape, X and overlay; Cancel still closes at once, as the house `Dialog` guard does; tested).
- **Minor, new:** the focused match box has `outline-none`, so the keyboard user sees no ring on it. The box is plainly visible and the next Tab lands on a ringed button. Fix or list it.
- **Still open as Should, listed in the PR:** S1 (asked of the tech lead), S2 (the email message still gives no fix), S3, S5.
- **Journey score now 9/10:** next step 1, plain words ½ (S2), correct data 1, accessibility 1, trust ½ (S1).

**Verdict: Block** on `7e28235788c103904986ff474466cf0e17e40dde`. The one item: make the M2 test fail without the fix. A re-check will read only that test diff.
