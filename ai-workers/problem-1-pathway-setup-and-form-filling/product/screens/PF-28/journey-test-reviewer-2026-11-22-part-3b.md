# PF-28 part 3b: journey test (reviewer, 22 Nov)

Head: eb471eee22837d55191194a2edddeef45cf9e429 (PR #2931).
- **Copy:** isolated `rev_pf28b` on :4490 (runtime ports; never :4400), `PLATFORM_IDENTITY=local`.
- **Seed:** `seedSampleFirms` and `seedSampleFirmsFrontOffice`, then the Sample web form switched on with a Sample consent wording and the allowed site `https://firm.example`.
- **Cost:** live AI off; US$0.
- **Scripts:** the reviewer's own Playwright walk, with axe-core WCAG 2.2 A/AA, and an API probe script. Both are in the session scratchpad and not committed.
- **Suites:** the five browser suites for these screens, each on a fresh copy of this head.

The diff changes no screen. The journeys walk the screens that call 3b's routes, and favour the ones the builder's walk does not reach: the value panel and the identity panel. They also send the hosted form by keyboard.

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | A Representative sets a prospect's value (1024 px, keyboard open) | Prospect page → focus "Set value", Enter → Amount "12abc" → Save value → "1500" → Save value | A field error in the page's words, then CAD 1,500 | Held: "Enter an amount of 0 or more, with at most 2 decimal places." under Amount. Saved 150000 cents; axe clean; no sideways scroll |
| J2 | The same at 1440 px with cents | "2750.50" | CAD 2,750.50 | Held: 275050 cents |
| J3 | The Representative records an identity check | Identity check → Record a check → Method In person, Name and Email ticked → Save check | One check (multipart, `details` comma-joined) | Held: one row; fo13s_identity_browser 36/36 covers the rest of the panel |
| J4 | A visitor who is already known sends the hosted form (1024 px, keyboard only) | Type the first name, Tab to Email, type it, Enter on "Send my enquiry" | The same thank-you as for a new person | Held in 2.7 s, which includes the form's 2 s hold. The API probe shows the known and new answers are byte-identical |
| J5 | An embedded form with a campaign | fo4b_embed_browser and the API probe with the embed's attribution keys | The lead keeps its campaign | Held: 45/45; `google\|GCLID` stored |
| J6 | Conflict check: drawer, then the confirm page | fo13s_conflict_browser | Saved; the manager confirms | Held: 41/41 |
| J7 | Add a lead with the duplicate hint | fo9s_duplicates_browser | Hint shown; Save works | Held: 32/32 |
| J8 | Hosted form, stale page | fo4_sales_browser "BR-3 reload" | The page is redrawn, the answers kept, the tick cleared | Held: 47/47 |
| — | Across J1-J4 | — | No front-office call refused (except J1's deliberate bad amount), no page error | Held |

## Data underneath
- The value is stored in exact cents for each save: 150000, then 275050.
- The identity check is one row for the person.
- The web-form lead holds its attribution. The honeypot post and every refused post stored no lead (the count of `fo_lead` was unchanged).
- The conflict check is recorded as one 201 ("Conflict check recorded.").

## Break it (by API, about 15 minutes)
- **Found (Major, review M1).** fo13i_identity has 7 failures, fo13c_conflict 2 and fo2_leads_prospects 2. They still expect 400 where the PR now answers 422 (the intended change), and the PR leaves them as they were.
- **Found (Minor, review m1).** `PATCH prospects/:id {"value":true}` and an identity `details[a]` both say "Invalid input". No screen shows these.
- **Found (Minor, review m2).** `PATCH people/not-a-uuid {"x":1}` gives 422, not the one not-found.
- **Public door:**
  - An unknown token gives 404 with or without junk.
  - An off-site post gives 403.
  - A forged stamp gives 400 RELOAD.
  - `consent: "yes"`, `attribution.fbp` and `__proto__` each give 422 naming the field.
  - The body `5` gives 400 BODY_NOT_JSON.
- **Staff routes:**
  - Non-uuid ids on confirm, list, change-type, role and value each give 404 with the right noun.
  - `eligibleStaffIds: "x"` gives 422 "This must be a list.".
  - A GET answer sent back to lead-sharing gives 200.
- No 500 anywhere.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J8 done by screens |
| Next step obvious | 1 | Each panel names its action; toasts say what happened |
| Plain words | 1 | On screen, every message is the page's or service's own sentence. "Invalid input" (m1) shows only from the API |
| Feedback and state | 1 | Errors appear at the field; the value updates in place; "Conflict check recorded." |
| Correct data | 1 | Cents, rows and attribution as above |
| Error recovery | 1 | The bad amount is corrected in the same panel and saves |
| Accessibility and sizes | 1 | axe clean on the value dialog at 1024 and 1440 px; no sideways scroll; J1 and J4 by keyboard |
| Speed | ½ | Only J4 was timed (2.7 s, including the 2 s hold); no other step was timed against STANDARDS §9 |
| Visual quality | 1 | Screenshots match main's look |
| Trust and sources | 1 | No AI or official value here; N/A, scored as met |
| **Total** | **9.5/10, pass** | |

The score is for the screens. The red suites (M1) are scored in the review, not here.

## Not tested
- A real screen reader, and an intended user's unaided walk (D17/D20 stay with the founder).
- Assignment rules and lead sharing: no screen calls them yet, so they were probed by API only.
- Company match, change-type and contacts: no screen sends them, so they were probed by API only.
