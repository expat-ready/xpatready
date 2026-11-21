# Review: AUD-4, the firm reads and exports its own activity log (API only)

Reviewed commit **db745c7fd165f02719295a8cd9ff4b669831fe6c** on `claude/epic-albattani-np6e3g` (base `main` 67ae91df2). Fresh reviewer, did not build it. Spec: draft brief `product/design/briefs/AUD-4.md` (main), as corrected by the row owner's brief (`claude/build-lead-c-647b40:…/build-lead-c-briefs/AUD-4.md`; it wins). No screen and no concept, so the browser parts of screen-review and journey-test, D1–D20 and BIC-01–20 are N/A here (AUD-4s part 2 and J-88 carry them). Journey report: `journey-test-reviewer-2026-11-19.md` (API journey **9/10**).

## What I ran
* `tests/check_aud4_firm_log.ts`: **23 passed, 0 failed** (12.6 s). It printed EXPLAIN: Index Scan Backward on `audit_event_firm_id_at_idx`, no Seq Scan.
* Neighbour suites, unchanged: `check_pf6b_permission_rules` 33/0, `check_case_feed` 42/42, `check_pf0p_ports` 123/0, `check_aud1b_adapter` 33/0. `module-cards.py tree` and `pr` PASS. `tsc --noEmit`: no error in any AUD-4 file (the existing errors are in `check_c18`/`check_c69`, untouched).
* My own probes, using scratch databases that were dropped afterwards and scripts kept in the scratchpad, not the repo: (a) every area value plus entity+key, actorType and person-by-`user-O` against the service, all correct; (b) 1M lines: the page query took <1 ms, each `select distinct actor/action` 96–121 ms; (c) 12 stalled exports (see m3); (d) `changesOf` on the export line's own detail (see M2).
* Graph (P-86): `graph.mjs` (no `--write`) maps no `/api/platform/audit` route, because platform routes are outside the graph, so it gave no finding either way.

## Spec fit (corrected brief)
Met: firm only from `staffOf(req)` (service.ts:80, 123, 139), with `?firmId=` ignored; the firm is checked before the cursor; platform lines (`firm_id` null) are never shown; `from`/`to` are required and the limit is one year (Sample); the keyset `(at, id)` gives 20×50 pages over 1,000 equal-time lines with no skip; the page is 50; `people: [{staffId, name, active}]` with leavers kept (DW9); case lines show under Cases; one pair reader `changesOf` (render.ts:19); "ExpatReady staff" / "ExpatReady support" / "The system"; the action registry and `areaOf`; the CSV writer (RFC 4180, formula prefix for `= + - @ \t \r`); the export (snapshot count, then `audit.exported` committed in its own transaction, then streaming with backpressure; a failed line gives 500 and no file; over 100,000 → 413 "Narrow the dates" with no line); no integrity route; no migration, no edit to `ports/`, `audit-event.ts` or `case-feed.ts`; no `@OwnOrAll` (AG-13-44).

## Judgement calls
1. **Accept.** I confirmed `audit-event.ts:52,76`: the adapter refuses every line in an OUR_STAFF request, and the trigger maps no word to OUR_STAFF. A `support_session_id` line is the only "ours" line that can exist on `main`. The filter `actor_type = 'OUR_STAFF' or support_session_id is not null` is the brief's exact wording.
2. **Accept.** The firm-scoped staff lookup (service.ts:83) gives `staff:<id>` plus `actorId`; another firm's id gives `false`. My probe showed `person=<O>` returns the `user-O` case line. That path has no test of its own (folded into M1).
3. **Accept.** Millisecond precision makes the range checked equal the range queried. The breaker's "one year plus a microsecond" gets 400 (DW4).
4. **Accept.** The cursor has microsecond text and is compared as `timestamptz`. DW5 proves equal-time lines are neither skipped nor repeated. A forged cursor carrying another firm's line returns only firm A's lines (DW2).
5. **Accept.** It meets P-607 (3): the line commits before any byte, and the snapshot hides that line and later lines (DW6). Costs are under m3.
6. **Accept.** `areaOf` and the SQL agree for all 7 areas in my probe (cases, configuration, `library …`, other).

## Blockers
None.

## Majors (must fix)
* **M1. The record, area and actor-type filters have no test (STANDARDS §3.10 and §7 [M]: "a rule's test fails when the rule is removed").** R1.88 reads "filters by person, **record** and date", but `tests/check_aud4_firm_log.ts` never sends `entity=`, `entityKey=`, `area=` or `actorType=` (a grep finds none). Failing scenario: delete `service.ts:87` and `:89-101` (the actor-type, area, action, entity and entity-key clauses, keeping only the `action` line DW5 and DW6 use), and the suite still prints 23 passed. The `area` SQL is a second copy of `areaOf` (service.ts:89-98 vs action-names.ts:29-37), with `not … any` branches for configuration and other, so drift between the two would go unseen. The code is correct today (probe a). Fix, test only: one DW line (pass and fail) that filters by `entity`+`entityKey` (a record), by each area including `configuration` and `other` (each line's `area` equals the filter, and no line of another area appears), and by `actorType`. Optionally add `person=` on a simulated person's word (call 2).
* **M2. Every export line shows a fake change, "value: <from> → <to>".** `service.ts:145` stores the export's date range as `detail.from`/`detail.to`, and `changesOf` (render.ts:22) reads a top-level `from`/`to` as a before/after pair with field "value". Failing scenario: an Owner exports, then reads the log (or the next export's CSV "Changes" column) and sees, under "Exported the activity log", `value: 2025-01-01T00:00:00.000Z → 2026-01-01T00:00:00.000Z` (reproduced with `renderLine`). Nothing changed, so this breaks SA-11-30 "each change in words" and shows wrong data in the audit trail. Fix: give the range other key names (for example `rangeFrom`/`rangeTo`, or nested `dates: {from, to}`), and add a DW6 or DW7 assertion that the `audit.exported` line has `changes: []`.

## Minors (should fix)
* **m1.** On every page request, cursor pages included, `page()` scans the firm's whole log twice, one query after the other (service.ts:126, 129: `select distinct actor` and `select distinct action`, which no index serves). Measured: 9–13 ms per page on the seed data, 78–92 ms once 120k lines exist; at 1M lines 96–121 ms per scan against <1 ms for the page itself. It is within the §9 budget at Sample scale. Compute them only when there is no cursor, or run them inside the `Promise.all`.
* **m2.** Impossible dates are accepted. `MOMENT` plus `new Date` (service.ts:22, 41) turns `2026-02-31` into 3 March and `T24:00` into the next day, with no 400. A round-trip check (`toISOString` starts with the input date) would refuse them.
* **m3.** A stalled reader holds one pooled connection and a REPEATABLE READ snapshot for up to 30 minutes (service.ts:160). I started 12 stalled exports one after another: 9 sat "idle in transaction" and 3 failed with 500 (2 "Unable to start a transaction in the given time", 1 "SET TRANSACTION ISOLATION LEVEL must be called before any query"). Fail-closed held, since the failures wrote no line. Ordinary reads still answered in 5–7 ms. A mid-stream failure also ends a 200 CSV short, with only `X-Export-Rows` to show it. Consider a shorter timeout or one export per firm at a time.
* **m4.** Comment rule (§7 [M]: no lanes, dates of work or status). Offending comments: render.ts:3-6 ("Build Lead C's correction 4", "found on main 19 Nov", "none written on main yet"), render.ts:41-42 ("not on main", "correction 5"), action-names.ts:44 ("sampled 19 Nov"), service.ts:121 ("correction 3"). Cite the decision or requirement numbers instead.
* **m5.** `whoOf` labels any FIRM_STAFF word without a staff row as "A former staff member" (render.ts:49), for example the configuration people `user-A/B/C`, who have no staff row. The label claims a fact the code does not know.
* **m6. Note.** DW6's "a firm action does not wait" cannot fail on `main` today, because there is no per-chain lock while AUD-1c is parked. The read-only outer transaction makes the design structurally safe, so this is not a defect.
* **m7. Process.** `api/src/platform/MODULE.md` conflicts with `main` (CS-DL1's `calendar/` sentence). Merge `main` and keep both sentences. Re-review then covers only the merge commit.

## Could not check
The PR body (EXPLAIN paste, contract gap, case writes still direct, `Duplicate check:` line), because the PR is not open yet. Full CI. `check_aud1a_insert_only`, `check_pf4_identity` and `check_pf4b_session_reads` were not run by me.

**Verdict: Block** (commit db745c7fd165f02719295a8cd9ff4b669831fe6c). To fix: **M1** (filter tests: record, area, actor type) and **M2** (the export line's fake change). Minors m1–m5 are recommended, and m7 is needed to merge.

---

## Re-review: head cf4d8c39848799e636513d0d603f55d292fc67f0 (new commits only)

Read `git diff db745c7fd..cf4d8c398`: 633fefa7f (the fixes), 78f374997 (merge of `main`; among this PR's files it touches only `MODULE.md`, keeping `main`'s line plus the `audit/` words, so m7 is closed) and cf4d8c398 (the check builds its app from `features/audit-firm-read.ts`). `tests/check_aud4_firm_log.ts` at the head: **31 passed, 0 failed** (18.7 s, run by me).

**Earlier findings**
* **M1: closed.** DW10 covers `entity`, `entity`+`entityKey`, `actorType` and `person=` for a simulated person, and checks that for each of the 7 areas the filter equals `areaOf` over every June line. It also checks that filters combine. The area SQL now reads `AREA_PREFIXES` (action-names.ts), the same list `areaOf` uses.
* **M2: closed.** The range is stored as `rangeFrom`/`rangeTo` (service.ts:171), and DW6 asserts the export line has `changes: []`.
* **m1: closed.** `people`/`actions` are computed only on the first page, inside the `Promise.all` (service.ts:139).
* **m2: closed.** `realMoment` refuses 31 February, hour 24 and years before 1970; the cursor time gets the same check (DW4).
* **m3: closed.** The CSV is built in full inside the read-only snapshot and written to a private temp file (mode 0600). The transaction then closes and only after that is the file streamed. At most 2 exports run at once and 8 wait, beyond that a 503. I confirmed `main.ts:189` rewrites every 413, so the route's own 413/503 bodies are right.
* **m4: closed.** The comments are clean.
* **m5: closed.** The fallback now reads "Staff member not on this firm's team list".
* **m6: moot.** The file is whole before the first byte.

**New finding**
* **M3 (Major, test only): DW6's snapshot case can no longer fail.** STANDARDS §7 [M] says a rule's test fails when the rule is removed. Since the redesign, the file is complete and the transaction closed before `fetch` resolves. The test inserts its "late" line after the first chunk arrives (check_aud4_firm_log.ts:176), so that line can never be in the file whatever the isolation level. Nothing else inserts lines while the file is being built, so "the count and the file agree" goes unchecked too.
  * **Failing scenario (run by me in a scratch copy, repo untouched):** change service.ts:168 to `read committed, read only` and the suite still prints **31 passed, 0 failed**.
  * **Fix, test only:** start the export, poll until its `audit.exported` line exists (it commits after the count and before the first batch), then insert an in-range line at the oldest end of the range (the descending batches reach it last). Assert that the file has exactly `X-Export-Rows` rows and no such line.

**New minors (should fix)**
* **n1.** If the process dies between building the file and `done()`, the export CSV (personal data in full) stays in `os.tmpdir()/aud4-export-*`, because nothing sweeps it at start-up (service.ts:164).
* **n2.** A queued export (`slot()`, service.ts:196) still runs when its reader has already left. It writes an `audit.exported` line and builds a file nobody receives. The line is true (the data was read), but the work is wasted. Consider checking `req` still being open before taking the slot's turn.

**Journey score at the head: 10/10** (correct data and feedback now 1; see the journey report).

**Verdict: Block** (commit cf4d8c39848799e636513d0d603f55d292fc67f0). To fix: **M3** (make DW6's snapshot case fail when the snapshot is removed). n1 and n2 are recommended. No other finding is open.

---

## Re-review 2: head c448cf1de7a2d706c35ad3f4a61813a6e1201910 (new commit only)

I read `git diff cf4d8c398 c448cf1de -- …/prototype/studio`, which changes routes.ts, service.ts and the check. `tests/check_aud4_firm_log.ts`, run by me at the head: **33 passed, 0 failed**.

* **M3: closed.** DW6 now starts the export and waits for its `audit.exported` line, which commits after the count and before the file is written. It then inserts lines at the oldest end of the range until the export answers, and asserts three things: at least one insert committed before the answer (56 in my run), none of them is in the file, and the file's rows equal `X-Export-Rows`.
  * **Mutation re-run by me** in a scratch copy (repo untouched), with service.ts set to `read committed, read only`: **31 passed, 2 failed**. Both DW6 cases fail: 49 late lines and 100,050 rows against `X-Export-Rows` 100,000. The snapshot rule's test now fails when the rule is removed.
* **n2: closed.** The route sets `left` on `close` before the response ends. After taking its place in the queue, the service stops with 499 EXPORT_CANCELLED before any line or file, and the route stays silent. Tested: the 499, and no line written.
* **n1: closed.** `onModuleInit` removes `aud4-export-*` folders over an hour old and keeps fresh ones. Tested. Deleting a file that another process is still streaming is harmless on Linux, because the open read stream keeps the file readable.
* **m6: closed.** The sign-out case is bounded at 5 s and says that it guards the future (AUD-1c).

No new findings. Nothing open from either earlier round. Journey score stays **10/10**.

**Verdict: Approve** (commit c448cf1de7a2d706c35ad3f4a61813a6e1201910).
