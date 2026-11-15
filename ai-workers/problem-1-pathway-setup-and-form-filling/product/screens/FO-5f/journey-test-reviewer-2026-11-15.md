# FO-5f journey test (reviewer, 15 Nov 2026)

* **Scope:** the retainer API's hardening (row FO-5f). There is no screen in this row (the screens are FO-5s), so the journeys are walked over HTTP the way a page would call them.
* **Commit tested:** `7338fdfa23921d5df5326b7111e31d1be4117a5d` (PR #1791).
* **Setup:** isolated copy `rv_fo5f` on :4436 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`). FO-1a's Sample seed and Individual prospects were written underneath, as the builder's walk does, because FO-2's screens are not built. "Everyone sees all" is on. The copy is now stopped.
* **People:** user-R (Owner + Case Manager, licence), user-T (Case Manager, licence), user-O (Case Officer).
* **Scripts (scratchpad, not committed):** `walk.mts`, `crash.mts`, `probe.mts` and `one.mts` under `/tmp/claude-0/-home-user-xpatready/1132a463-11c2-5e69-bcba-81d27c83dd33/scratchpad/rev/`.

## Journeys
1. **Main path, two staff (R, T):** "R sent it; my tab still shows the draft and I change the fee." Expected: refused, nothing ends; after a reload my edit makes version 2 and ends the request once.
2. **Alternate (R):** "The client signed the printed version 1 at the office, although version 2 (new representative, CAD 5,000,000.00) was sent since." Expected: version 1's terms and people are filed as signed; version 2 is kept as not signed.
3. **Recovery, double click (R):** the same Signed offline twice at once. Expected: filed once.
4. **Two tabs (R, T):** Withdraw, Edit and Withdraw at the same moment on a sent retainer. Expected: one wins, the others are told it changed.
5. **Wrong role (O):** a Case Officer withdraws, or records Signed offline. Expected: 403, nothing changes.
6. **Error words (R):** Withdraw from a page that showed Draft; Withdraw with no status. Expected: plain 409; 422 at the field.
7. **Break-it, hostile file (R, then T):** R uploads a tiny template made only of `{`, while T opens a retainer.
8. **Across the boundary (case side):** the form intake receives a 26 MB PDF. Expected: the answer names the limit.

## Observed
| J | Result | Held? |
|---|---|---|
| 1 | T's edit → 409 CHANGED "This agreement is now sent (your page showed a draft). Open it again."; after reload, 200 v2; 1 `retainer.request_ended` `{version:1, reason:"UPDATED"}`, ids only; 1 audit line | yes |
| 2 | 200 SIGNED_OFFLINE, v3 = copy of v1 (fee 150000, same file); v3 `representative.name` = R's, but the record's `representativeStaffId` = **user-T**. Notes: `1:Not signed`, `2:Not signed`, `3:Copied from version 1, signed on paper` | **no** (review M-2, m-2) |
| 3 | `409 CHANGED` + `200 SIGNED_OFFLINE`; 3 versions; 1 `retainer.signed_offline` event | yes |
| 4 | `409, 409, 200 WITHDRAWN`; final WITHDRAWN v1; 0 `request_ended` | yes |
| 5 | 403 "Your roles do not include the permission this needs (agent/retainer:void)."; Signed offline 403; still SENT | yes |
| 6 | 409 "This agreement is now sent (your page showed a draft). Open it again."; 422 with `fields.expectedStatus` "Send the status shown on your page." | yes |
| 7 | 300,000 × `{` (about 1 KB): 422 after **14,253 ms**, and T's read failed (ECONNRESET). 1,500,000 × `{` (2,341 bytes): **the API process died** (heap out of memory, 65 s) | **no** (review M-1) |
| 8 | 413 "This file is too large for this upload.": no 25 MB, no "Nothing was added" (on main it named 25 MB) | **no** (review m-1) |

Normal calls took 35-67 ms each (api.log `durationMs`).

## Data underneath
* J1: `module_event` has 1 row of type `retainer.request_ended`; `audit_event` has 1 `retainer.edited`.
* J2: `fo_retainer_version` n=3 `merge_values->>'representative.name'` = "Representative (Sample)" (user-R), while `fo_retainer.representative_staff_id` = user-T.
* J3: 3 version rows and 1 signed-offline event.
* J5: the server refused it (PF-4's guard) before the service ran.

## Score (0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J6 each reach the person's goal |
| Next step obvious | 1 | every refusal says what to do ("Open it again.", "A version from 1 to 2.") |
| Plain words | ½ | J8 lost the limit; elsewhere the words are plain |
| Feedback and state | ½ | J2 labels the version signed on paper "Not signed" |
| Correct data | ½ | J2: the record's representative is not the one on the signed paper; events exactly once (J1, J3) |
| Error recovery | 1 | reload then edit works (J1); double click (J3) and the 3-way race (J4) are safe |
| Accessibility and screen sizes | ½ | no screen to walk; every 422 carries field-level messages for FO-5s |
| Speed | ½ | the main path is 35-67 ms; a 1-2 KB file blocks every user for 14 s or kills the server (J7) |
| Visual quality | ½ | no screen in this row; nothing to judge |
| Trust and sources | 1 | the audit names the version signed (1) and the version filed (3); "Signed on paper" is filed; payloads hold ids only |

**Score: 7 / 10. Fail** (below 8). Fixes, most valuable first:
1. Count lone delimiters before compiling (raises Speed).
2. Do not file a copy whose representative or signer differs from the record's, or get a Lead B ruling and show the difference (raises Correct data).
3. Keep the intake's 25 MB words (raises Plain words).
4. Do not label the source version "Not signed" (raises Feedback and state).

## Not tested
* No visible browser, axe, 1024 px or 200 % zoom: there is no screen.
* No real screen reader.
* No unaided walk by an intended user (D17 and D20 stay with the founder).
* FO-6's cancel of the signing request (not built).

## Round 4 (final, fresh reviewer, 15 Nov 2026): commit `2b5a79e1d3a970649e306948a3e38d8a246c3ee5`
* **Setup:** isolated copy `rv4_fo5f` on :4437 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), now stopped. Script `http.mts` in `/tmp/claude-0/-home-user-xpatready/1132a463-11c2-5e69-bcba-81d27c83dd33/scratchpad/rev4/`. Diff-only ruling (Lead 53): only the template-upload journeys this diff touches were walked again. J1-J6 and J8 are carried from round 1 plus rounds 2-3's fixes, not walked again.
* **Journeys:** J7a: user-R uploads a real template (`Client {client.name}`, the fee loop), while user-T lists templates. J7b-J7e: R uploads a hostile file and T reads 200 ms later.

| J | Result | Held? |
|---|---|---|
| 7a | a Word-origin template lists its placeholders (direct); the HTTP base template → 201 in 217 ms, T 200 in 16 ms | yes |
| 7b | 1,500,000 lone `{` in the body (2,332 bytes) → 422 TOO_MANY_PLACEHOLDERS in 215 ms; T 200 in 14 ms | yes (round 1's J7 fixed) |
| 7c | a header typed by Override on `word/h.rels` with `{client.passport}` → **201**; `placeholders` omit `client.passport` (printed blank) | **no** (review M-1) |
| 7d | the same header with 200,000 `{` (1,342 bytes) → 422 "We could not read this file." after **9,667 ms**; T's read ECONNRESET | **no** (review M-1) |
| 7e | `[Content_Types].xml` with 1,000,000 `<a/>` (4,800 bytes) → 201 after 13,421 ms, T reset; 2,000,000 (8,696 bytes) → **the API process died** (heap out of memory) | **no** (review N-1) |

### Score, round 4 (0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 7a; J1-J6 carried |
| Next step obvious | 1 | refusals say what to do; the legacy Signed-offline refusal now says "record a new version as signed instead" (test) |
| Plain words | 1 | round 1's J8 words restored (round 2); r2-m1 wording fixed |
| Feedback and state | 1 | "Signed on paper; filed as version N" (round 2) |
| Correct data | ½ | 7c: a placeholder in a header named `h.rels` is accepted and printed blank |
| Error recovery | 1 | carried: reload, double click and races (J1, J3, J4); this diff does not touch them |
| Accessibility and screen sizes | ½ | no screen to walk; field-level 422s |
| Speed | ½ | 7b is fast now; 7d blocks 9.7 s and 7e kills the server from a 9 KB file |
| Visual quality | ½ | no screen in this row |
| Trust and sources | 1 | audit and ids unchanged; no personal values in payloads |

**Score: 8 / 10. Pass by score, no 0**, but the review blocks on M-1 and N-1 (a 9 KB file takes the server down). Fixes, most valuable first: (1) check the size of `[Content_Types].xml` and `_rels/.rels` before any parse (Speed); (2) count and read parts by their type, not their name (Correct data, Speed).

### Not tested (round 4)
* No visible browser, axe, 1024 px or 200 % zoom (no screen); no real screen reader; no unaided walk by an intended user (D17 and D20 stay with the founder).
* J1-J6 and J8 were not walked again (diff-only).
