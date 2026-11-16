# PF-18a part 1 (offices): journey test, reviewer, 16 Nov 2026

Commit `6ba0a5e69690229b8749bbe05713cd6cf7e7e838` (branch `claude/zealous-rubin-lxcmfs`, draft PR #2009). Isolated copy `rv18a` on :4433 (runtime range 4430-4439; `PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`, `--ttl 30`), started before the builder's uncommitted working-tree edits (its database had the commit's trigger functions), stopped after. Live AI off, US$0.

**This row has no screen** (PF-18s builds it). So the journeys were walked as HTTP calls through the product's own routes, signed in with the local stand-in as each role. No browser, no Playwright, no axe. The three UI-only criteria are N/A (below).

## Journeys (persona · goal · steps · expected → result)
1. **Main.** Owner, sample-firm: "add our Calgary office". GET list → POST `{name: Calgary, province: AB}` → GET → PATCH zone `America/Regina`. Expected: one implicit office with no zone field, then Edmonton pre-filled, the first office written from firm settings, the change saved and audited. **Held**: 201, `timeZoneFrom: "province"`; the first office has `ON`/`America/Toronto` and the firm's hours; the audit line `platform.office.time_zone_change` says "from America/Edmonton to America/Regina".
2. **Alternate.** Owner: an office abroad (`country: FR`, a province given) and a non-English name (`Montréal 東京`, QC). **Held**: both 201; FR gets the firm's zone and no province; the Unicode name is kept exactly.
3. **Empty.** Owner, sample-solo: list with no office. **Held**: `multipleOffices: false`, one implicit office named after the firm, no `timeZone` key.
4. **Error.** Zones `America/Toronto ` (trailing space), `Mountain` and `null`; province `Alberta`, `ZZ`; a 121-character name; a control character in the name; a string body. **Held**: each one 400 with plain words ("Choose a time zone from the list", "Choose a province or territory from the list") plus an `issues` line for the field; nothing stored.
5. **Wrong role.** Case Officer and Case Manager: POST and PATCH. **Held**: 403 `MISSING_PERMISSION` naming `agent/settings:edit`. Both may GET (AG-1-74 §8: reading is for all staff).
6. **Other firm.** sample-solo's Owner PATCHes sample-firm's office. **Held**: 404 "No such office."; an id that is not a uuid also gets 404.
7. **Recovery (double click).** Two identical POSTs at once. **Held**: one 201, one 409. A name equal to the firm's own name on the first add gets 409, and the first office is rolled back too (the list is still implicit).
8. **Boundary (OfficeClockPort).** The port's contract runs on the real adapter and on the fake in `tests/check_pf18a_offices.ts` (I re-ran it: 71 passed, 0 failed). `check-port-contracts.mjs`: OfficeClockPort ×2, 0 problems.

## Data underneath
Each add writes one row plus one audit line, and the first add writes two rows plus two audit lines. Firm settings are untouched. An `xr_app` session without a firm reads nothing (the suite's walls cases, re-run).

## Break-it pass (findings; details and fixes in `review.md`)
* **Major on 6ba0a5e, closed on 081df1d** (the real keys refuse the delete; re-checked on a scratch database). Deleting a staff member placed in an office **succeeds** and leaves an orphan `platform_staff_office` row (SQL in a rolled-back transaction: `DELETE 1`, orphan_rows 1). The trigger checks run on insert only (`migration.sql:63-73`). Lead B ruled real keys on #2009, 16:19Z.
* **Minor:** two parallel PATCH renames to `Twin<i>` and `twin<i>` both answered 200 in **10 of 10** runs. Same-case renames are fine: 409/200 each time (P2002 maps to 409).
* **Minor:** two parallel PATCHes of the same office's zone write two audit lines that both say "from America/Vancouver". One of them has the wrong "before".
* **Minor:** PATCH `{province: "BC"}` on a US office answers 200 and stores nothing. PATCH `{}` writes an audit line "Office changed" although nothing changed.

## Score (each 0, ½, 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-3 through the product's own routes |
| Next step obvious | 1 | `multipleOffices`, `first` and `timeZoneFrom` tell the screen what to show |
| Plain words | 1 | The AG-1-74 wording "Choose a time zone from the list"; each issue names its field |
| Feedback and state | ½ | An ignored province still gets 200 with no field error; "Office changed" is logged for an empty PATCH |
| Correct data | ½ | Orphan rows on staff delete (6ba0a5e only; fixed in 081df1d); names differing only in case get in under a race; the audit "from" is wrong under parallel PATCHes |
| Error recovery | 1 | Double POST gives 201 + 409; a failed first add rolls back the first office |
| Accessibility and screen sizes | N/A | No screen in this row (PF-18s) |
| Speed | 1 | Every call 7-73 ms on the isolated copy |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | The zone pack cites tzdata 2026e `zone1970.tab`, read 2026-11-16. I checked each quoted comment against `/usr/share/zoneinfo/zone1970.tab` and they match; our own choices are labelled "ours" |

**Score: 7 of 8 applicable criteria (8.75/10 scaled), no criterion at 0: Pass.** On 081df1d the score is unchanged: 7 of 8 applicable, Pass. On 9b1dc85 the findings behind the two ½ scores are fixed (keys, case-blind names under lock, version → 409, province abroad → 400, no-op writes nothing; re-run 85/0). The score stays as walked on 6ba0a5e; a re-walk would likely give 8 of 8. The most valuable fixes come first: case-insensitive name uniqueness under lock (correct data), and a 400 or explicit drop for a province abroad (feedback).

**Could not test:** a visible-browser walk, axe, widths and keyboard (no screen). D17 and D20 stay with the founder. The real case-side and booking callers of OfficeClockPort do not exist yet (part 2; contract gap).
