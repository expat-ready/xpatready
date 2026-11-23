# PF-19s journey test (reviewer role), 23 Nov

Commit `e263986fc8dc16c794b003d3466e612b9b4eb190`. Isolated copy :4464 (`xr_studio_rev_pf19s`), AI off, `PLATFORM_IDENTITY=local`, seeded by the
suite (28/28 passed first). Walk: Playwright with the installed Chromium, using what a person sees (labels, buttons). Screenshots were kept outside
the repository (reviewer's scratchpad), so they are not linked here.

## Journeys (persona · goal · result)
| # | Persona · goal | Steps | Result |
|---|---|---|---|
| J1 main | Firm Owner · "make the going-cold nudge sound like us and see it as Amira will" | My account menu → Templates → Open Going-cold nudge → End of subject, type ", " → Insert field "Lead's first name" → replace message with French/Chinese/✓ text and `{{ owner_name }}` → Preview with a real lead "Amira" → Publish | Held. Menu has Templates; field put at the cursor in the subject, focus back in the subject; preview "Subject: Are you still planning your move?, Amira", owner filled "Representative (Sample)"; "Published: version 2 …", focus on the notice; API returns the typed subject exactly |
| J2 alternate | Owner · "never mind" | Edit, Discard changes, confirm | Held: wording back to the published version, "Changes discarded. Nothing was published." |
| J3 error | Owner · bad input | Empty subject + `{{lead_first_name}} {{ Lead_Name }}`; then a 240-character subject; API 10,001-character body; U+2028 in subject | Held: "Write a subject." on Subject (aria-invalid, described), "{{ Lead_Name }} is not a field of this message. Insert fields from the list." on Message; "The subject is 240 characters; at most 200."; 422 for both API cases on the right field. Nothing stored |
| J4 conflict | Two Owner tabs | Tab 2 publishes, tab 1 publishes from the old version, then reloads | Held: tab 1 "Someone published version 3 … your wording was not saved."; reload asks first (beforeunload) then shows version 3. Tab 1's wording is lost (no copy kept) |
| J5 wrong role | Case Officer by URL | Open `/platform/templates/lead.going_cold`; API PUT; records search for the Owner's lead | Held: read-only notice, no Publish; PUT 403; records `[]`; no token 401 |
| J6 recovery | Owner · double click | Double-click Publish | Held: exactly one new version and one audit line |
| J7 boundary | Next screen: the send | DB read of the send path's lookup (suite T4) | Firm version picked; no automation sends these keys yet (B1 deferred) |
| J8 sizes | Owner at 1024 px and 1024 px 200 % zoom | Open editor | No sideways scroll, axe 0 violations; preview beside at 1024, stacked under at zoom |
| J9 keyboard | Owner | Tab through the list | Logical order: header, menu, search, table, Open links; suite T6 covers keyboard-only publish |

## Data underneath
Versions per template = audit lines (going_cold 3, follow_up 2; 5 `platform.template.publish` lines, each "version n published", no wording).
Values stored exactly as typed (subject trimmed, CRLF → LF). Role refusals happen on the server (403/404), not only in the page.

## Break it
Markup in a lead's name shows as text, nothing runs (suite T3). Unicode and emoji round-trip. Two parallel PUTs from one base: one 200, one
409, one version (suite T4). Stray `{{` and dotted names refused. Unknown template key → "No such template" / 404. No page errors; console
shows only the expected 422/409 network lines.

## Findings (all Minor; details and fixes in `review.md`)
1. Send-path test copies the query instead of calling the send (`tests/check_pf19s_templates_browser.ts:217-219`).
2. One-off hex colours (`templates-page.tsx:55,57,95`).
3. Graph shows the template routes untested and no capability named (`product/qa/graph.json`).
4. Discard uses `window.confirm` (`templates-page.tsx:197`).
5. Trailing control character in the subject refused instead of trimmed (`templates.ts:141`).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 published version 2 with the typed wording |
| Next step obvious | 1 | Menu → Open → Publish; one primary button |
| Plain words | 1 | Errors say what and how to fix; "[missing: …]" |
| Feedback and state | 1 | Unpublished changes, Published: version n, focus moved |
| Correct data | 1 | Versions = audits 1:1; values as typed; double-click one version |
| Error recovery | ½ | Field errors good; after a 409 the typed wording is lost on reload |
| Accessibility and screen sizes | 1 | axe 0 at 375/1024/1440 and 200 %; keyboard path |
| Speed | 1 | API 10–21 ms; editor 41 ms after Open (first cold page load 2.0 s including the dev server) |
| Visual quality | ½ | Team look; one-off colours; Insert button sits below the select line |
| Trust and sources | 1 | ExpatReady's/Your wording, Sample wording and Sample lead labelled; no AI |
| **Total** | **9/10** | **Pass** (≥ 8, no 0) |

To raise: keep the typed wording beside the conflict notice (copy or merge); team tokens for the marks and align Insert with the select.

## Not tested
A real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); a real email transport.
