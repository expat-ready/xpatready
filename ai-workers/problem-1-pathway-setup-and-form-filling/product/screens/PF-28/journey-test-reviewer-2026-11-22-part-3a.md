# PF-28 part 3a: journey test (reviewer, 22 Nov)

Head: cc4cf4e8053e6b68f33081fc01fed6d171e850a4 (PR #2909). Isolated copy `rev_pf28a` on :4489 (runtime ports; never :4400), `PLATFORM_IDENTITY=local`, seeded as the FO suites seed it (by running J-108 on it first). Live AI off; cost US$0. Script: the reviewer's own Playwright walk (session scratchpad, not committed), with axe-core WCAG 2.2 A/AA. It ran once: J1-J3 change one prospect for good (it ends Lost), so a second run would need a new record.

The diff changes no screen. The journeys walk the screens that call the routes it changed and that the builder's walk does not reach: Convert, Undo convert and Mark lost on the prospect page, the web-form settings saves, and the Leads and Pipeline-list filters.

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | A Case Manager converts a cleared prospect (keyboard, 1440 px) | Prospect page → Tab to "Convert to client", Enter → "Yes, convert to client", Enter | 200; the prospect is Won (CONVERTED) | Held: the screen sends `{version}`, which the new CONVERT schema takes; axe clean |
| J2 | Converted by mistake: undo it | "Undo convert" → "Yes" with no reason, then with a reason | Empty: refused on the page; with a reason: back to its stage | Held: the page refuses the empty reason itself, with no call; "Convert undone. P-00005 is back in Engaged." |
| J3 | The person chose another firm | "Mark lost" → submit with no reason → choose one, add a note → submit | "Choose why it was lost." at the field; then Lost | Held (screenshot `j3-lost-no-reason`): the note is sent, and `note: undefined` is left out |
| J4 | The Owner limits the web form to a site (1024 px) | Web form → Add a site → `https://walk.example.org` → Save sites; Switch off, then on | "Saved. 2 sites can show this form."; switched twice, back where it was | Held: `{sites, version}` and `{enabled, version}` pass SITES and ENABLED; axe clean; no sideways scroll |
| J5 | A Case Manager narrows Leads (400 px) | `/front-office/leads?view=all&source=WEBSITE&from=…&to=…` | The list loads | Held: 200, no sideways scroll |
| J6 | The Pipeline list, filtered | `?view=list&stage=LOST&from&to&source` | The lost prospect is listed | Held |
| — | Across all three widths | — | No front-office call refused, no page error | Held: no 4xx or 5xx from `/api/front-office/*` during the walk |

## Data underneath
For the walked lead and prospect, `audit_event` holds: `prospect.won` ×2 and `prospect.unconverted` ×2 (one API round as setup, one by screens), `prospect.lost` ×1, `client.created` ×1 (the second Convert reused the client), `call.logged` ×1, `note.added` ×1, `lead.created` ×1. The prospect ends Lost with the chosen reason. The web form keeps both sites and ends enabled as it started.

## Break it (by API, about 15 minutes)
- **Found (Major, review M1).** `POST prospects/:id/convert` with `{}` or no body now gives **422 `version: Invalid input`**. On main the same call converts (200), because the service treats the version as optional (`prospects.ts:241-248`). Five checked-in callers send `{}`. J-108 on this head gives **13/15**: "setup … [422,201]" fails, and so does W2, because the setup client was never made.
- **Found (Minor, review m1).** A missing or wrong-typed `version` (convert `{}`, convert `{"version":true}`) says "Invalid input", where every other field says "This is required." or "This must be …".
- An upper-case prospect id: `idParam` lower-cases it and the prospect is found (409 STALE for an old version, then 200 with the current one).
- Not a uuid gives 404 "No such prospect in your firm." before the body is read. `{}` on an unknown lead's close gives 422 `reasonId: This is required.` before the lookup. That tells nothing about the lead, because the schema never reads the database.
- A repeated `?view=` gives 422 "This must be text." A repeated `?source=` gives 200. `?cursor=` on prospects gives 422 naming it. An unknown source on the prospects list and on the corporate board gives 422 UNKNOWN_SOURCE with `allowed` and `fields.source`.
- Text and type checks: `seconds: "30"` gives 422 "This must be a number." A 21,000-character note gives 422 "at most 20000 characters". `__proto__` gives 422. Assign with `staffId: null` keeps the service's own words.
- No 500 on any changed route. One 500 came first: `POST /leads` on the copy before the FO seed ran (P2003 in `arrival.ts:63`, a missing front-office firm row). That is an unseeded copy, not this diff: the same call is 201 once the FO seed has run.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J6 all done by screens |
| Next step obvious | 1 | Each panel names its action; toasts say what happened |
| Plain words | 1 | On screen, every message was the page's own words. The API's "Invalid input" is m1, and no screen shows it |
| Feedback and state | 1 | Toasts and notices after each save; the stage updates in place |
| Correct data | 1 | The audit lines and the final states above |
| Error recovery | 1 | No reason or an empty undo is refused at the field, and the retry saves |
| Accessibility and sizes | 1 | axe clean on the prospect page and web-form settings; 400, 1024 and 1440 px with no sideways scroll; Convert by keyboard |
| Speed | ½ | Nothing felt slow, but no step was timed against STANDARDS §9 |
| Visual quality | 1 | Screenshots are unchanged from main's look |
| Trust and sources | 1 | No AI or official value here; N/A, scored as met |
| **Total** | **9.5/10, pass** | |

The score is for the screens. The broken callers (M1) are scored in the review, not here.

## Not tested
A real screen reader, and an intended user's unaided walk (D17/D20 stay with the founder). Call and note logging by screens: no screen sends them; they were probed by API only.
