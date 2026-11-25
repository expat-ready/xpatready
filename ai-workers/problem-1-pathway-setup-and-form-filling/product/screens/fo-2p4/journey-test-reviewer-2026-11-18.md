# Journey test: FO-2 part 4 calls, notes and the timeline (API only), reviewer, 18 Nov 2026, commit 7f7da9e48

There is no screen yet; FO-4 part 2b builds it. So I walked the journeys as a person's calls over HTTP, signed in through local identity, on an isolated copy at :4436 (runtime range, database `xr_studio_rv_fo2p4`). The copy started with no front-office setup rows, so I ran FO-1a's `seedSampleFirmsFrontOffice` on it first, and I stopped it afterwards. I also ran an in-process probe on a scratch database for the cases HTTP cannot reach easily. After each journey I checked the data underneath in the database. The probe scripts stayed in the session scratchpad and are not committed.

## Journeys (persona · goal · result)
1. **Main path.** Case Officer O: "Mira rang about a study permit: I log the call, write a note, and see it all on her lead."
   * Add lead: 201, L-00001.
   * Log call (OUT, Connected, 360 s, notes): 201 in 37 ms with `firstResponse: true`. The lead read shows `firstResponseAt`.
   * Note: 201, INTERNAL.
   * Timeline: 200 in 30 ms, three lines oldest first: `AUDIT lead.created` "Lead L-00001 arrived by hand.", `CALL` "Outgoing call: connected (6 min). Will send documents.", `NOTE` "Prefers WhatsApp. 中文 ok.". Each line names "Case officer (Sample)".
   * **Held.**
2. **Alternate: a second call, sent twice at once (double click).** Both 201 with `firstResponse: false`. The first response stays the first call's. **Held.**
3. **Errors.**
   * No outcome: 422 with `fields.outcome`.
   * `when` in 2099: 422 "a call cannot be logged in the future."
   * Empty note, or no body: 422 "Note: this is required."
   * A 5001-character note: 422. A direction-change character (U+202E): 422.
   * Seconds sent as `"60"`, or direction `out` in lower case: 422.
   * **Held.** Two inputs got through that should not: `when: "Nov 1 2026 10:00"` was accepted (m2), and `when: 2005-01-01` was accepted on a lead that arrived today (m1).
4. **Wrong role.** Read-only: Log a call 403, note 403, timeline 200. **Held.**
5. **Other firm and unknown records.** The Solo firm's person on firm A's lead: timeline 404, call 404, note 404. A random uuid: 404. `prospects/nope/timeline`: 404. **Held.**
6. **Across the boundary (Engage, then work the prospect).**
   * Engage: 201. Incoming "callback requested" call on the prospect: 201, `firstResponse: false` (the lead already had one). Note: 201.
   * Prospect timeline: `AUDIT lead.engaged`, `CALL`, `NOTE`. **Held.**
   * The engage line's summary reads "Staff e975c2dd-… engaged lead L-00001 as Individual." (m7).
7. **Closed lead.** Close L-00002 ("Cannot reach") with no call yet. A Wrong number call then gives 201 with **`firstResponse: true`, on a CLOSED lead** (M1).
   * Its timeline order: `NOTE` "Asked about a study permit." before `AUDIT lead.created`, and `NOTE` "Closed (Cannot reach): …" before `AUDIT lead.closed` (m3).
   * 45 s shows as "(1 min)"; 20 s shows as "(0 min)" (m6).
8. **Same person, two open leads (in-process).** A call on the first lead leaves the second lead's first response empty (M1).
9. **Races (in-process).**
   * 8 concurrent first calls on one lead: one `firstResponse: true`, 8 rows, no error.
   * 9 concurrent mixed writes on one lead and its prospect (prospect calls, a second Engage, a note, lead calls): all succeeded, no deadlock.
   * **Held.**

## Data underneath
* `fo_call` and `fo_note` hold one row per accepted request: 4 and 3 after journeys 1-6. Values are exactly as sent; `when` defaults to the server time.
* The audit has one `call.logged` or `note.added` line per write, actor_type FIRM_STAFF. No call or note words appear in `summary` or `detail` (0 rows matched).
* No `fo_stage_move` is written by a call: the prospect's stage and version are unchanged (suite DW2).
* A forced audit failure rolls back both the call and the first response (suite DW1).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2 and 6 complete through the API alone |
| Next step obvious | ½ | `firstResponse` is returned and field errors name the field, but the outcome error lists raw codes (m12) |
| Plain words | ½ | Call and note lines are plain; AUDIT summaries carry raw staff ids and EVENT summaries type names (m7); "(0 min)" (m6) |
| Feedback and state | 1 | 201 bodies say whether this was the first response; 422 at the field; 404 for unseen records |
| Correct data | ½ | One row and one audit line per write, firm-scoped, no free text in the audit; but a first response is set on a CLOSED lead, and the person's other open lead is missed (M1); first response before arrival (m1) |
| Error recovery | 1 | Double submit is safe and the first response stays the first; rollback on audit failure; no deadlock |
| Accessibility and screen sizes | N/A | No screen (FO-4 part 2b) |
| Speed | 1 | Timeline p50 15 ms, p95 19 ms (20 reads); a call takes 37 ms; no per-row query |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Each line says where it was read from (`kind`) and who did it (`actorName`); typed actor; no AI |

**6.5 of 8 applicable criteria = 8.1/10, no 0: passes on score.** The verdict is still Block because of review M1.

**Fixes that would raise the low criteria, most valuable first:**
1. Set the first response only on OPEN leads, and on all of the person's (correct data).
2. Order a same-transaction note after its audit line, and settle the rule for a call dated before arrival (correct data, plain reading).
3. Give AUDIT and EVENT lines plain words, show durations under a minute in seconds, and use one style for field messages (plain words, next step).

## Could not test
* No browser, axe or screen sizes: there is no page.
* No real screen reader.
* No intended user's unaided walk: D17 and D20 stay with the founder.
