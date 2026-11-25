# Journey test (reviewer): AUD-3 part 3, our audit search, API journey (PR #3657 at 7cb4008a5)

The persona is our Platform Owner, or the read-only Auditor, searching the audit trail across firms. This item has no screen. Sections 2 and 3 of the skill (visible-browser walk, Playwright, axe, widths, keyboard) do not apply. The journeys were walked as HTTP calls through the real PF-4s guard and the AUD-3 interceptor:
* `tests/check_aud3_access.ts` DW7, run at 7cb4008: exit 0, 60 passed;
* reviewer probes in a scratch worktree copy, on a scratch database on 54329, a random port (never :4400), US$0.

## Journeys
| # | Who · goal (their words) | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Owner: "show me everything on firm A last few days" | `?from&to&firm=A`, follow `next` to the end | All of firm A's lines, newest first, no duplicates. One `cross_tenant.access` line naming me, the scope and firm A | Held: count matches the database, ids are unique, and the line is `none\|ourstaff:<owner>\|our audit search\|A` |
| 2 | Auditor: "what happened across all firms" | `?from&to` | Lines from firm A, firm B and the platform; 50 a page with `next`; the line names no firm | Held |
| 3 | Owner: "only what ExpatReady staff did" | `ours=1`, with and without `firm` | Only OUR_STAFF lines or lines under a support session, the latter shown as "ExpatReady support" | Held, and my probe shows the firm staff line excluded. DW7 alone does not prove it (review issue 1) |
| 4 | Owner: "trace this one request" | `correlationId=<id>` | Exactly that request's lines | Held |
| 5 | Owner: "only the platform's own trail" | `firm=platform` | Lines with no firm only | Held |
| 6 | Error: forgets the dates, or gives more than a year | no `from`/`to`; 2024-01-01 to 2026-01-02 | 422 DATES_REQUIRED / RANGE_TOO_LONG, field named, nothing written | Held |
| 7 | Error: bad input | `firm=not-a-firm`, `actorType=ROBOT`, `person=…`, `ours=0`, 201-character action or correlationId, `to` before `from`, `cursor=nope` | 422 with `fields`, no line | Held. **But** a cursor holding 30 Feb answers 500 (review m1) |
| 8 | Wrong role | Support token; no token; a firm Owner's token | 403 / 401 / 403, no line | Held (403 FIRM_SESSION_REFUSED for the firm token) |
| 9 | Recovery: pages with equal times; reload a page | 120 lines at one moment; repeat a page call | 50, 50, 20 with no skip or repeat; a repeat writes its own line | Held |
| 10 | Across the boundary: firm A's access report (part 2) shows that we searched A | open firm A's access report after journey 1 | The search's line appears there (`detail.firm` = A) | Held through part 2's branch on `detail.firm` (it was part 2's test, plus journey 1's line here) |

## Data underneath
* A refused call adds no `audit_event` row; the guard's REFUSED line goes to our own table.
* Each successful page adds exactly one firm-less line, actor `ourstaff:<id>`, and nothing on any firm's trail.
* Upper-case firm ids are lowercased on both the answer and the line.

## Break-it (short)
* Repeated `firm` → 422.
* HEAD → 200 and writes a line (Minor: over-logging).
* Unknown firm uuid → 200 with 0 lines; the line names that uuid, which can reach no firm's report.
* Impossible cursor date → 500 (Minor).
* Five filter and range rules can be removed with the suite green (Major, test only).

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–5 |
| Next step obvious | ½ | `next` cursor and 422 words say what to change. No firm name, only an id, so the next step after a hit is not obvious without the console screen |
| Plain words | ½ | Field errors are plain; `who` and `actionWords` are plain. `firmId` and the actor word are ids |
| Feedback and state | 1 | 422 with `fields` and `code`; the 403/401 split |
| Correct data | 1 | Counts match the database, no duplicates, keyset holds on ties |
| Error recovery | 1 | A bad cursor answers "start again from the first page"; no refusal writes anything (m1 is one 500 path) |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 10.9 ms average per unnarrowed search on Sample data (STANDARDS §9: < 200 ms) |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Each line gives actor, actor type, trail, correlation id and support session; the search logs itself |

**7 of 8 applicable criteria, 8.75 / 10 scaled, no criterion at 0: Pass.**
To raise it: (1) give the firm's operating name beside `firmId`; that is the console screen's item, so here it is a note, not scope. (2) Fix m1 so every bad cursor answers 422.

**Not tested:** a real screen reader, and an intended user's unaided walk (D17/D20 stay with the founder). The console screen that will read this API is a later item.

## Round 2 (head 179dd9a11, diff from 7cb4008a5)
I re-walked the journeys as HTTP calls in a scratch worktree at 179dd9a (database on 54329, random port, US$0). The suite: 67 passed.
| # | Change since round 1 | Result |
|---|---|---|
| 3 | `ours=1` (and actorType, entity, entityKey, `to`) each alone exclude the firm-staff line | Held, and now proved by DW7 (each removal fails) |
| 7 | 30 Feb, 31 Apr, year 0000 and `T24:00` cursors; NUL in action, entity, entityKey or correlationId | 422 each, nothing written (was 500) |
| 8 | firm token | 403, no line (now in DW7) |
| 10 | Owner searches `entityKey=<A>` with no firm filter, then opens firm A's access report | Firm A's report shows our firm-read line for that search (breaker M1 fixed) |
| new | Auditor browses 60 lines across 60 firms | 50 firm-read lines for page 1 and 10 for page 2, one per firm; 82 ms a page |
| new | One firm's line cannot be written | 500, nothing sent, nothing written (platform line rolled back too) |
| break | HEAD | 405 (Owner), 403 (Support), 401 (no token); no line |

Score unchanged: **8.75 / 10 (pass), no 0.** The two ½ scores (next step obvious, plain words: the firm is an id with no name) are the console screen's item. Error recovery holds without the 500 path. Speed: about 80 ms per page with the firm lines, which meets the 200 ms budget.
