# PF-21b part 1 journey test (reviewer, 16 Nov 2026, head 8272b685)

PF-21b part 1 has no screen, so the people here are the builders of the callers: the CS-X3 delete door, the PF-11 purge, and a placement on the Platform Owner's behalf. Each journey was walked as that builder would meet it: call the fake through `tsx` scripts in the scratchpad that import the PR's files, then read the answers.

- **Repo:** no file was edited.
- **Not run:** the browser, axe, screen sizes, Playwright and ports, because there is no UI and no route.
- **Database:** none (part 2).

## Journeys
| # | Person, goal | Steps | Expected | What happened |
|---|---|---|---|---|
| J1 | CS-X3 builder: "can I delete this client's note?" | Place a PERSON and a `case_notes` hold; ask FIRM, CASE, PERSON, `case_notes`, DATE in one call | Held, both reasons | `['Sample: complaint','Sample: notes']`. Held |
| J2 | Same, a document of another person | Ask FIRM, CASE, `case_documents` | Not held | `held: false`. Held |
| J3 | PF-11 builder: purge a cancelled firm | Ask `ALL_FIRM_DATA` with a person and a category hold | Held by both | 2 matches. Held |
| J4 | Deleter with a bad request | DATE "not a date"; a subject carrying `firmId`; no subjects | Refused | ZodError each time. Held |
| J5 | Deleter racing a placement (two parties) | Contract cases 7 and 8 | Serialised | Pass. Held |
| J6 | Deleter while two placements queue (three parties) | Scratch `race.mts` B | The placement waits for the deleter | **The placement commits during the deleter's open transaction.** Review M1 |
| J7 | Two parallel placements or releases | Scratch `race.mts` A | One at a time | **Both are inside at once.** Review M1 |
| J8 | Door that passes the root client, not `tx` | Scratch `probe2.mts` J-a | Refused, or the lock is kept | Accepted, no lock kept. Review m1 |
| J9 | Door that forgets `await` | Scratch J-b | Error | **Every later placement hangs.** Review m2 |
| J10 | Part 2 builder runs the contract on one database | Scratch `shared-store.mts` | 8 of 8 | Run 1 fails case 4; run 2 fails cases 1, 2 and 4. Review M2 |

## Data underneath
- `answer()` returns each match once, oldest first, for the asking firm only, without released holds. This matches the 29/29 suite run.
- The release path sets `releasedAt` and never deletes the row.

## Break it
- **Caught:** an extra field in a subject, an unknown category, a reversed date range, and a second release.
- **Not caught:**
  - the three-party wake race (M1);
  - a non-transaction handle (m1);
  - a lock leaked after the transaction ended (m2);
  - a reader overtaking a queued placement (m5; serialisable).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1-J5 held. J6/J7 break serialisation, the port's core promise, in the fake |
| Next step obvious | 1 | The answer shape is the one CS-X3 asked for; the rules are numbered in the port file |
| Plain words | 1 | Zod messages ("name at least one subject (an empty ask would pass every delete)"); `LegalHoldRefused` codes |
| Feedback and state | 1 | Each match carries scope, reason, placedBy and placedAt; contract lines name each rule |
| Correct data | ½ | Matching is right in every probe; J6 lets a delete go ahead on held data |
| Error recovery | ½ | Bad input is refused clearly; J8 degrades silently and J9 hangs instead of failing |
| Accessibility and screen sizes | N/A | No UI |
| Speed | 1 | Suite 5.75 s (mostly the 300 ms waits); guard 603 ms |
| Visual quality | N/A | No UI |
| Trust and sources | 1 | §3.5 is quoted for each rule; both additions are declared under Decisions; reasons are Sample |

**6.5 of 8 applicable = 8.1/10. Pass (8 or more, no 0).** The review still blocks on M1 and M2.

Fixes that would raise the low criteria, most valuable first:
1. M1, atomic check-and-take in the fake (raises task completed and correct data).
2. m1 and m2, refuse a foreign or ended transaction (raises error recovery).

**Not tested:** the real adapter on Postgres (part 2), and an intended user's unaided walk (D17/D20 stay with the founder).
