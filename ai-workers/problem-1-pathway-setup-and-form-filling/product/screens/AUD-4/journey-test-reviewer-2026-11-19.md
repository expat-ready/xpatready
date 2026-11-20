# Journey test (reviewer): AUD-4 API, firm activity log, 19 Nov 2026

Commit db745c7fd165f02719295a8cd9ff4b669831fe6c. API only, with no screen, so steps 2–3 of the skill (visible browser, Playwright, axe, widths) do not apply; J-88 in AUD-4s part 2 walks them. The journeys were driven over HTTP by `tests/check_aud4_firm_log.ts` (Nest app, real PostgreSQL scratch database) plus my own probes of the service in the scratchpad, with the data read underneath each time.

## Journeys
1. **Main.** An Owner reads one year of the firm's log, gets 50 lines and a `next` cursor, plus `people`/`actions`/`areas` for the filters. **Held** (DW1; 9–13 ms per page).
2. **Alternate.** An Admin does the same. **Held** (DW1).
3. **Filter by person, including one who left.** The deactivated Admin is in `people` with `active: false` and their lines carry their name. **Held** (DW8, DW9). Person by a simulated word (`user-O`) **held** in my probe.
4. **Filter by record, area and actor type.** **Held** in my probe (entity+key returns the one line; all 7 areas right; SYSTEM only). **No test covers it** (review M1).
5. **Page through 1,000 lines with the same time.** 20 pages, no skip, no repeat. **Held** (DW5).
6. **Export.** 100,000 rows; the `audit.exported` line is committed before the first byte with the right count; a line written meanwhile is not in the file; a formula is written `'=`. **Held** (DW6; 0.73 s). The export's own line then reads as a change, "value: from → to" (**M2**).
7. **Error.** No `from` → 400 DATES_REQUIRED; one year + 1 ms → 400 RANGE_TOO_LONG naming the limit; a bad cursor → 400 "start again from the first page"; an export over 100,000 → 413 "Narrow the dates". **Held.** `2026-02-31` is accepted as 3 March (m2).
8. **Wrong role.** Case Officer → 403 MISSING_PERMISSION on both routes; no token → 401; a deactivated Admin's token is refused. **Held** (DW1).
9. **Other firm.** A forged cursor naming firm B's line, B's staff id as the person filter and `?firmId=B` all give firm A's lines only. **Held** (DW2).
10. **Recovery.** The audit write is forced to fail → 500, no CSV, no line. **Held** (DW6). Stalled readers: see m3.

## Break-it (15 min)
Run: forged cursor, other firm's person, range of one year + 1 µs (400), `=HYPERLINK`/`@SUM` cells, export racing new lines (count matches file), deactivated person's token (all held). 12 stalled exports: 9 hold connections and 3 fail closed with 500 (m3, Minor). 1M lines: the two `distinct` scans on every page cost 96–121 ms each (m1, Minor).

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | All journeys 1–10 complete; 23/23 |
| Next step obvious | 1 | `next` cursor; `people`/`actions`/`areas` feed the filters; 413 says "Narrow the dates" |
| Plain words | 1 | Problem Details in plain sentences; action words registered; "ExpatReady support/staff" |
| Feedback and state | ½ | `X-Export-Rows` given, but a mid-stream failure ends a 200 CSV short with no marker (m3) |
| Correct data | ½ | Export line shows a fake change (M2); impossible dates silently roll over (m2) |
| Error recovery | 1 | Each 400 names the field and the fix; bad cursor → restart; fail-closed export |
| Accessibility and screen sizes | 1 | No screen: scored as a consumable contract (RFC 9457, RFC 4180 CSV, UTF-8 BOM for spreadsheets) |
| Speed | 1 | Page 9–13 ms (sample), 78–92 ms at 120k lines; export of 100k in 0.73 s; index plan shown |
| Visual quality | 1 | No screen: one consistent answer shape for list and CSV columns |
| Trust and sources | 1 | Limits labelled Sample; the export logged before its data; raw `detail` under Advanced |

**Score: 9 / 10. Pass** (8 or more, no 0). The two Majors in `review.md` (M1, M2) still block the merge.
To raise it: fix M2 and m2 (correct data → 1), then add an end-of-file marker or trailer row count check for truncated exports (feedback → 1).

## Not tested
A real screen reader or an intended user's unaided walk (D17/D20 stay with the founder; no screen here). Browser, axe and widths belong to J-88.

## Re-score at head cf4d8c39848799e636513d0d603f55d292fc67f0
Re-walked journeys 1–10 through the row's check (31/31) and read the new code. Journey 4 is now covered by DW10. On journey 6, the export line shows no change any more (M2 closed), and the file is complete before the first byte. Six readers who stop mid-download hold no database connection, and firm B's export still answers 200 in 28 ms. On journey 7, impossible dates are now 400. **Correct data 1, feedback and state 1** (no truncated file from a failure mid-build, 503 "Exports are busy" in plain words). **Score: 10 / 10. Pass.** The open item is a test gap (review M3), not something a user would meet.
