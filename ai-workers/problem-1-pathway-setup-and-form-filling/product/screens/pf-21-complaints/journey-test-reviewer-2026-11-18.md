# Journey test: PF-21s part 4 (the complaint record page's actions), reviewer role

Reviewer (fresh agent, did not build it) · commit `1a2e0b23272ecd9fbc0e46b6ac2a12e1ccc66d4f` (web and api identical to `67998d8cc`, which the copy serves) · PR #2134 · 18 Nov 2026, about 19:30 IST.
Copies: my own `review_pf21s` on :4573 (PLATFORM_IDENTITY=local, fresh database, Sample firms seeded) for the walks. The builder's :4571 was used for the suite re-run only. :4400 was never used.
Method: headless Playwright driven like a person (role and label locators, clicks, typing, Tab and Enter), with a screenshot at each decision point (scratchpad only). No visible browser pane was available in this session. Data was read from PostgreSQL after each journey.

## Journeys (written from concept §1, §4, §5 and the start sheet before walking)
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Owner: "take this complaint from received to closed" | List → Record a complaint (drawer) → record page → filled button four times → Back → Closed view | Filled button follows the state, one panel each, the timeline refreshes, the complaint is listed under Closed | **Held.** Buttons: ack → step → response → close, then only an outline "Add a note". Focus returned to the next filled button each time. Toasts. Listed under Closed. DB: `RECEIVED,ACKNOWLEDGED,STEP,RESPONSE_SENT,CLOSED`, with 5 audit lines (`complaint.record` … `complaint.close`) |
| J2 alternate | Owner: "they withdrew it the same day" | Quiet "Close with an outcome" → Withdrawn + note | Closes with no acknowledgement or step | Held (the suite and my walk) |
| J2b alternate | Owner: acknowledged, response sent, no step | Open the record | Concept §4: "response sent → Close with an outcome" | **Not as written.** The filled button is "Add a handling step" and Close is quiet (finding m1) |
| J3 error | Owner: bad input | Response dated before the acknowledgement; step with no note; close with no outcome or note; a step dated 1 Jan 2027 | The field error is shown on its field and in a summary, and what was typed is kept | Held. "the response comes after the acknowledgement", "this date is in the future". The summary takes focus |
| J4 wrong role | Case Manager on their own complaint; Case Officer handler with no key; Case Manager on the Owner's complaint by URL | Open, try the acts, force `/handler` and `/handlers` | No Change handler. The handler can act. Not found by URL. 403 when forced | Held. Acts are present and there is no Change handler. Not found. CO `POST /:id/handler` 403, `GET /handlers` 403 |
| J5 conflict | Owner in two tabs; or someone closes it while the panel is open | Tab A acknowledges, then tab B saves. Or close by API, then save a step | The refusal is shown in the panel. The page shows the truth: reload or merge (EXPERIENCE §4) | **Partly.** The words show in the panel ("Already acknowledged", or the closed words), and there is 1 ACKNOWLEDGED row. But after Cancel the page still says **Open**, with "Record the acknowledgement" filled and no new event. Clicking it again gets the same 409 (finding M1) |
| J6 recovery | Owner: impatient keyboard user | Enter ×3 on "Add the note"; reload with a panel open; Esc with typed text | One POST. Reload drops the panel. Esc asks before discarding | Held: 1 POST and 1 NOTE row. Reload: no panel, nothing saved. Esc: "Discard what you typed for "Add a note"?" |
| J7 break | Owner: long, non-English and markup text | A 3,989-character note with `<b>`, French, Chinese and Arabic. A 4,100-character paste | Stored exactly and shown as text. Capped at 4,000 | Held: stored length 3,989, markup shown as text, input capped at 4,000 |
| J8 keyboard, sizes | Owner: keyboard only at 1024, 512 (= 200 %), 375 | Tab from the heading, Enter, Tab through the panel, Enter, Esc | Reachable, focus visible, focus returned, no sideways scroll | Held: 1 Tab from the h1 to the filled button. The panel opens on When. Esc returns focus to the button. 512/375: the bar wraps, the panel's submit is in view, no sideways scroll, axe 0 |
| J9 boundary | Owner changes the handler; the old handler's page | Change handler → Case Officer. Then the Case Manager reopens it | The new handler is shown with both names on the timeline. The old handler gets Not found | Held. The picker is GET /handlers minus the present handler, with "(you)" marked |

## Replay as automated checks
The builder's suite `tests/check_pf21s_complaints_browser.ts` was re-run by me on :4571: **102/102, exit 0**, 36 s. It covers DW3, DW4, DW7, DW8, M3 for acts, keyboard, axe on every panel state, and 375/1024/1440. The rewritten screenshots were restored with `git checkout`. My two walk scripts are in the scratchpad (not committed): 0 page errors, and the console shows only the expected 4xx resource lines.

## Data underneath
Each act writes one event and one audit line, in order, by the signed-in staff member. The race (two tabs) and the triple Enter each left one row. Text was stored byte for byte. Roles were enforced on the server (the 403s above). Nothing else changed: the list counts moved by one view each.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 end to end, with the DB events and the audit |
| Next step obvious | ½ | One filled button named for the act (J1). But J2b points to an optional step after the response, and after a 409 the filled button repeats the refused act (J5) |
| Plain words | 1 | The concept's words, word for word. The forced 403 shows "(agent/complaint:read)" (off the main path) |
| Feedback and state | ½ | Busy button, toast, focus return, timeline refresh. After a 409 the page behind stays stale (J5, M1) |
| Correct data | 1 | Exactly one row per act, race and triple submit included; text exact |
| Error recovery | ½ | Field errors keep the typed text, and M3 brings the draft back. The 409 "add it as a note instead" needs a discard and retyping, on a page that still says Open |
| Accessibility and screen sizes | 1 | axe 0 on every state I opened, keyboard path, 375/512/1024/1440 |
| Speed | 1 | Panel opens in 34–57 ms, saves in 86–126 ms; list first view 329 ms |
| Visual quality | 1 | Team Panel, Button, Notice. One filled button per area (`record-next-step-1440.png`, `action-step-375.png`) |
| Trust and sources | 1 | The outcome list is marked "Sample list", the firm's zone is labelled, every event has who and when, and the handler change names both people |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0). Raise it by fixing M1 (feedback and state, error recovery, next step), then m1 |

## Could not test
A real screen reader. A visible-browser walk (headless only here). An intended user's unaided walk (D17 and D20 stay with the founder). The read-key-only person (no seeded role, part 3 m6). The React StrictMode dev build (r1's pattern, by reading only).

## Re-score at c72deb527 (18 Nov 2026, about 19:55 IST)
I re-walked J5 on my own rebuilt copy (:4573). The page behind a 409 is now true, and "Add it as a note" carries the text. J2b now fills Close. A new probe of the J1 acts with the browser clock shifted by `page.clock.setSystemTime`: at +300 ms, +1.5 s and +5 s the untouched default on acknowledge and close is refused with "When: this date is in the future" (review R1).
| Criterion | Score | Change |
|---|---|---|
| Task completed | ½ | was 1: with the clock ahead, the filled button's act fails until the person edits a date they never touched |
| Next step obvious | 1 | was ½: J2b fills Close; after a 409 the bar moves on |
| Feedback and state | ½ | unchanged score, new reason: "in the future" on an untouched default is wrong feedback (M1's stale page is fixed) |
| Error recovery | 1 | was ½: the record re-reads, and the note is carried over |
| Other six | 1 each | unchanged |
| **Total** | **9 / 10** | **Pass** (no 0). Raise it by fixing R1 |

## Re-score at e865fa38b (18 Nov 2026, about 20:05 IST)
Clock probe re-run on my rebuilt copy (:4573): the untouched default on acknowledge and close saves at +0 ms, +300 ms, +1.5 s, +5 s and +20 s (review R1 fixed).
| Criterion | Score | Change |
|---|---|---|
| Task completed | 1 | was ½: the filled button's act saves with the default whatever the browser clock |
| Feedback and state | 1 | was ½: no false "in the future" on an untouched field; the page is true after a refusal |
| Error recovery | ½ | was 1: breaker m6 (browser Back drops a panel's typed text without asking), now known and listed as a follow-up |
| Other seven | 1 each | unchanged |
| **Total** | **9.5 / 10** | **Pass** (no 0). Raise it with breaker m6 |
