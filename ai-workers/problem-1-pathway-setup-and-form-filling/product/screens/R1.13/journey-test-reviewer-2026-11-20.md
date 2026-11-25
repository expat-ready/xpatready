# R1.13 part PF-23m: journey test (reviewer)

PR #2626, head `0f49fafb05395236eaaae4254447c67cb0aeb0bc`, 20 Nov 2026 (UTC), Opus 5.5. This is the one journey score for this check.

**What changes for the method.** The part has no screen, so there was no browser walk. Section 2 (visible browser), axe, the 400/1024/1440 px widths and keyboard use do not apply. The journeys ran over HTTP against isolated copy `rv13` on :4436 (never :4400 or :4433), with US$0 and live AI off. I read the copy's own `var/isolated-rv13/api.log` and its database (psql). The probe rows were Sample rows in rv13's own database, which `isolated.sh stop` dropped at the end.

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Booker: "book a free consultation" | J-13 W1, run twice: slots page, a refused post (no consent, passport number in an unknown field), then a booked post, each with its own `X-Request-Id` | 200, 4xx, 201; each request is exactly one JSON request line with its id and the route pattern | Held, 7/7 both runs |
| 2 | On-call engineer: "is the log clean and structured?" | J-13 W2 | Every line is JSON (one named Stripe exception) and none holds the seeded name, email or passport number | Held: 16 lines on run 1, 41 on run 2; the Stripe hint really appeared as line 1 (`CLAUDECODE=1` here) |
| 3 | On-call engineer: "is it up?" | J-13 W3 | live and ready are 200; database and job_queue ok | Held |
| 4 | On-call engineer: "does a stuck job page me once?" | J-13 W4 | One `job_stuck` alert (EMF, `Alerts`, SA8-D40) within 2 min, none in the next sweep | Held: the alert came on the next minute's sweep |
| 5 | Author: "why did my run fail?" (a moved site, live) | Probe: a FAILED field_map run whose step message is `ENOENT: open /home/app/var/Zelda Quixote W012345678 zelda.rv@example.test.pdf`, then `GET /api/runs/:id` as user-A | The page gets plain words; the log says a message was kept and holds no seeded value | Held: the page shows "Something went wrong on this computer…" and 0 log lines hold a seeded value. But the 3 `run_message_kept_from_page` lines carry only `length` and `correlationId`; the request line's route is `/api/runs/:id`, so the log never says **which** run (m3) |
| 6 | Booker, break-it: non-English and over-long name, then a double submit | (a) a 210-character Cyrillic family name; (b) `Zoë Ægir-Ñúñez 李小龍 Øystein` plus an 84-character Cyrillic family name, posted twice on one slot | (a) a field error; (b) 201, then a refusal; the log stays clean | Held: (a) 400 `familyName: Too big…`; (b) 201, then 409 "Already sent"; 0 leaking lines; 0 non-JSON lines after the Stripe hint |

Not walked, because they need a database fault or an AI launcher on a running copy: the 29 moved sites inside AI rounds, job runners, the storage watch, the Cognito warm-up and the start-up catch-ups. For those I relied on the PR's site check and on reading each call (review m4).

## What held
- The request id round-trips on every answer. Routes are logged as patterns, never the firm key the booker typed.
- Health and the stuck-job alarm behave as written, with one alert per incident.
- The moved site I could reach live (plainRunText) keeps the person out of both the page and the log.
- Duplicate and invalid bookings are refused in words. None of them puts a personal value in the log.

## Findings (detail and fixes in `review.md`)
- **Minor (m3):** `run_message_kept_from_page` names no run or job. Evidence: journey 5's log lines.
- **Minor (m2):** after a failed AI start, the launcher's reason is now nowhere: `rounds.ts` `ai_stub_refused` / `ai_live_not_run`, and `people-ai.ts` 290/294.
- **Minor (m5):** J-13 W2 reaches no moved site. The run-2 log holds no PF-23m event, so W2 would pass at the merge base too.

## Score (each 0, ½ or 1; 2 criteria N/A for a no-screen part, scaled)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J-13 7/7 twice; probes 5 and 6 held |
| Next step obvious | ½ | Event names and ids say what failed. Two exceptions: plainRunText's line names no run (m3), and an AI start refusal keeps only its exit code (m2) |
| Plain words | 1 | Event names read plainly (`won_prospect_poll_failed`, `case_firm_fill_failed` with `rule`); the page words are unchanged |
| Feedback and state | 1 | Health 200 with its checks; one alarm line per stuck job; `X-Request-Id` echoed back |
| Correct data | 1 | Exactly one request line per request; 201, then 409 on the double submit; no personal value in 41 + 9 lines |
| Error recovery | 1 | Every moved catch keeps its recovery: the same return values and job states (read in the diff); the five related suites pass |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | Requests took 5 to 152 ms; the alarm came on the first sweep |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Each line carries its correlation id, firm id and the database rule's name (`dbRuleOf`); Sample rows and values are labelled |

**Score: 7.5 of 8 applicable = 9.4, reported as 9/10.** No criterion is at 0. **Pass.**
The most valuable fix: give `plainRunText` the run's id, and log a closed reason code for launcher refusals. That raises "Next step obvious" to 1.

## Could not test
- A real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
- The moved sites that need a database fault or a launcher on a running copy.
- PF-23c's W5 and W6, which are held under P-251.
