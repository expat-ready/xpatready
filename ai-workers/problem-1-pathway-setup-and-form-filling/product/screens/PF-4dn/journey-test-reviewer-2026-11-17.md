# Journey test — PF-4dn, the invite carries the person's name (reviewer, 17 Nov 2026)

Commit `1d40c5fc3b0b13e3b3df67f3eacdf195e63f1dce`. Isolated copy `rvpf4dn` on :4574 (`PLATFORM_IDENTITY=local`, the Sample firms), stopped afterwards. I drove headless Chromium through what a person sees (labels, Tab, Enter) at 1440, 1024, 720 @2x (200 % zoom) and 400 px. Then I checked the data with SQL. Plan seats were lent for the run and given back.

## Journeys (persona: the firm's Owner on Team; the step across: the invitee accepting)
1. **Main, keyboard only**: open Invite people → type the email → Tab → type "Client C Staff" → Tab on to the roles (Case Officer is ticked first) → Send. Expected: one invitation with that name; after accept, Team lists "Client C Staff".
2. **Alternate**: two rows, a name on row 1 only (the builder's DW4 replay; I re-ran it). Row 2 sends no `displayName`.
3. **Empty**: no name. The invitee gets the part of the email before the @, as today (the DW3 replay).
4. **Error**: a pasted name with a zero-width space → Send.
5. **Recovery**: type only a name, then press Escape → asked "Discard the people you typed?".
6. **Sizes**: a 120-character name at 1024 px, at 200 % zoom and at 400 px.
7. **Break-it (API)**: 22 hostile names, plus resend and the DB check (listed in `review.md`).

## What held
* Focus goes in this order: Email, person 1 → Name, person 1 (optional) → roles. Axe (WCAG 2.2 A/AA) found 0 violations of any impact, and there were no page or console errors.
* Send took ~156 ms, and the panel closed and returned focus to a button. `platform_invitation.display_name` = "Client C Staff". After accept, Team shows "Client C Staff", once (`j1-team-after-accept.png`).
* The discard confirm counts a typed name (journey 5).
* No sideways scroll at any width. A 120-character name scrolls inside its field (325-485 px wide).
* Hindi "अनन्या शर्मा", 120 emoji, NBSP padding (trimmed to "Ana") and `<img onerror>` (shown as text) are all stored and accepted correctly. Bad names are refused before the seat check.
* Data: no name in any audit line or in `api.log`. The name is stored only in `platform_invitation` and `platform_staff`.

## Findings
* **Minor**: in journey 4, the refusal "The name has a line break or an invisible character…" appears under **Email, person 1**. The Email field gets `aria-invalid`, and the Name field is not linked to the message (`invite-panel.tsx:34`, `:52`, `:56`; screenshot j2). The input is kept.
* **Minor**: the Name field's `maxLength=120` counts UTF-16 units. A pasted 80-emoji name is cut to 60 code points, although the API accepts 120 (`invite-panel.tsx:57`).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: name typed → stored → staff member named → on Team |
| Next step obvious | 1 | the field sits under Email, "(optional)" in its label |
| Plain words | 1 | "Name, person 1 (optional)"; "The name is at most 120 characters." |
| Feedback and state | ½ | the name refusal shows on the Email field |
| Correct data | 1 | exact trimmed value stored once; NULL when blank; resend keeps it |
| Error recovery | ½ | input kept and the words are clear, but the error is on the wrong field |
| Accessibility and screen sizes | 1 | axe 0; keyboard path; 1024 / 200 % / 400 px have no sideways scroll |
| Speed | 1 | Team ~0.4 s, send ~0.16 s |
| Visual quality | 1 | team Field/Input, same spacing as Email (j4-1024) |
| Trust and sources | 1 | no AI; Sample data labelled "(Sample)" |
| **Total** | **9/10** | **Pass** (8 or more, no 0) |

To raise it, most valuable first: route `DISPLAY_NAME_*` refusals to the Name field.

## Could not test
* A real screen reader.
* An intended user's unaided walk (D17/D20 stay with the founder).
* The emailed link click: the local stand-in has no mailbox. Accept was called on the public route with a known token, the same stand-in the builder's test uses.
* The screenshots of this walk were kept only in the session scratchpad. They were not committed, because this run writes no files beyond these two reports.

## Re-check at b160ffe88 (diff-only)
Journey 4 again: I ran `check_pf4dn_invite_name` on :4574 with Name "Client​D" and pressed Send. The message now shows under **Name, person 1 (optional)**. The Name field has `aria-invalid=true` and Email does not, the input is kept and nothing is stored. With the fix reverted, this check fails. `maxLength` is removed, so an 80-emoji paste is no longer cut short and the API's 120-code-point rule is the only limit. Feedback and state: 1. Error recovery: 1. **Total 10/10, Pass.** This re-score rests on the scripted browser check, and I did not walk all of it again. The limits under "Could not test" still apply.
