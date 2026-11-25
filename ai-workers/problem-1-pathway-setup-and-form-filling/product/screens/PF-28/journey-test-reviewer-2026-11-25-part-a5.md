# PF-28 part A5 (R1.10, j_10 W5, the case side): journey test (reviewer, 25 Nov)

**Heads:** a638bdaa477b9d89a54e5ffec32056e452874191, then 4fe9a745fe4d22e608ec49d00c91a91e620f8985 (PR #3656; the score is for 4fe9a745f).

**Copies:** fresh isolated copies on :4436–:4439 (never :4400), `PLATFORM_IDENTITY=local`, each stopped afterwards. Live AI off; cost US$0.

**API-only change.** No screen layout or web code changed: `git diff origin/main...4fe9a745f` has no `web/` file. So the journeys are walked through the case-side API, as the people on those screens would reach it, plus one browser suite: the Clients page, whose list request is now read strictly. Screenshots were not taken (no screen changed). Scripts: j_10 and the reviewer's probe script, in the session scratchpad only.

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | A representative (user-R) searches the firm's clients on the Clients page | Clients → type a name → more pages (`check_csk1s_clients_browser.ts`) | The list, as before; the web sends only `query`, `page` | Held: 33/33 |
| J2 | The representative records a government step, then cancels it with a reason | `check_csdl3_milestones.ts` | Recorded once; cancelled; idempotent retry | Held: 43/43 |
| J3 | A staff member adds, edits, pins and shares a note, with ids in capitals too | `check_csnt1_notes.ts` (upper-case keys at `:297`) | One version per change; same note whatever the letter case | Held: 56/56 |
| J4 | The Owner reads the keep-period list and pages it | `check_csd6_reads_keep.ts` | 200; a cursor it gave works; another is 400 | Held: 49/49 on both heads |
| J5 | Error: an id that is not an id, on each case-side write | j_10 W5 (103 probes); `check_pf28_a5_case_ids.ts` "I" | 404 in the service's own words, before the body | Held: W5 PASS; 9/9 (main: 4/9) |
| J6 | Error: an unknown query key on the two lists | `?pf28Unknown=x`, `?Page=1`, `?after[x]=1` | 400 naming the key | Held |
| J7 | Wrong role: a configuration author or a client sets a document's flags | user-A or user-P, malformed id | 403 "Staff only" before the id | Held (improved: main gave 400) |
| J8 | Wrong role: a configuration author or a client plans a review run | user-A or user-P, malformed id, valid body | 403, as on main | **Not held**: 404 "No such case." (review M1) |
| J9 | Wrong role: no session, a bad token, or a role without the dispose key, on token doors | no token, garbage token, user-O on the keep list | 401, 401, 403 before anything else | Held |
| J10 | Across the boundary: a bearer token on an x-actor door | flags door with user-R's token | 403 (ConfigReadGuard) | Held |

## Data underneath
- j_10 W4: no probe stored anything (the PF/FO row counts are unchanged), and no probe answered 500.
- In the suites, J2–J4 each check one row per change and their audit lines. No refused call in the probe wrote a row: every refusal came before the service's transaction.

## Break it (about 15 minutes, by API)
- A repeated `after` and a repeated `query` each answer 400 in the door's own words.
- An upper-case well-formed id is handled the same as the lower-case one.
- `?__proto__=1` answers 200 on both lists on 4fe9a745f (review m2; a638bdaa4 refused it on the keep list).
- The keep list answers in two problem shapes on one door (review m3).
- The share-key 403 on notes visibility can become 404 for a custom role (review m1; seen in the code only).

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J7 and J9–J10 complete; W5 passes on both heads |
| Next step obvious | ½ | J8: a configuration author or a client is told "No such case." instead of "works on configuration, not on cases." / "Only the case officer can do this.", so the way forward (use the case officer) is lost |
| Plain words | 1 | The 404 words are each service's own; unknown keys say "… is not a field of the client search / this list." |
| Feedback and state | 1 | Every refusal is a problem with its field named (`fields` or `errors[].field`) |
| Correct data | 1 | Nothing stored by any probe (W4); the suites' rows and audit lines are as before |
| Error recovery | 1 | After each refusal, the same door with a correct id and body works (J2–J4) |
| Accessibility and screen sizes | 1 | No screen changed. The Clients page browser suite passes unchanged (33/33). |
| Speed | 1 | Refusals come before any query; the suites run within their budgets |
| Visual quality | 1 | No visual change (API only) |
| Trust and sources | 1 | Sample data only; no AI on these doors |

**9.5/10, pass** (8 or more, and no criterion at 0). This passes the journey bar, but the review still asks for Changes because of M1, a broken authorisation-order rule (B2).

**Fix that raises "next step obvious":** check review runs' duties before the id's shape (review M1).

Not tested: a real screen reader and an intended user's own walk (D17/D20 stay with the founder); the notes share-key case live (no Sample role lacks the key).
