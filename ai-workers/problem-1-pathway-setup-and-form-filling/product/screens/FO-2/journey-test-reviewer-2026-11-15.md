# Journey test, reviewer role: FO-2 part 1 (PR #1813 at b4db3a009), 15 Nov 2026

* Scope: API only, so there is no screen and no browser walk. Each journey was walked over HTTP the way the future page and script will call it, and the data underneath was checked in Postgres.
* Copy: my own API on :4433, run from a clean worktree at b4db3a009, with database `xr_studio_rev_fo2c` (dropped afterwards).
* Setup: firm seed run, an EMAIL/MARKETING wording published, the form turned on with allowed site `https://firm.example`.
* Staff signed in through `POST /api/platform/session/local`: user-R (Owner), user-T (Case manager), user-O (Case officer).

## Journeys
1. **Main path, visitor.** "I want to ask the firm about studying." I loaded the form (got the wording, a `submissionId` and a stamp), waited 2.3 s, then sent my name, email, phone, a French message containing `<script>`, the tick, and `utm_campaign=spring`.
   → 201 with the thank-you text. Underneath: one lead L-00001, Unassigned, source WEBSITE, phone +14165550199; one INTERNAL note in plain text; one consent row for FO_PERSON with the form's wording; attribution `spring`; one audit line; `lead.created` as the last row.
2. **Double click.** The same `submissionId` once more, then 5 times in parallel → the same answer, still 1 lead and 1 receipt.
3. **Repeat enquiry.** The same email in another case, with an unreadable phone → a new lead L-00002 and a new person, flagged as a possible match and never linked; `fixNumber` true.
   The Case officer's read says "Possible match: Ana Silva (L-00001)", and the answer to the visitor was identical.
4. **Bots.**
   * Honeypot filled → thank-you text, nothing stored.
   * Sent 0 s after drawing → the same.
   * Wrong Origin → 403 "This form cannot be sent from this page."
   * Unknown token → 404 "This form is not available."
5. **Bad input.** No email and no phone → 422 with the field named ("Add an email or a phone number.").
6. **Staff, Unassigned and Take it.** Owner, Case manager and Case officer each see 2 Unassigned leads. All three clicked Take it on L-00001 at once → one 200; the other two got 409 "<owner> already has this lead"; 1 `lead.taken` event, 1 audit line.
7. **Wrong role and wrong firm.**
   * Case officer calls Assign → 403 naming `agent/prospect:assign`.
   * Case manager assigns to the solo firm's staff member → 422 "Choose an active person of your firm."
   * The solo firm's Owner reads L-00001 → 404.
   * No session → 401.
8. **Assign.** The Case manager assigned L-00002 to the Case officer → 200; audit "assigned the lead to staff <id>"; the event is `lead.taken`.
9. **Recovery: restart.** I loaded the form, the API restarted, then I sent as a real person → 201 "Thank you", but **0 people and no receipt stored** (finding M2).
10. **Break it: flood with oversized bodies.** 35 posts of 40 KB from one address → all 413; the 36th, normal post → 400, not 429. **Oversized posts are not counted against the limit** (finding M1).

## What held
* No duplicates under parallel repeats or parallel Take it.
* Every read and change is firm-scoped.
* Outbox rows come last; payloads carry ids only (no name, email or phone).
* Plain words in every problem answer.
* Non-English and injection text are stored as typed.
* Responses felt immediate (under 1 s by eye, not timed against the §9 budgets).

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J6 and J8 end to end |
| Next step obvious | ½ | No screen; problem answers name the fix (J5, J7), but a stale stamp gives no "reload" (J9) |
| Plain words | 1 | "This form is not available", "<name> already has this lead", field errors |
| Feedback and state | 1 | 201 thank-you, 409 naming the owner, 413, 429 (in the suite) |
| Correct data | 1 | J1-J3, J6: one row each, values exact, audit and event present |
| Error recovery | ½ | Double click safe (J2); restart silently loses the enquiry (J9) |
| Accessibility and screen sizes | N/A | No screen (FO-4) |
| Speed | ½ | No per-row requests; not timed against budgets; list capped at 500 |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Source, form name, attribution, consent from the server's wording, possible-match line hides people the viewer may not see |

**6.5 of 8 applicable criteria = 8.1/10 scaled; no criterion at 0. Pass, narrowly.** The most valuable fixes are M2 (raises error recovery and next step) and M1 (flood protection).

## Not tested
* A browser, axe, keyboard, the 400/1024/1440 px widths and a screen reader: there is no page yet (FO-4, FO-4b).
* An intended user's unaided walk: D17 and D20 stay with the founder.
* A real Read-only user over HTTP: the Sample firm has none.
* The seeds and the demo reset: part 3.
