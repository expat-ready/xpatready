# CS-W3 part 2-review: hand-over to a fresh lane (no code written yet)

22 Nov 2026, ~23:0x IST. From the FO-7c part 1 builder session (#2938 merged), stopped at ~78% context on Lead 7's word.
Branch with this note: `claude/dazzling-thompson-1ndong` (= `main` `cff0a6c24` + this records folder). A fresh lane starts its own branch from `origin/main`.
Brief: `product/design/briefs/track-b/CS-W3-2-review.md` on `lead-b/2026-11-22-track-b`; spec `product/design/briefs/CS-W3.md` (main), part 2, area `2-review`.

## Rulings (word for word where given)
* **Lead 7, census rule:** "the first option (DW5 cases in check_csw3_firm_scope.ts with the walls on, proven files move from ALLOW to a PROVEN list, no edit to the ten files) is right."
* **Lead 7, the `/api/activity` gap:** report it, do not fix it in this part.

## What was found (evidence: `walled-journeys.md` in this folder)
* With the walls on (`csw3-spike.sh suites a`), this area's journeys already pass with **no code edit**: `check_c76_readiness_api` 34/34, `check_a24_case_number_api` 23/23, `check_b162_no_copy_api` 7/7, `check_c81_signing_api` 47/48.
* Why: part 1's door (`features/case-firm-door.ts`) tags every staff `/api/runtime/*` request with the person's firm; PF-12's `FirmWallsInterceptor` opens the handler's scope from it; `WalledPool.connect` sets `app.firm_id` on every connection checked out in that scope, interactive `$transaction`s included. None of the ten files runs outside a request.
* So the spec's "one-line call at the start of each transaction" is redundant here, and the census, a **static** scan (`tests/fixtures/csw3/csw3-spike.sh census`, which lists every case-side file touching a case table whatever it does), would keep listing the ten files. Dropping them from `ALLOW` alone fails "CS-W3 census pass".

## The plan (Lead 7's option 1), touch list only
1. `tests/check_csw3_firm_scope.ts`:
   * **DW5 cases**: on the scratch copy with the walls on (the suite already builds one in `scratch()` and drives the API in `api()`), drive this area's routes as `sample-firm` staff and assert the firm's own data reads, and as `sample-solo` staff assert 404 on that case, for readiness (`readiness.ts`), sign steps (`sign-steps.ts`), filing record and submission record (`filing-record.ts`, `submission-record.ts`), a review round and its stamp (`review-rounds.ts`, `review-stamp.ts`, `/runtime/filings/:id/ready`), review runs (`review-runs.ts`), findings (`findings.ts`), submission (`submission.ts`) and release update (`release-update.ts`). A pass and a fail each (P-606).
   * **`PROVEN` list**: a map from each of the ten files to the DW5 case(s) that prove it; the census accepts a listed file when it is in `ALLOW` **or** in `PROVEN`, and `PROVEN` entries must each name a DW5 case that exists and passed in this run (so deleting a case puts its file back on the census).
   * `ALLOW` loses the ten files (47 → 37); the "47 at part 1" count in the census case's words and assertion changes to 37 plus the PROVEN count.
   * **DW5 fail**: the brief's "a deliberately unscoped query planted in a test file of the area fails the census" (the suite already plants `zz-csw3-planted-*.ts`; add the area variant).
2. `api/src/MODULE.cases.rows/CS-W3-2-review.md`: `Tests: tests/check_csw3_firm_scope.ts`.
3. No edit to the ten files, no migration. Not `MODULE.cases.md`, `runtime.ts` or `case-feed.ts` (held elsewhere).

## Still to run walled (no usage line the spike can drive; drive them from DW5 instead)
`check_c75_review_runs_api` (`review-runs.ts`), `check_c95_release_update` (`release-update.ts`), `check_bk17_keep_recorded` and `check_qa295_recorded_people` (`submission.ts`, `submission-record.ts`); `findings.ts` has no suite of its own.

## To report in the PR (not to fix here)
`GET /api/activity` (`main.ts:103` → `studio.ts` `activity`) is not under `/api/runtime/*`, so the door sets no firm and, walled, it reads no case rows: `check_c81_signing_api` "pass (#924): the firm's own officer reads this case's sign and scan lines in the activity feed" answers `{"status":200,"entities":[]}`. `main.ts` and `studio.ts` belong to no part 2 area (`studio.ts` is on `ALLOW` but unassigned): a gap for the row owner (a new row, or part 3).

## Lane notes
* PostgreSQL in this cloud container was killed several times today (log: "end-of-recovery"). Start it with `pg_ctl -D .tools/solution-1-prototype/pg18-data -o "-p 54329 -k /tmp -h 127.0.0.1" -l .tools/solution-1-prototype/pg18-data/server.log -w start`, or re-run `product/tools/cloud-setup.sh`.
* Review: Opus reviewer at high and the breaker (permissions, P-278). PR rule P-683: Approve on the branch first, then open the PR non-draft. Do not label without Lead B's and the Lead's read.
* `2-forms` waits on this part (both edit `ALLOW`).
