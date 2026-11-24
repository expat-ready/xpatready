# qa capability R1.10: checking every input (24 Nov)

**Run:** `/qa capability R1.10`, qa 6 (cloud qa copy, Opus 5.5 medium), under Lead 24. Live AI off, US$0. Tested on main fa337044c, after #3385 (j_10's probes as ruled, B1-B7) merged as bc91087d7. Isolated copies only, started from j_10's header line, which walk.mjs reads (`PLATFORM_SYSTEM_IDENTITY=local`); :4400 not touched.

**Verdict: Partial (unchanged). Parts are missing, so there is no verdict (P-606).** #3385 is the probe PR that Lead 19 ruled comes before the app fixes. The app fixes (A2-A5 on #3377's list, PF-28's remaining parts) have no PR open.

## Evidence
| What | Where | Result |
|---|---|---|
| j_10 (`walk.mjs`) | isolated copies on fa337044c, twice | **12 PASS, 7 FAIL both times, the same steps** (10/19 on 4742387cd) |
| GitHub walk | not dispatched | there is no Works claim; a cloud lane asks (P-439) |

Read the move from 10 to 12 with care. #3385 changed what the probes send: real Sample tokens and values, the right session per door, and B7's fix to the constant reader. Some steps now pass or fail differently because the probe reaches its door, not because the app changed.

## Passing (12)
* Set-up. W1, on screen: the office country "1234" gets "Not saved" on the field.
* W2: the route table (295 PF/FO routes) is read from the app's own list, and every route was probed.
* **W2 money: 0 of 116 probes off.**
* W3: the number of run-time schemas is within the reviewed 19.
* W4: no probe stored a row, and none answered 500.
* **W6 (QA-507):** an unknown charset or Content-Encoding answers 4xx in words.
* W7: an unsigned non-Stripe body is refused, and nothing is stored.
* W8: the PF-28 allow-list holds only by-design lines.
* No page error.

## Failing (7), each waiting on an app fix
| Step | Today | Before (4742387cd) |
|---|---|---|
| W2 platform | 64 of 416 probes off, on 17 routes (e.g. complaints steps, keep-periods, breaches unknown → 400 not 422) | 86/343 on 19 |
| W2 FO sales | 5/272 on 3 routes (identity-checks, the public form, signature-requests) | 14/251 on 2 |
| W2 booking | 20/200 on 5 routes (booking-types …) | 25/197 on 8 |
| W2 retainers | 12/72 on 5 routes | 12/73 on 5 |
| W3 over-long fields | fields answer zod's own words ("Invalid input: expected array, received string") instead of the field's plain words | new probe |
| W3 schema | 9 public booking doors reach no zod schema | 9 |
| W5 case side | a malformed id on some runtime routes (documents flags, milestones) answers 400, not 404 | answered 403 |

## Questions for the Lead
1. Who owns A2-A5 (PF-28 parts for platform, FO sales, booking, retainers, and the public booking doors' schemas)? None has a PR.
2. W5: a malformed id now answers 400 rather than 403. The ruling asks for 404. Is that a case-side row (CS-V1 follow-up)?

## Suggestions
* *Needed for the proof, Capability:* one PF-28 PR per area, with j_10's per-area step as its Done when.
