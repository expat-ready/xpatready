# J-45 journey test (reviewer), 25 Nov: R1.45 firm templates, field picker, real-record preview

Head `1a3c28f46f468bcb8e3da0160f27ea2f3e3fddb4` (PR #3645, test-only; product from #3179 on main). Isolated copy `j45r` on :4457
(`xr_studio_j45r`, PLATFORM_IDENTITY=local, AI off, US$0, Sample data). Never :4400 or :4455. The builder's j_45 seeded the
copy; the reviewer's own Playwright walk (headless Chromium, scratch script, not committed) then ran as a person would.

## Journeys (persona · goal · expected)
1. Owner · "change our follow-up and put the lead's number in" · My account → Templates → Open Going-cold nudge, keyboard only at
   1024 px: Ctrl+End, type, Tab to Insert field, arrow keys to "Lead number", Tab, Enter → `{{ lead_number }}` at the cursor.
2. Owner · "see it as a real lead would" · type "Rahimi" in "Preview with a real lead", Tab to the result, Enter → "Shown as Noor
   Rahimi… (L-00001)", "Dear Noor,"; "Use the Sample lead" goes back to "Dear Amira,".
3. Owner · "publish it" · Tab to Publish, Enter → "Published: version 1. …", focus moves to the notice.
4. Owner, error · type `{{ passport_number }}` in the message → preview "[not a field: {{ passport_number }}]"; Publish → "Not
   published. {{ passport_number }} is not a field of this message. Insert fields from the list.", the field red, text kept.
5. Owner, error · subject `Hi {{ Lead_First_Name }}` → refused on the subject (aria-invalid); subject with a lone `{{` → "Remove the
   lone {{ or }}: insert fields from the list."
6. Owner, recovery · remove the unknown field, Publish → version n+1; list says "Your wording, version n+1" (j_45 W3).
7. Case Officer, wrong role · same editor: "You can read this wording. Only an Owner or Admin can change it."; searching the
   Owner's lead → "No lead you may open matches."; API lead read and preview with its id → 404.
8. Sizes · editor with a real-lead preview at 400, 1024, 1440 and 512 px (1024 at 200 %).
9. Boundary · the walk ends at R1.46's plain text box (j_45 W5).

## What held
* All nine journeys completed as expected. j_45: 13/13 three times (fresh, rerun on the same copy, fresh again).
* Data underneath: one new `msg_template_version` per publish, body exactly as typed, none on a refusal (j_45 W3).
* Rules fail when removed (reviewer mutations, restored): unknown-field check, lead search visibility, lead values visibility.
* axe WCAG 2.2 A/AA: 0 violations at 400, 1024, the refused state and the Case Officer state; no sideways scroll at 400, 512,
  1024, 1440. Console: only the expected 422 resource lines on refusals; no page error.
* Speed: editor and preview shown 204 ms after navigation; preview refresh within the 250 ms debounce.

## Break pass (about 15 min)
Wrong-case field, lone braces, unknown field in the subject: all refused by name on their field. Case Officer by URL: read-only,
no Insert field, no Publish. Rerun on a used copy: passes. A stored version holding an unknown field can only come from a
mutated build (seen after mutation 1: the next run's W3 pass fails); not reachable in the product. No Blocker, no Major.

## Findings
* Minor: preview values are padded spans, so "Dear  Amira ," reads as a space before the comma (`templates-page.tsx:56`, #3179).
* Minor: the refusal summary sits below Publish, not at the top (`templates-page.tsx:202-204`); focus moves to it, so it is found.
* Minor (test): j_45 axe at one state only, console errors not collected, W4 real-lead state not asserted (`review.md` m1, m2, m4).
* Minor (evidence): the W3 full-page screenshot shows the sticky header painted mid-page (`review.md` m6).

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-9; j_45 13/13 ×3 |
| Next step obvious | 1 | Insert field hint "Goes in where the cursor was"; Publish line "Publishing makes this the wording used…" |
| Plain words | 1 | "is not a field of this message. Insert fields from the list."; "No lead you may open matches." |
| Feedback and state | 1 | "Unpublished changes", "[not a field: …]" live, "Published: version n" focused |
| Correct data | 1 | Stored body equals typed text; nothing stored on refusal; 404 leaks no lead data |
| Error recovery | 1 | Typed text kept after 422; remove the field, publish succeeds |
| Accessibility and screen sizes | 1 | axe 0 at 400/1024/1440 and two error states; keyboard-only path; 200 % zoom fits |
| Speed | 1 | 204 ms to editor and preview |
| Visual quality | ½ | Value padding before punctuation; Insert button sits a hint row below the select |
| Trust and sources | 1 | "Shown as Noor Rahimi… (L-00001)"; Sample lead "(made-up details)"; starter marked Sample |
| **Total** | **9½/10** | **Pass (8+, no 0)** |

To raise visual quality: draw preview values without side padding (or with a background only), and align Insert with the select.

## Could not test
A real screen reader; an intended user's unaided walk (D17, D20 with the founder); CI on this head.
