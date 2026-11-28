# Journey test: CS-W1 part 2b, reviewer role (26 Nov 2026), head 207402be591c14c125117892e33a33c2476dff55

This is an API and schema part, and nothing visible changes on the demo. So the journeys were walked through the API as each persona, not in a browser, on an isolated copy: `rvbj` on :4436, the runtime lane's range, never :4400. The visitor visa release was made by `tests/runtime/setup_visitor_visa.ts` (15/15) and `acceptance/lib/setup_vv_m3.ts` (44/46, the known failures its suite allows). Data was checked in the copy's database after each journey. The script is in the reviewer's scratchpad and is not committed. The copy was stopped afterwards, which drops its database.

## Journeys (persona, goal, expected, result)
| # | Persona | Goal | Expected | Result |
|---|---|---|---|---|
| J1 | Case officer of sample-firm (user-O) | Open a case and find it | 201, then read 200 and listed | Held |
| J2 | Staff of sample-solo (user-S), wrong firm | Read, list, number and watch activity for firm A's case | 404 "No such case."; not listed; their own number; no feed line | Held: 404 with the same words as before; list 200 without it; `C-2026-00001`; feed 200 without it |
| J3 | Officer, error | Re-use an idempotency key for a different request | 409 in words, nothing created | Held: "This idempotency key was already used for a different case request; nothing was created. Use a new key." |
| J4 | Staff of sample-solo | Use the same key as firm A | Their own new case, not firm A's replay | Held: 201 with a new id; the database has one case per firm under the key, each with its own `firm_id` |
| J5 | Officer, double click | Two openings with one key at the same moment | One case | Held: 201/201, the same id, 1 row |
| J6 | Client (user-P) | Read their own case | 200 (the client path is unchanged) | Held |
| J7 | Officer, two openings at once | Consecutive case numbers | n, n+1 | Held in the suite (check_csw1_part2b DW4, check_a24_case_number_api) |
| J8 | Staff of a firm with no platform account (fixture: sample-solo's platform key renamed, seed off, restarted) | Open a case, see the next number | 409 in words, nothing written; firm A's case still 404 | Held: 409 on both routes; sample-solo case rows 1 before and 1 after; firm A's case 404, and user-S's own earlier case also 404 |
| J9 | Firm B, close | Close firm A's case | 404 on all four routes | Held in check_csc1_close DW8 (55/0) |

## Data underneath
* After J1 the audit lines are there: `opened case`, `added case client`, `added person` ×3. Each carries firm A's `firm_id` (e1e789b5…).
* After J4: `sample-firm:e1e789b5…`, `sample-solo:0eee70e5…`.
* Roles are enforced on the server. Every refusal came from the API with no client help.

## Break-it (short)
* Same key across firms: correct (J4).
* Double click: correct (J5).
* A firm with no platform account: 409 for open and number. The list gives 403 "No firm" from CS-W3's door, an earlier refusal in a contrived state.
* The next-number 409 reuses the opening's words ("cannot open a case. Nothing was created."), which is wrong for a read. Minor, m4 in review.md.

## Score (QUALITY.md "Journey score"; each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J9 held |
| Next step obvious | ½ | The 409 says what is wrong but not who can fix it, and the next-number refusal talks about opening (m4) |
| Plain words | ½ | Refusals are in words. The next-number sentence is wrong for a read (m4) |
| Feedback and state | 1 | 404 is unchanged. The 409 says nothing was created, and that is true (row count) |
| Correct data | 1 | firm_id is right on cases and the counter. One case per firm per key |
| Error recovery | 1 | Replay with the same key; a different request gets 409; the double click makes one case |
| Accessibility and screen sizes | 1 | N/A: no screen change, counted as met (BIC all N/A) |
| Speed | 1 | Every call answered at once. The firm id is cached; one query per list |
| Visual quality | 1 | N/A: no screen change, counted as met |
| Trust and sources | 1 | No AI. The migration and code cite the brief and decisions |

**Score: 9/10, pass (8 or more, no 0).** To raise it: fix m4's wording (raises next step and plain words).

## Could not test
* A browser walk, axe, widths and the keyboard: there is no UI change.
* A real screen reader, and an intended user's unaided walk: D17 and D20 stay with the founder.
* The full CI suite set.
