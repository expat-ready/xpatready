# CS-K1 part 1: journey test, reviewer role (18 Nov, head 48abcd4e5)

This is an API and schema row with no screen in part 1, so the journeys were walked as API calls on the real isolated copy server (`csk1_rev` on :4651, restarted with `PLATFORM_IDENTITY=local` for PF-4 sign-in, the configured checkpoint loaded). The data underneath was read with psql. There was no browser walk, because there is no page to walk. Live AI was off and nothing was spent.

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Case officer (user-O): "open a case for a new client" | POST `/api/runtime/cases` on Visitor visa, principal "Sample Journey Person" | 201; `client_record` CL-00002, PERSON, named after the principal; one audit line with the code | Held. C-2026-00002, CL-00002. Audit: "Case officer opened case cce9426e for a new client, CL-00002" |
| 2 | Case officer: "a second case for the same client" | POST with `clientId` from journey 1 | 201; same client, no new number | Held. C-2026-00003, CL-00002 again. Firm A's GET `/clients/:id` lists both cases |
| 3 | Case officer, double click | Two POSTs at once with one idempotency key | One case, one client | Held. One `created: true`, one replay, both CL-00003. One client row |
| 4 | Representative (user-R), signed in: "find the client" | GET `/api/runtime/clients?query=journey` | 200, the client, paged 50 | Held. Total 1, page_size 50 |
| 5 | Firm B (user-S), wrong firm | Read A's client by id, search A's name, open with A's `clientId`, read A's case | 404 / empty / 404 / 404 | Held. 404 "No such client.", 0 rows, 404 "No such client.", 404 |
| 6 | Firm B: its own first client | POST with no `clientId` | Its own numbering from CL-00001 | Held. CL-00001 in sample-solo |
| 7 | No session (x-actor only) on the read routes | GET `/api/runtime/clients` | 401 | Held |
| 8 | Plan limit full (the test port, from the row's suite) | Openings, new and reused | 409, nothing written | Held (suite DW7; I did not repeat it on the live server, which has no switch for the limit) |

## Data underneath
Every case has a `client_id` (0 null). Client and case firm ids match. Numbering is per firm (sample-firm 1, 2, 3; sample-solo 1). There are no `client.created` events. Audit lines carry codes, never names.

## Breaking it
The breaker's 19 attempts (`break-report.md`) cover race, idempotency, injection, paging, roles and forced SQL, so I did not repeat them. I confirmed in code the one error-path gap: `query=%00` gives 500 (`clients.ts:60-63`).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2, 4 and 6 finish in one call each |
| Next step obvious | ½ | The answer gives the client id and code. The field is `client_record`, not the brief's `client`, so callers must be told (review m4) |
| Plain words | 1 | "No such client.", the plan-limit 409 sentence |
| Feedback and state | 1 | `client_record` comes back in the opening answer and the case read. `created` tells a replay from a new case |
| Correct data | 1 | psql checks above |
| Error recovery | ½ | Every refusal writes nothing. A NUL in the search gives 500 (review m3) |
| Accessibility and screen sizes | N/A | No screen in part 1 |
| Speed | 1 | Each call answered without a noticeable wait (no timing beyond the shell) |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Sample names only. No immigration value is introduced |

**7 of 8 applicable = 8.8 / 10. No 0. Pass.**
To raise it: fix m3 (clean and escape the search text), and name `client_record` in the PR body and module card (m4).

## Could not test
There is no screen, so no keyboard, zoom, axe or widths, and no unaided walk by an intended user (D17/D20 stay with the founder). I did not repeat the plan limit on the live server.
