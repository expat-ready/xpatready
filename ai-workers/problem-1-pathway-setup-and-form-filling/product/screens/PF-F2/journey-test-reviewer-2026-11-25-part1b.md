# Journey test: PF-F2 part 1b (reviewer, 25 Nov), head `5455a704dc5c039c6a4de43a516b3bf9fd709291`

## How this was tested
- **No screen:** this is an API door, and part 2's DW8 owns the browser walk. The journeys were run through the rail's HTTP API: the suite's tus helpers plus a scratch breaker copy (B1-B8), which was not committed.
- **Environment:** Postgres on 127.0.0.1:54329, Nest on an ephemeral port (never :4400).
- **Persona:** a staff member uploading a client's document with a plain tus client (and part 2's client, checked by reading its code), firm A.
- **Data:** checked underneath each run: `plat_file` rows by key, the door's `onComplete` log, and staging files.

## Journeys
| # | Journey (goal in the person's words) | Result |
|---|---|---|
| J1 | Main path: "send my file, get it stored". Every PATCH, then the last one answers 204 with `Upload-File-Id`. | Held: one row, one `onComplete`. |
| J2 | Error and recovery: "the last step failed; did it go in?" The PATCH answers 500, so the client asks HEAD and gets 500, not "complete". Once the door works, HEAD answers 200 with the file id, and the confirming PATCH gets the same id. | Held: one row. |
| J3 | Recovery: the server stopped between the write and the finish. The next HEAD finishes it, and 10 HEADs at once give one row and one id. | Held (B5, B5b). |
| J4 | Wrong role by URL: firm B's staff, or another person of firm A, HEAD the complete upload. | Held: 404, and nothing was finished (B1). |
| J5 | Expired upload: a HEAD more than 24 h later answers 410 before any finish. | Held (B2). |
| J6 | Hostile file: bytes that are not a PDF, finished at HEAD. The answer is 415 then 404, and nothing is stored or staged. | Held, but the words are lost on HEAD (B4). |
| J7 | Two clients (or a retry) HEAD while the last chunk is being written, and the door is failing. | **Failed:** 89 of 96 HEADs answered 200 with offset = size and no file (B3b, review M1). |
| J8 | Part 2's client when HEAD answers 500: it retries on its delays, then shows "The upload could not be finished." and keeps the upload for `retry()`. | Held, by reading the code. |

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 and J3 store the file once, with the id named. |
| Next step obvious | ½ | A refusal at HEAD has no words (J6). After a refusal, a 404 tells part 2 "no longer on the server" (n2). |
| Plain words | 1 | No internals in any answer (the F3 check passes). The 410 and 500 words are plain. |
| Feedback and state | ½ | J7: a HEAD can say "complete" while the finish fails. |
| Correct data | 1 | One row and one `onComplete` under every race tried (B3, B5, B5b). No row for another firm or person. |
| Error recovery | ½ | J2 and J3 recover; J7's client is told "done" and never recovers. |
| Accessibility and screen sizes | N/A | No screen (part 2's DW8). |
| Speed | 1 | HEAD answers in 11-18 ms. A finish at HEAD reads the bytes once, and repeats skip the read (early `#stored`). |
| Visual quality | N/A | No screen. |
| Trust and sources | 1 | The stored file is named by id. The 24 h expiry is labelled Sample. |

**6.5 of 8 applicable = 8.1/10 (scaled). No criterion is at 0, so it passes the bar.**
- **First fix for "feedback and state" and "error recovery":** M1 in `review-part1b.md`. Make the HEAD's finish decision inside tus's locked read.
- **Fix for "next step obvious":** part 2's n2.

## Not tested
- A real screen reader, and the browser walk (part 2).
- tus-js-client against the live rail.
- A buffering proxy and two processes.
- D17 and D20 stay with the founder.

## Round 3 (26 Nov, the main merge a54244d0)
- **Nothing to walk again:** the merge changes none of the PR's lines. Its diff against main is byte-identical to `38ddab45`'s, and main touched none of the rail's dependencies (`review-part1b.md`, round 3).
- **Proof at this head:** `check_pff2_uploads` passes 52/52 (DW0 to DW9).
- **Score:** round 2's table stands: 7.5 of 8 applicable, **9.4/10 (scaled)**, no criterion at 0, pass. "Next step obvious" stays at ½ (n2, part 2). Part 1c's door `check()` and `maxBytes` (no bytes without a row) keep "correct data" at 1.
