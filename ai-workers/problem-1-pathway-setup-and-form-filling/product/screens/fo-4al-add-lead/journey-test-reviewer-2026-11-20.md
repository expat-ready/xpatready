# Journey test: FO-4 Add a lead (R1.27, QA-606), reviewer role, 20 Nov 2026

- PR #2612. Code commit `376411977`; head `6f34d1d8b` adds only screenshots.
- Copy: isolated `:4531` (`xr_studio_screens_al`), never :4400. Headless Chromium `/opt/pw-browsers/chromium`, walked by clicking and typing what a person sees.
- Data read underneath with psql. Live AI off, US$0.
- The walk scripts were throwaway session files, not committed. The steps and measurements are written out below, so anyone can re-walk them.

## Journeys (written from the concept and AG-2-4 before walking)
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Case Officer: "record this caller" | Leads › Add a lead › first name, last name, phone `+1 416 555 01xx`, source "Phone call", note › Save lead | lead MANUAL, source as typed, owned by me, lands on it | Held. L-00049: MANUAL, "Phone call", owner = Case Officer, phone stored `+14165550183`, note row written, audit `lead.created` "Lead L-00049 arrived by hand.". Toast "Lead L-00049 added. You own it." The lead page shows Source Phone call and Owner. |
| J2 alternate | same caller rings again, number typed as `(416) 555-0183` | Save › match › Use existing person | match shown, nothing saved until I choose; no new person | Held. "Possible match: Rosa… Walker (L-00049)". After Use existing person: 0 new persons, L-00050 on the same person. |
| J3 error | Case Officer types badly | (a) Save with all fields empty; (b) email `bad@`; (c) server returns 502 | errors on the fields, input kept, retry works | (a) "Enter a first name." · "Add an email or a phone number." · "Pick a source.", focus on First name. (b) "Not an email address." on Email, input kept, but focus not moved and no fix given (S2). (c) "Something went wrong on our side. Please try again.", input kept; the retry saved exactly one lead. |
| J4 empty source | AG-2-4 test 3 | Save without source | "Pick a source.", nothing saved | Held (also in AL2 and J-27 W3) |
| J5 wrong role | Read-only person | open Leads; POST the route | no button; server refuses | Held: 0 buttons; POST 403. Case Manager on Unassigned sees the button. |
| J6 recovery | half-typed, presses Escape, reopens; double submit | Escape › reopen; Enter twice | focus back on the opener, panel empty; one lead | Held: focus returns to "Add a lead", panel reopens empty; Enter twice and a double click each make 1 lead. No "discard?" question (S4). |
| J7 zoom | same as J2 at 200 % zoom (720×450) and on a 1366×657 laptop | Save on a known phone | the match and its two choices in view | **Failed (M1).** The block sits below the panel's visible area (top 546 > 389; 605 > 596). Only the footer button changing to "Add as new" is visible, and focus stays on it. |
| J8 boundary | the next step after saving | lead page | owner, Source and Engage shown | Held. The typed first note is shown nowhere yet (S3, timeline is part 2b). |

## Automated replay and data
- `check_fo4al_add_lead_browser.ts`: 19/19. Covers axe, keyboard only, 375/1024/1440 px, pass and fail per rule.
- `j_27.ts`: 11/11 on two runs, no flakiness.
- My own axe pass on the match and error states (wcag2a/aa, 21a/aa, 22aa): 0 violations.
- No sideways page scroll at 400, 720, 1024 and 1440 px.
- Keyboard focus ring visible on Save lead (3 px ring, checked once its animation settled).
- No page errors. The console shows only the expected 409 network lines.
- Timings: Leads first view 354-382 ms (budget 1 s); panel opens in 77-104 ms; Save to the lead page 243-245 ms.

## Break it (15 min)
| Try | Result | Severity |
|---|---|---|
| Source suggestions | the datalist offers the raw code `WEBSITE` (from `GET …/leads/sources`); picking it stores a phone lead under the web form's source, shown as "Website form" | **Major (M2)** |
| 100-character Arabic, Latin and accented first name; CJK last name; long source with a comma and a dash | saved once, shown; no sideways scroll | none |
| Email `  MIXED.x@Example.ORG ` then `mixed.x@example.org` | stored lower case; the second is matched | none |
| Two tabs, same new email, Save at the same moment | 1 person; the second tab is shown the match | none |
| Phone "call reception" | saved as typed, marked unreadable, not checked (AG-2-4 §12) | none |
| Read-only person POSTs directly | 403 | none |

## Score (QUALITY "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 and J3(c) end on the saved lead, by screens |
| Next step obvious | ½ | J7: on 200 % zoom or a 768-px laptop the match is off screen and the primary reads "Add as new" |
| Plain words | ½ | copy is plain and "(optional)" is in words; but the raw `WEBSITE` is offered, and "Not an email address." / "this is required." give no fix |
| Feedback and state | 1 | busy button, field errors, failure notice, toast naming the lead and its owner |
| Correct data | ½ | door, owner, E.164 phone, audit, idempotency and race all held; but a manual lead can be saved under `WEBSITE` (M2) |
| Error recovery | 1 | 502 then retry saves once; input kept; Escape returns focus; a reopened panel is fresh |
| Accessibility and screen sizes | ½ | axe clean, keyboard complete, focus visible, no sideways scroll; match hidden at 200 % (M1) |
| Speed | 1 | every timing well under budget |
| Visual quality | 1 | house Panel, one filled button, calm (`fo4al-04-panel-1440.png`) |
| Trust and sources | ½ | source shown on the lead, "You will own the lead"; the match line does not say what matched, the label or the owner (AG-2-4 rule 4, S1) |
| **Total** | **7.5 / 10** | **below the pass (8), no criterion at 0** |

## Fixes that raise the score, most valuable first
1. M1: on the 409, focus the match block and scroll it into view (or render it above the fields), with a 720×450 check.
2. M2: leave the web-form codes out of the source suggestions, with a test that `WEBSITE` is not offered.
3. S2: focus the first invalid field on a 422, and give each message a fix.
4. S1: the match line names the label, what matched and the owner, once FO-2's 409 carries them.

## Not tested
- A real screen reader.
- A visible headed browser (no display in this environment).
- An intended user's unaided walk (D17 and D20 stay with the founder).
- AG-2-4 rules 5 and 7's server effects (Link fields, "Combined into"), which are FO-2's.

**Verdict: Block.** 7.5/10 with two Majors (M1, M2), reviewed on commit `376411977`.

**Re-check (20 Nov, head `a0b33f63e`):** M1 and M2 are fixed and the M2 test can now fail (details in `review.md`). Score now **9/10**:
- next step 1, plain words ½ (S2), correct data 1, accessibility 1, trust ½ (S1);
- the other five criteria are unchanged at 1.

**Pass.** A fresh-copy flake in the check is noted as a Should.

**Re-check 2 (head `3422e9f4c`):** the fresh-copy flake is fixed in the panel itself (27/27 on three freshly started copies). Score stays **9/10**; pass.
