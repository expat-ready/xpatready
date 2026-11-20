# Journey test (reviewer), FO-9b phone doors, 20 Nov

Reviewer agent, commit `4bdf017a991d0fadd2b43235462b336a6c8e0465`. Copies ran in isolation on :4434 (`isolated.sh rev9b 4434 … PLATFORM_IDENTITY=local`), headless Chromium at /opt/pw-browsers/chromium. US$0, no model call, nothing priced. I drove the browser with a scratch Playwright script (not committed). Screenshots are in the session scratchpad (`…/scratchpad/shots/`) and are not committed.

## Journeys (written from the brief and P-747 before walking)
1. **Main, booker (client):** "I want a phone consultation; I only know my local number." Book a phone call with "555 0101". Expected: booked, told the firm will call that number; the lead shows the number with "Fix number".
2. **Alternate, same person by two doors:** web form with "+44 (0)20 7946 0958", then booking with "0044 20 7946 0958". Expected: both stored +442079460958, and a possible match on the booking's lead. This is J-33 W5, which I re-ran: 19/19.
3. **Error, booker:** choose Phone call and leave the phone blank (spaces only). Expected: refused on the field, nothing booked.
4. **Keyboard only at 1024 px:** book a phone call with "0044 20 7946 0958" using Tab, arrows and Enter only.
5. **Screen sizes:** the details form at 400, 720 (1440 at 200 %) and 1024 px.
6. **Recovery, double click:** double-click "Book this time" with "+999 123".
7. **Break, junk numbers:** two visitors send the public web form with "000-000-0000" and "0000000000", and one with "123 456 7890".
8. **Wrong door, staff edit:** the edit route still refuses an impossible number (check E and J-33 W2, re-run green).

## What happened
| # | Result | Data underneath |
|---|---|---|
| 1 | Booked. The confirmation reads "The firm will call you on 555 0101." The lead page shows "Phone 555 0101 · Fix number · Edit", Source "Booking page". axe 0 on details and booked (`J1-*.png`) | `555 0101|false|-`, 1 person, 1 booking, 1 lead |
| 2 | J-33 W5 PASS: the booking's lead says "Possible match: Wynn… Webform (L-00002)", and the number shows in E.164 | both `+442079460958`; `possible_match_person_id` = the web-form person |
| 3 | The field sentence "Enter a phone number with its country code, e.g. +1 416 555 0100." appears; nothing is booked; axe 0 | none made |
| 4 | Every field, the Phone call radio (arrow keys) and the button were reached by keyboard. Booked | `+442079460958|true` |
| 5 | No sideways scroll at 400, 720 or 1024 px | n/a |
| 6 | One confirmation | 1 booking; `+999 123|false` |
| 7 | **Both junk numbers are stored readable, with no "Fix number", and the second lead says "Possible match: Junk1… (L-00004)"** (`J6-junk-possible-match-1440.png`) | `+10000000000|true` twice; `+11234567890|true` |
| 8 | 422 with the field sentence; nothing saved | unchanged |

No page errors and no console errors across the walk.

## Findings
* **Major (journey 7):** impossible North American numbers are read as readable at the FO-2 doors and booking (`duplicates/phone.ts:24,27`, `isPossible()` checks length only). Strangers who type a placeholder number are matched to each other, and staff are never asked to fix it. On main these were unreadable. Details and the fix are in `review.md` M1.
* Not caused by this PR, noted only: after the blank-phone error (journey 3), focus stays on the button instead of moving to the field. Booking submit took 2.8 s on a cold copy (journey 1); STANDARDS §9 sets no budget for submit.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J4 all booked; W5 matched |
| Next step obvious | 1 | "Fix number" on an unreadable number; "Possible match" line |
| Plain words | 1 | Hint, field sentence and confirmation are plain |
| Feedback and state | 1 | Confirmation names the number; pill on the lead |
| Correct data | ½ | Junk numbers stored readable and falsely matched (J7) |
| Error recovery | ½ | Field error shown and nothing booked; focus is not moved to the field (pre-existing) |
| Accessibility and screen sizes | 1 | axe 0 on 3 states; 400/720/1024 px no sideways scroll; keyboard-only booking |
| Speed | ½ | 2.8 s from click to confirmation on a cold isolated copy |
| Visual quality | 1 | `J1-details-1440.png`, `J1-lead-fix-number-1440.png` |
| Trust and sources | 1 | No AI; the lead shows "Source Booking page"; Sample labelled |
| **Total** | **8.5 / 10** | Pass (8 or more, no 0) |

To raise it, most valuable first: fix M1 (correct data); move focus to the first invalid field on the booking form (error recovery; a separate item, not this PR's scope).

## Could not test
A real screen reader; an intended user's unaided walk (D17/D20 with the founder); GitHub's `walks` runner.
