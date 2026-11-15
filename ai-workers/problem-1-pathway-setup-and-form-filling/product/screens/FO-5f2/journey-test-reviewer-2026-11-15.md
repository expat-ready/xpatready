# FO-5f2 journey test (reviewer, 15 Nov 2026)

* **Scope:** retainer template uploads and renders after FO-5f2 (an allowlist, one worker with limits, and the library's own tags). The row has no screen (the template screens are FO-5s), so I walked the journeys over HTTP, making the calls a page would make.
* **Commit tested:** `caedcec1604a10227db0c4673ebffecf7f9afe04` (PR #1809). The head `03ee1ae22` adds only a qa note.
* **Setup:** isolated copy `rev_fo5f2` on :4473 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), started and stopped in the same command. Signed in with `POST /api/platform/session/local` as user-R (Owner) and used the bearer token.
* **Script (scratchpad, not committed):** `/tmp/claude-0/-home-user-xpatready/1350ca85-7653-5e6c-af92-51b453c4608e/scratchpad/rev_fo5f2/http.mts`. Direct probes are in `probe.ts` in the same folder.

## Journeys (persona: the firm's Owner setting up retainer templates)
1. **Main path:** "I upload our Word template, which has a header, a footer and our logo." Expected: accepted, with its placeholders listed.
2. **Alternate:** "My colleague saved it in LibreOffice." Expected: accepted in the same way.
3. **Duplicate:** "I upload it again under the same name." Expected: 409 in words.
4. **Hostile file, error:** a header disguised as `word/h.rels` that holds `{client.passport}`. Expected: 422, before any parse.
5. **Break-it, availability:** 1.5 M lone `{` in the glossary's settings part, while a colleague keeps reading the template list. Expected: refused in under 2 s (DW7), with the reads answering.
6. **Break-it, cap:** 3,000 `{client.name}` in the same part. Expected: 422 TOO_MANY_PLACEHOLDERS (B-19).
7. **Break-it, odd file:** a Default with `Extension="constructor"`. Expected: 422 in words.
8. **Recovery:** a file built to exhaust memory and a good file sent together, with reads alongside. Expected: 422 for the first, then the good one is accepted on a new worker.
9. **Across the boundary:** download the starter, which the worker renders. Expected: a .docx.

## Observed
| J | Result | Held? |
|---|---|---|
| 1 | 201 in 793 ms (includes the worker's first start); `client.name, fees, fees.amount, fees.label, firm.name` | yes |
| 2 | 201 in 93 ms; same list | yes |
| 3 | 409 NAME_TAKEN "A template with this name already exists." | yes |
| 4 | 422 PARTS_NOT_ALLOWED "This Word file has parts a template cannot have." in 14 ms | yes |
| 5 | 422 TOO_COMPLEX after **5,032 ms** (the worker's timeout, not the pre-count); 45 reads, 0 failed, slowest 78 ms | **no** (review M-1) |
| 6 | **201**, `placeholders: ["client.name"]` | **no** (review M-1) |
| 7 | **500** "Something went wrong on the server." | **no** (review m-1) |
| 8 | heavy file → 422 TOO_COMPLEX "This Word file is too complex to use as a template." in 4,358 ms; good file 201; 37 reads, 0 failed, slowest 332 ms | yes |
| 9 | 200 starter .docx in 409 ms; the template list at the end 200 | yes |

## Data underneath
* The API process stayed up through J5 and J8: every page read answered 200.
* Direct runs back up J5, J6 and J8. Glossary settings: the timeout fired at 5,308 ms on upload and 5,413 ms on render; 60,000 placeholders were accepted. Five concurrent jobs: both breaches → TOO_COMPLEX; the 3 jobs queued behind them were accepted.
* J6's render rewrote `word/glossary/settings.xml`, so docxtemplater does template that part.
* The database was not inspected row by row. This row changes no schema; J3's 409 shows the template stored in J1 exists once.

## Score (0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 and J9 reach the goal |
| Next step obvious | ½ | J4's sentence (the row's own words) names no part, so a firm does not know what to remove |
| Plain words | 1 | both new sentences are plain; J3 too |
| Feedback and state | ½ | 4-5 s with nothing said during J5 and J8 (no screen to show progress) |
| Correct data | ½ | J6: a template over the 2000 cap is stored |
| Error recovery | ½ | J8 recovers on a new worker; J7 is a 500 with no reason |
| Accessibility and screen sizes | ½ | no screen in this row |
| Speed | ½ | normal uploads 93-793 ms; J5 takes 5 s against DW7's 2 s |
| Visual quality | ½ | no screen in this row; nothing to judge |
| Trust and sources | 1 | unknown tags are refused by name (DW4, DW5); the fixtures' origin is written in the sample file |

**Score: 6.5 / 10. Fail** (below 8; no criterion at 0). Fixes, most valuable first:
1. Count and cap `word/glossary/settings.xml` like `word/settings.xml` (M-1). This raises Speed and Correct data.
2. Look up Defaults by own key only (m-1). This raises Error recovery.
3. The four ½s for "no screen" (next step, feedback, accessibility, visual) belong to FO-5s, not this row.

## Not tested
* A file saved by Microsoft Word itself (none in the container); a real screen reader; a visible browser, axe, 1024 px, 200 %.
* The render path over HTTP (prospect, retainer, edit). Render was run directly.
* An intended user's unaided walk: D17 and D20 stay with the founder. DW8 is the breaker's.
