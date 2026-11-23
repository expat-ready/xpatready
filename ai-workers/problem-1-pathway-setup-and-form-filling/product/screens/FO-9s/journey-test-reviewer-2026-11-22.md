# FO-9s part 1 journey test (reviewer role, 22 Nov 2026)

Head 4eda1fc4ebfe08f2989bf6e547a81b0657679add, isolated copy `rv_dup` on :4571, Sample people. The walks ran in headless Playwright (no display in this environment), using only what a person sees: typing, Tab, clicks and Enter. The data was then read through the API and SQL.

## Journeys (persona: a Case Officer adding a lead from a phone call)
| # | Goal in their words | Steps | Expected | Result |
|---|---|---|---|---|
| 1 main | "Lena rang again from a new email: add the lead on her record" | Type name and new email, Tab → hint → Use this person → keep ticked → Source → Add lead to Lena… | Lead on Lena's person; "Also gave: <email>" in the first note; no new person | Held (person id and note checked in the database) |
| 2 alternate | "Same name, different person" | Hint → Add as new → Save | One POST, no 409, a second person | Held |
| 3 empty | "A new caller" | First name "Lena" plus another email | No box | Held |
| 4 error | "The check is down" | Check route answers 500 | Nothing shown; Save still asks (409 box) | Held |
| 5 wrong role | "A colleague's client" | Email of the Case Manager's lead | The nameless line only, Add as new | Held |
| 6 recovery | "I picked the wrong one, then fixed the email" | Pick Lena, edit the email to Omar's, Save | Pick cleared, Save reads "Save lead", 409 asks, no `personId` sent | Held |
| 7 slow network | "Typing fast on a slow line" | First check delayed 2 s; edit keys while it is out | No stale hint; the newer details are sent after; the newest wins | Held |
| 8 long note | "A long first note plus the kept email" | 5000-character note, then Add lead to … | Error on the note, nothing sent; unticked, it saves | Held. The error stays after unticking (m3) |
| 9 keyboard | "No mouse" | Tab to Use this person, Enter, Tab on | Continue to Source | **Focus jumps to the dialog; the next Tab is Close (M2)** |
| 10 sizes | "On a laptop at 200 %" | 375 / 1024 / 1440 / 1024 at 200 %, long names | Everything wraps | Hint wraps; **after a pick the Save button runs off the panel (M1)** |

Step across the screen boundary: Save lands on the lead page with the right person's name (journeys 1, 2, 6).

## Automated replay
* Builder's `check_fo9s_duplicates_browser.ts`: 20/20, exit 0. Covers axe on the hint (clean) and 375/1024/1440 with no sideways scroll, using short names.
* FO-4al: 27/27, exit 0.
* Reviewer probe: 30/31 as expected; the failure is the missing persistent live region (m1).
* Timing: 792 ms from blur to hint, including the 400 ms wait.

## Break it
* Long spaced and unspaced names (M1).
* A 5000-character note (guard OK, m3).
* A slow route and a failed route (held, m4).
* Enter in Source after Add as new (sends `confirmedNew`, held).
* After a 409, a key edit (box gone, hint re-checks; one box).
* Not done: two tabs (the panel is per-request and the check is a read) and a hostile file (no upload here).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2, 6 saved as intended (database checked) |
| Next step obvious | 1 | One place to choose; Save names the person |
| Plain words | 1 | Board copy; "Same phone · Similar name (85%)" |
| Feedback and state | ½ | Live region unreliable (m1); stale note error (m3) |
| Correct data | 1 | Note text, person ids and counts exact |
| Error recovery | 1 | Failed check → Save still asks; edit after a pick clears it |
| Accessibility and screen sizes | ½ | M1, M2; axe clean |
| Speed | 1 | Under 1 s from blur to hint |
| Visual quality | ½ | Save button clipped with long names (M1) |
| Trust and sources | 1 | Reasons and score shown; hidden record nameless; no AI |

**8.5/10, pass (no 0).** To raise it: fix M2 (focus to Change), M1 (wrap the footer button), m1 (one persistent live region).

Not tested: a real screen reader, a visible browser, an intended user's unaided walk (D17 and D20 stay with the founder).
