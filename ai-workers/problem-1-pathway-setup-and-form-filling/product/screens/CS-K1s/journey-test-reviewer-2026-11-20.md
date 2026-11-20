# Journey test: CS-K1s (reviewer role, 20 Nov), SHA 47debd8c

Skill: journey-test, reviewer role. This is the one score for this check. App: an isolated copy on :4444 (`PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500`), live AI off, US$0. Web bundle rebuilt from the reviewed code. Exact-SHA runs used a `git archive` copy of 47debd8c, because the branch moved during the review (see review.md).
Sample data: won prospects made through the app's own engage and Convert routes. Names: "Walkthree Sample", "Zoë Ñúñez 李小龍 Sample", a 120-character double-barrelled name, "Noprog Sample" (no program), "Race Sample", "Reload Sample", "Persona-d Sample".

## Journeys (persona: a firm's case officer or representative, signed in to the firm)
1. **Main.** "Open the case for the client we just won." Cases → Clients → sign in → search → client page → Open the case → lands on the case. Keyboard only, 1440 px.
2. **Alternate.** The same at 1024 px and at 512 css px (200 %), with a non-English name and a very long name.
3. **Empty / no match.** Search for nobody, for "%", for a 250-character query.
4. **Error.** The offer was used meanwhile (two tabs press at once); a Convert undone meanwhile; a changed offer (409).
5. **Wrong role.** No `agent/case:show`; read-only (no create key); firm B on firm A's client by URL.
6. **Recovery.** Reload straight after pressing; browser Back from the case.
7. **Across the boundary.** Land on the case while "Acting as" is a different simulated person.

## What happened (walked like a person, screenshots in my scratchpad `walk/`)
* J1 worked:
  * Tab ×3 reaches "Clients" beside "Cases" in the header, and Enter opens it.
  * The sign-in card shows (`02-signin-1440.png`), and the list loads 78 ms after sign-in (`03-list-1440.png`).
  * Typing "Walkthree" filters to one row in 340 ms (300 ms of that is the debounce), and `?q=` is kept.
  * Tab then Enter on the name opens the client page with its card in 83 ms (`05-card-1440.png`). The card shows the program "Visitor visa", the principal (the client), and "Your firm's representative of record (the retainer names none)".
  * Tab then Enter on "Open the case" (visible focus ring, `05b`) lands on `/cases/<id>` in 171 ms, case content in 517 ms, toast "Case C-2026-00006 opened" (`06-landed-1440.png`).
  * Data: exactly 1 case, on the offer's combination, client login user-P, created_by user-R (the staff member), one `case.opened`, audit lines by `staff:<id>`.
  * Browser Back shows the client page with the case link and no card.
* J2 worked: no sideways scroll at 1024 px or at 512 css px (`10`, `11`, `12`, `13`). The long name wraps cleanly in the h1, the trail and the card. Searching "李小龍" and "CL-6" finds the client. "ñúñez" (lower case) finds nothing: the existing API's case folding, outside this diff.
* J3 worked: "No client matches "…"" names the search and offers Clear search. "%" is taken literally. The 250-character query shows the no-match state, not an error.
* J4 worked:
  * Two tabs pressed together: one lands; the other shows the server's USED words in `role="alert"`, the button turns off, and the Cases list refreshes to show the new case (`17-race-loser.png`). One case in the database.
  * Withdrawn and changed (row check DW4) show the opening's own words. No case.
* J5 held, through the row check and by URL:
  * No key: no menu entry, no-access page, API 403.
  * Read-only: the card shows "Ask someone who can open cases.", POST 403.
  * Firm B: "No such client"; offer and client reads both 404.
  * `/clients/not-a-uuid` and an unknown UUID: "No such client". `/clients/x/y`: "Page not found".
* J6 worked: reload straight after pressing gives 1 case, and the page shows the case and no card.
* **J7 failed (M1).** The case page reads the case as the simulated person.
  * Acting as Solo representative (firm B): "This case could not be opened · No such case." under the toast "Case … opened" (`land-user-S.png`).
  * Acting as Client A: "This page is for the case officer".
  * Acting as Configuration author (chosen): "Cases are worked by the firm".
  * With the default person it lands correctly.
* No-program win (`15-noprog-1024.png`): the card says why and shows no button. That is a dead end (review m1).
* axe WCAG 2.2 A/AA was clean on: sign-in card, list, client page with card, long-name card at 1024 px, no-program card, landed case page (plus the row check's no-access, other-firm and read-only pages). Page errors: none. Console errors: only the 404s and 409 I provoked.
* Replayed checks: `check_csk1s_clients_browser.ts` 31/31 twice, `j_72.ts` 31/31 twice (see review.md for which tree each ran on).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1 completes. J7 lands on "No such case" for a reachable picker state (M1) |
| Next step obvious | 1 | Menu entry, search, one named button; the list's subtitle says where cases open |
| Plain words | ½ | Clear words overall. "Open another case for the client instead" names a step the page lacks (m4); "Questionnaire login" is demo jargon on the card (m2) |
| Feedback and state | ½ | Skeletons, busy button, alerts and toast are good. M1 shows a success toast over a refusal |
| Correct data | 1 | One case per offer under double click, two tabs and reload; right program, representative, creator, event and audit |
| Error recovery | 1 | USED, WITHDRAWN and CHANGED are handled. The button turns off, cases refresh, the offer re-reads; Try again on load errors |
| Accessibility and screen sizes | 1 | Keyboard-only path; axe clean on 9 states; 1024, 1440 and 512 css px with no sideways scroll; h1 › h2 |
| Speed | 1 | Server reads 10-26 ms; first view under 100 ms; press → case content 517 ms |
| Visual quality | 1 | Team header, card and table; one primary per card. m3 ("None yet" wraps) is cosmetic |
| Trust and sources | 1 | The card says where the values came from (prospect number, how it was won); the server pre-fills from the same offer; no AI |
| **Total** | **8.5 / 10** | Pass (8 or more, no 0). The open Majors still block (review.md) |

**Fixes that would raise the low criteria, most valuable first:**
1. M1: act as the signed-in staff member before landing, or say why on a page with one button. This raises task completed and feedback.
2. m4: link to Cases under the USED alert.
3. m2: style the questionnaire-login row as demo chrome.

## Not tested
A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). The real `OFFER_CHANGED` race in a browser. 400 px width: the brief asks for 1024 and 1440, and I checked 512 css px instead.
