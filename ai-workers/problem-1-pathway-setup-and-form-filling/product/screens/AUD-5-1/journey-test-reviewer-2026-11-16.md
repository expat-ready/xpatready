# AUD-5 part 1: journey test, reviewer (PR #2008, commit 34686f285), 16 Nov 2026

This row is API only and has no screen (brief: "API only, no screen in this part"). So each journey was walked through the API on an isolated copy, `rvaud5` on :4436 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), as a person's requests would arrive from a screen. The data underneath was read with psql. I did not use :4400. Sessions: user-R (Owner, sample-firm), user-O (Case Officer, sample-firm), user-S (Owner, sample-solo).

## Journeys (persona · goal · steps · expected → result)
1. **Main path.** Owner: "see how long we keep things, and set our closed-file number". GET, then PUT `{years:8}`. Expected: the table, 6 (Sample) read back, 8 saved, one audit line. **Held**: 200 in 10 ms. The read gives SA-11-14's sentence, the College reference with its citation, and 7 rows. The save returns 200 in 29 ms, and the audit line reads `6→8` with `staff:<id>`.
2. **Alternate (below 6).** Owner: "we keep files for 5 years, because our parent firm holds the originals". PUT `{years:5}` → 400 REASON_NEEDED, with the s. 7.2 warning in `detail`. Then `{years:5, reason:"… Ünïcödé ✓ 日本語"}` → 200, with the warning in the answer. **Held**: the audit line holds "Warning shown: … s. 7.2 … Reason given: …", Unicode intact.
3. **Boundary.** Owner saves 6 → 200, `warning: null`, no reason on the line. **Held.**
4. **Empty.** A firm with no number: the read says "Not set: your firm has not chosen …", with `years: null` and no default. **Held** (DW3, and my JSON-null row read as "not set").
5. **Error (bad input).** 0, -1, 51, 1000, 6.5, "6.5", "8", null, [8], {}, 1e400 → each gives 400 INVALID_YEARS, "Enter a whole number of years from 1 to 50.", and nothing is written. **Held**. 1e1 and 8.0 save as 10 and 8, which is correct JSON.
6. **Wrong role.** The Case Officer reads it (`canChange: false`). Their PUT → 403 MISSING_PERMISSION, which names the key. No token → 401. **Held.**
7. **Firm from the request.** `firmId` in the body → 400 INVALID_BODY. `?firmId=…&firmKey=sample-solo` → ignored; the session's firm was saved. The Solo Owner's 12 never shows on sample-firm's read. **Held.**
8. **Recovery.** Saving the same value again gives one more line, "saved unchanged". The demo reset (`POST /api/demo/reset`) returns 7→6 and null→6, each with a `system` / "demo reset" line. **Held.**
9. **Across the boundary.** The next consumers are CS-D6 (`forFirm`) and part 2 (`check()`). `check()` throws KeepCheckNotBuilt in the fake and in the adapter, so no caller can get a silent OK. **Held as designed.**

## Replayed as automated checks
`tests/check_aud5_keep_periods.ts`: 50 passed, 0 failed, on two runs (main tree, and a clean worktree of 34686f285). Thirteen mutations: 12 were caught by named cases. One survived, and it is not a gap: reading the firm from the body is also blocked by the strict body (M4 alone is caught).

## Data underneath
One row per firm per key. One audit line per save, in the setting's own transaction. Values exactly as sent. Firm B was untouched by every firm A request. The definition row holds `default_value null` and the change permission `agent/legal-settings:manage`.

## Break-it (complements the breaker's `break-report.md`; no overlap re-scored)
Writing `null` through `writeSetting` for this key **succeeds**. It is stored as JSON null and reads as "not set". So the PR's claim that the reset "would crash" on null is wrong (see review m1). The other edges are in break-report m1–m7.

## Score (0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–3: read, save, below-6 save with a reason, all end to end |
| Next step obvious | 1 | A 400 says what to send ("Give a reason to save it."); `canChange` tells a screen whether to offer the edit |
| Plain words | 1 | "Not set: …", "This is a reminder, not a lock …", "1 year" in the singular; "legal obligation" and "required by law" never appear |
| Feedback and state | ½ | The answer can report another request's value under parallel saves (break m5). A reason typed with 6 or more is dropped without a word (break m3) |
| Correct data | 1 | psql: values, from/to, actor and firm exact; the walls held |
| Error recovery | 1 | Every refusal writes nothing; the demo reset returns Sample values with a trail |
| Accessibility and screen sizes | 1 | Not applicable: no screen in this part. Scored on the API equivalent: problem+json with `code`, `detail` and `warning` a screen can read aloud |
| Speed | 1 | GET 10 ms, PUT 13–33 ms (well inside the STANDARDS §9 budgets) |
| Visual quality | 1 | Not applicable: no screen. The answer's shape is consistent with PF-4's problem documents |
| Trust and sources | 1 | The College row carries the document, version, s. 7.2, page 7 of 9, the quote, the URL, read 2026-11-16 and "Unconfirmed: no counsel"; each row names its sources |

**Score: 9.5 / 10. Pass** (8 or more, no 0).

Fixes that would raise it: (1) build the PUT's answer from the value this request wrote, not from a re-read; (2) keep or refuse a reason sent with 6 or more.

## Could not test
* A real screen reader, and an intended user's unaided walk: there is no screen. D17 and D20 stay with the founder.
* The College PDF at its URL: the proxy refused the fetch (CONNECT 403). The quote is checked against the brief only.
* Full CI: the PR is a draft; only module-cards has run on this sha.
