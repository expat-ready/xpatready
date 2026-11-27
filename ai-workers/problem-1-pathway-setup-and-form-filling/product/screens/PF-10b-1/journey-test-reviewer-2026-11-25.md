# Journey test (reviewer): PF-10b part 1, the import engine, API-level only

Head: `36321e5bce188c69a6cefe898fa160add1717fdc`, 25 Nov 2026. **Scope:** there is no screen in this part (PF-10s and j_35 are part 4), so these are API-level journeys. They were walked by HTTP calls against:
* (a) the builder's Nest harness with a reviewer test target that writes to a real table in the row's transaction (scratch database);
* (b) the real app on :4430 with a scratch database and the local sign-in.

No browser walk, axe check, width or keyboard test was possible. Criteria that need a screen are scored on the API's words and state only, and are marked so. Live AI off, US$0.

## Journeys (persona · goal · steps → expected / result)
1. **Main.** The Owner wants to bring their old CRM's contacts in once. Upload a 5-row CSV, map the columns, preview, attest, run. Expected 1 create, 1 merge, 1 skip, 2 errors, each error with its reason in words. **Held** (builder check DW2-DW5, 43/0).
2. **Re-import.** The same file again. Expected 0 created and nothing added. **Held:** 0 create, 3 skip, 2 error, and the store is unchanged (DW5). The state reads FAILED for a correct "nothing new" run, which is the DB's rule.
3. **Error: bad mapping and missing declaration.** A field mapped twice, a required field unmapped, a consent column without the declaration. Expected 422 naming each column. **Held** (DW3).
4. **Wrong role.** A Case Officer uploads, lists or attests. Expected refusal. **Held:** 403 in the harness and on :4430, and 401 with no session (:4430).
5. **Recovery: crash mid-run, then run again.** Expected to resume with the preview's outcomes, every row once. **Partly held:**
   * Every row is written once.
   * But B1: a row whose earlier twin was an ERROR (name missing) turns from CREATE to a false SKIP after the resume, and the person is lost (engine.ts:234-242).
6. **Recovery: one row the target cannot write.** Expected the row recorded as an error and the run to go on. **Failed (B3):**
   * Every run call answers 500.
   * The batch is stuck RUNNING for good.
   * A new preview is refused (engine.ts:210-222).
7. **Recovery: double click.**
   * Run twice at once: each row once, 30/30. The second answer says "the preview has changed", which is wrong words.
   * Preview twice at once: one 500 (B4, B5).
8. **Across firms.** Firm B opens firm A's import. Expected 404. **Held** (DW6).
9. **Two batches with the same new people at once.** Expected each person once. **Held (B6):** 40/40 distinct, because the advisory lock works.
10. **Boundary to the next step.** A created record's origin. Expected Import + batch + source. **Held** (DW6). On :4430 with no target registered: an empty target list and an upload refused 404 NO_SUCH_TARGET, as the PR says.

## Break-it (15 min)
Held:
* A formula `=cmd|'/c calc'!A1` is stored as text.
* `<script>` as the source is stored as text.
* A French `;` file with accents is read.
* A bad id gives 404.
* A JSON body gives 415.

Found:
* A 201-character source gives zod's English message.
* A file over 5 MB on the real app gives "This file is too large for this upload." with no limit named (main.ts:204 rewrites the engine's 413).
* A target's own unique violation (P2002) is swallowed: the batch ends COMPLETED with one row missing (B2).

## Score (0, ½ or 1; API-level evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The main path and re-import complete. A poison row (B3) or a resume (B1) leaves the task undone or wrong. |
| Next step obvious | ½ | API only. Errors name the next step ("run the preview again", "tick the declaration"), but a stuck RUNNING batch has none. |
| Plain words | ½ | Reasons are in words with no values. B4's wrong message, zod's "Too big", and the 413 not naming the limit. |
| Feedback and state | ½ | State and totals on every answer. A failing row gives a bare 500 and RUNNING forever. |
| Correct data | 0 | B1 loses a person after a resume. B2 drops a row's outcome while the batch reads COMPLETED. |
| Error recovery | ½ | The crash resume works and each row is written once. Poison row: no recovery. |
| Accessibility and screen sizes | N/A → ½ | No screen. Neutral half point, not evidence. |
| Speed | ½ | Upload 36 ms, view 26 ms, dry run 2.5 s. The 5,000-row run takes 17.8 s inside one request. |
| Visual quality | N/A → ½ | No screen. Neutral half point. |
| Trust and sources | 1 | Origin = Import + batch + source. The attestation wording is marked Sample and "Unconfirmed: no counsel". Audit has counts only. |

**Total 5.5/10: below the pass and with a 0 (correct data). Not a pass.**

## Fixes that raise the low criteria (most valuable first)
1. Correct data: make `keyOf` follow `decide` (B1), and swallow P2002 only for the import row's own key (B2).
2. Task completed and recovery: record a failing row as ERROR and continue, and give a stuck batch a way to finish (B3).
3. Speed: move the run to the worker (JobPort), or record the tech lead's acceptance of the in-request run.
4. Words: B4's message, the source length message, and the 413 naming the 5 MB limit through main.ts's filter.

## Could not test
A browser, keyboard, axe, widths, a screen reader and an intended user's unaided walk (D17 and D20 stay with the founder, part 4). A real person target with consent (PF-10t). Remote database latency.
