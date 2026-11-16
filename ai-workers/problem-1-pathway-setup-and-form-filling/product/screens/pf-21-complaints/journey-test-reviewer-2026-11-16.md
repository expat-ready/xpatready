# Journey test: PF-21s part 3 (complaints list, record drawer, read-only record page), reviewer

Reviewer role (the one score for this check) · commit `e47fa19fc` · isolated copy :4571 (`xr_studio_screens_pf21s`, PLATFORM_IDENTITY=local) · 16 Nov 2026.
Method: headless Chromium driven like a person (Tab, Enter, arrows, typing; no API shortcuts inside a journey). The DB and API were read underneath. Scripts: scratchpad only, not committed. The builder's suite `check_pf21s_complaints_browser.ts` re-run: 54/54.

## Journeys (from concept §1, §3, §5, §6)
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | Owner · "what needs acknowledging?" | List → Tab to Overdue chip (7 Tabs) → Enter → Tab to first row (4) → Enter → read → browser Back | Overdue view in the address, the record says Needs you with days late, Back keeps the view | Held. First view 421 ms, 3 requests |
| J2 | Owner · record a complaint, keyboard only | Tab to "Record a complaint" (5) → type name "Zoë Ñúñez-Øberg 张伟 …", contact, keep the date, arrows in both selects, French and Japanese summary → Tab ×3 → Enter | Opens the new record; stored exactly | Held. DB matches exactly; 11:10 typed = 11:10 America/Toronto; 1 RECEIVED event; 1 audit line; toast "Complaint recorded." Focus lands on `<body>` (m3) |
| J3 | Owner · double click the save | click twice at 30/80/150 ms; Enter twice at 60/120 ms; Playwright `dblclick` and Enter twice at 0 ms | One complaint | 1 row at every human gap; **2 rows** at 0 ms (m4) |
| J4 | Owner · bad input | no name; future date (2030); empty date; 250-character name | Field errors with summary, typed text kept | Held. "Their name: the person's name is needed", "Received: this date is in the future", "a real date and time…". Name capped at 200. Esc with typed text asks "Discard the complaint you started?" Summary not focused or linked (m5) |
| J5 | Case Officer handler, no key · see their own | Owner records one for the Case Officer (186-character name) → Case Officer opens the list and the record | Own row only, "Complaints you handle.", no Record button, long name cut in table, wrapped on record | Held, no sideways scroll |
| J6 | Case Officer · wrong role by URL | Open the Owner's complaint id; API GET, `/handlers`, POST | Not found words; server refuses | Held: page Not found; API 404 / 403 / 403 |
| J7 | Owner · linked kind from the address | `?frontOfficePerson=<id>&name=Prospect C` | Drawer opens with that kind preset and name filled | Held (the service accepted a made-up id: PF-21's concern, outside this diff) |
| J8 | Owner · 200 % zoom at 1024 (512 px) and 375 px | List, drawer, record | No sideways page scroll; drawer fits | Held at both |
| J9 | Owner · past 100 complaints | List All → Show more | Counts honest, paging complete | Paging held (100 → 146 unique). Chips read Overdue "0+", Closed "0+" (m8) |
| J10 | Across the boundary · after recording, act on it | Open own overdue record | Next step to acknowledge | Not in this part (DW3, part 4): "Needs you" shows with no button yet |

## Data underneath
One `plat_complaint` row per save at human speeds, with the values exactly as typed. One RECEIVED event and one `audit_event` row per record. Server roles enforced (J6). No per-row requests (J1).

## Score (QUALITY "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J5, J6 done unaided by keyboard |
| Next step obvious | ½ | list and drawer clear; the record page's "Needs you" has no action until part 4 (J10) |
| Plain words | 1 | concept §5 words on screen; no ids on the main path |
| Feedback and state | 1 | busy button, toasts, skeleton, "…" counts while loading, errors on fields |
| Correct data | 1 | J2 exact values, zone, event and audit; zero-gap duplicate noted (m4) |
| Error recovery | 1 | typed text kept, Try again, Esc confirm, reload/Back keep the view |
| Accessibility and screen sizes | ½ | axe clean on every state, all widths fine; focus on `<body>` after navigation (m3), `title`-only tooltips (m2), summary not focused (m5) |
| Speed | 1 | 421 ms first view, 3 requests |
| Visual quality | 1 | team look; `screenshots/list-1440.png`, `record-1024.png` |
| Trust and sources | 1 | Sample marks per list and period, "Unconfirmed: no counsel" in How it works, firm zone labelled; outcome lacks its mark (m7) |
| **Total** | **9/10** | **Pass** (8+, no 0) |

To raise it: move focus to the record's heading after navigation, and use the team tooltip on the Overdue chip and status (accessibility). Part 4's next-step bar closes "next step obvious".

## Could not test
A real screen reader. An intended user's unaided walk (D17/D20 stay with the founder). `reminderScheduled: false`. A real front-office or case-party id. Two tabs saving the same record: there are no edits in this part.

## Re-score after e80bd9c08 (16 Nov 2026, the diff only)
| # | Journey | Result |
|---|---|---|
| J3 | Double click / three clicks in one tick / two `requestSubmit` | 1 row each (was 2 at 0 ms) |
| J9 | Past one page (`next` forced) | Chips `Open · Overdue · Closed · All 100+`, no "0+" |
| J11 | Case Manager types a complaint, session ends (signed in elsewhere; and expiry), signs in again | Drawer back with what was typed, "not recorded yet", 0 rows recorded; Escape asks |
| J12 | Same tab, a different person signs in after J11 | No drawer, blank form, no notice, no earlier text (held) |
| J2/J4 | Focus after recording / after field errors | `h1` / the error summary (was `<body>` / the button) |
Correct data now 1 (zero-gap duplicate gone). Accessibility and screen sizes stays ½: `title`-only tooltips (m2), and the restored notice is not announced (r4). Next step obvious stays ½ (part 4). **Total 9/10, Pass.** Dev-only StrictMode loss of the draft: review r1.
