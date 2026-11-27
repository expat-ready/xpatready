# Break report: PF-10b part 1 (R1.35), the import engine — PR #3644 at 36321e5

Breaker, 25 Nov. API and database only (no screen). Scratch database `xr_studio_pf10b_break_<pid>` on 127.0.0.1:54329, Nest app on
:4433 (never :4400), PF-4's guard, the local sign-in (user-R Owner, user-O Case Officer, user-T given ADMIN, user-S Owner of
sample-solo). The target is a scratch one that writes its own table `zz_contact` **in the engine's transaction**, so the
advisory lock, P2002 and PF-10a's triggers act for real. Error filter copied from main.ts `ProblemErrors` (HttpException as is,
P2002 → 409, anything else 500). Scripts: scratchpad `attack.mts`, `attack2.mts`. Live AI off, US$0. Both scratch databases dropped.
Scope: the PR's "Done when" and PF-10b part 1 only. Undo, report, notification, .xlsx, JobPort, ScanPort, people and consent are not checked.

## Findings

**F1 — Major. If the file has a column header longer than 200 characters, the preview passes but every run is a 500.**
Repro: upload `Full name,E-mail,<250 × "Q">` with 2 rows, then dry-run `{columns:{"Full name":"name","E-mail":"email"}}`.
The dry run answers 201: DRY_RUN_READY, 2 to create. Then `POST /run {dryRunHash}` → **500**. The ZodError text is the detail
("invalid_key … too_big … maximum 200"). Running again → 500 again. The batch stays DRY_RUN_READY for good and nothing is imported.
Cause: header cells may be up to MAX_CELL (2,000) characters (csv.ts:10). `dryRun` stores every header as a mapping key
(engine.ts:129). `run` re-parses the stored mapping with `Mapping.parse` (engine.ts:190, and `ctx()` at :64), and `Mapping` caps
keys at 200 (ports/import-target.ts:86). The same cap means a long-header column cannot be mapped at all: sending it back
→ 422 INVALID_INPUT. The saved mapping for that source also fails `safeParse` from then on, so it is never offered again
(next upload: mappingFrom "headers"). Long headers are common in real files, for example a form-tool export where the header is
the full question.
Should: one limit for header names, the same in the reader and in `Mapping`. A header over that limit should be refused at
upload in words naming the limit. The run should never 500 on a mapping its own dry run accepted.

**F2 — Major. After a crash and resume, a row the preview said to CREATE is skipped with a false reason, so a good person is never imported.**
Repro: file `Full name,E-mail,City` / `,dup@x.test,T` / `Bob,dup@x.test,T` / `Cy,cy@x.test,T`. The preview says row 1 ERROR
`required`, rows 2 and 3 CREATE. Make the target throw once while creating row 2 (a crash), so the run → 500 with the batch RUNNING.
Run again with the same hash → 201 PARTIAL. Row 2 is now **SKIP `duplicate_in_file`** ("is the same as an earlier row of this file
(that row is imported)"). No record exists for dup@x.test (count 0).
Cause: on resume, rows already written are replayed through `keyOf` (engine.ts:208). The same happens after a P2002 (:221).
`keyOf` (:234-242) adds a row's natural key to `seen` without the engine's own `required` check (:165-168), but `decide` gives
such a row ERROR and never adds its key. So the resumed run decides later rows differently from the preview and from an
uninterrupted run. AG-18-20 says a restart writes what the first pass would have written. The Done when says good rows are
imported once.
Should: a replayed row adds its key to `seen` only when `decide` would have (same checks), so a resumed run gives the same outcomes.

**F3 — Minor. If a second run joins a batch that is already RUNNING (a retry after a lost connection, the designed resume path), it can get PF-10a's trigger as a 500.**
Repro: batch of 20 rows, target create about 25 ms. Start `run`, wait 300-660 ms, start the same `run` again. In 1 of 10 tries the
joining call got **500** "plat_import_row: kept for undo and the batch list (INSERT of a RUN row refused while the batch is
COMPLETED)". The first call had finished the batch while the second was still going through rows already written. The data
held: 20 RUN rows, 20 records. The catch at engine.ts:218-222 accepts only P2002. Should: when a run finds the batch already
finished (the trigger's refusal, or a re-read of the state), answer 409 ALREADY_RUN or the finished view, not a 500.

**F4 — Minor. A NUL byte in a header gives a 500 at upload and leaves the file stored with no batch.**
Repro: upload `Full name,E-mail,No\u0000te` + 1 row → **500** "unsupported Unicode escape sequence" (jsonb cannot hold the
header as a mapping key). The file store count went up by 1, but no batch was created. The file is stored (engine.ts:110)
before the batch insert (:116). Should: refuse control characters in header names in words (422), before anything is stored.

**F5 — Minor. A column named `__proto__` can never pass the dry run. `constructor`, `toString` and similar names are refused unless sent as null.**
Repro: header `Full name,E-mail,__proto__`. Dry-run with the correct mapping, with or without `"__proto__": null` → 422,
`Column "__proto__" is mapped to a field that does not exist`. zod drops the key, so `body.columns["__proto__"]` reads
Object.prototype (engine.ts:129). With `constructor` or `toString` left out of the body, the dry run is refused the same way
(body.columns reads the inherited function). Sent as explicit null, it works. Should: read `body.columns` by own keys only
(`Object.hasOwn`), so a left-out column is unmapped whatever its name.

**F6 — Minor. Concurrent requests get misleading refusal words.** Two `run` calls at once: the loser gets 409
DRY_RUN_CHANGED "The preview has changed since you looked at it" (engine.ts:198). The preview did not change: the batch is
already running. Three dry runs at once on one DRAFT: one gets main.ts's generic P2002 409 "Already exists, or someone else
saved…". This comes from createMany hitting the (batch, phase, row) key, because the batch is not locked at engine.ts:138.
Data held in both cases. Should: "This import is already running" or "Another preview of this import was saved at the same moment".

**F7 — Minor. Gaps in the CSV reader.**
(a) In a file with CR-only line endings (old Mac "CSV"), the "first line" used to pick the separator is the whole file
(csv.ts:24). So `Name;Email\rDoe, Jane, Jr;a@x.test\r…` is read with `,`: the header becomes one column "Name;Email" and
every row's cells are wrong.
(b) CELL_TOO_LONG's "line N" counts records, not lines (csv.ts:29). After a quoted three-line cell and two blank lines it said
line 3 when the cell is on line 7.
(c) HEADER_REPEATED repeats the header text (csv.ts:58). If a file has no header row, that text is a cell value: it said
`Two columns are named "jane@x.test"`. That breaks the spirit of AG-18-12, though the words reach only the uploader.
(d) A line of only spaces becomes an ERROR `cell_count` row. `"x"yz` is read as `xyz`, not refused. Both are lenient and harmless.

## What held
- **Permissions:** Case Officer → 403 MISSING_PERMISSION on targets, attestation, list, origin and upload. No token → 401.
  Admin (has import:run) → 403 OWNER_ONLY when attesting. Admin may run a batch an Owner attested (by design). An attestation
  body with an extra field → 422.
- **Firm walls:** firm B gets 404 NO_SUCH_IMPORT for firm A's batch view, rows, dry run and run. Origin of firm A's record → `imported:false`.
  Firm B's upload from the same source name does not get firm A's saved mapping. Firm B's attestation status is null.
  Upper-case ids resolve in firm A only.
- **Dry run → run gate:** another batch's hash → 409 DRY_RUN_CHANGED. Upper-case hash or an extra body field → 422. Mapping changed after the
  preview → old hash refused. Target version bumped after the preview → 409 "rules … changed". Re-dry-run or run of a
  finished batch → 409 ALREADY_RUN. Two batches of the same file and mapping share a hash, but each run checks its own
  batch's stored hash, so nothing is gained by replaying it.
- **Once-only:** two runs at once (15 rows) → 15 RUN rows, 15 records. A joined run (25 rows) → 25 and 25. Rows with no
  natural key, joined run → 15 and 15. Two batches of the same 20 keys run at once → 20 records (advisory lock held). The second
  batch SKIPped all 20. Re-import of 5,000 rows → 0 created, 5,000 SKIP, 5,000 distinct records.
- **Dry run racing a run** (12 tries): always a clean 409 (ALREADY_RUN or DRY_RUN_CHANGED), never a 500.
- **Body reader:** declared Content-Length over 5 MB → 413 at once. Chunked 7 MB with no length → 413 in words, not a reset.
  Only text/csv is accepted (application/csv and JSON → 415; `TEXT/CSV` is accepted). Latin-1 bytes under `charset=latin1` → 422 NOT_UTF8. UTF-16 → NOT_UTF8.
  Empty body → 422 NO_HEADER. None of these made a batch.
- **Reader limits:** 5,000 rows plus 3,000 blank lines pass. 5,001 rows → refused, naming 5,000. 61 columns → refused. 2,001-character cell → refused,
  while 2,000 emoji pass (code points). Headers that differ only by spacing → HEADER_REPEATED. A mapping naming a column not in the file → 422 unknown_column.
- **No values leak:** no plat_import_row reason and no `platform.import.*` audit line (summary or detail) held an email, a name or a city,
  across about 13 runs and 30 uploads.
- **Scale (for the record; JobPort is part 2):** 5,000 rows: upload 22 ms, dry run 2.2 s (5.9 s on re-import), run 17.7 s, in one request.

**Verdict: Block** (F1 and F2 are Major. Fixing both, each with a check in tests/check_pf10b_import_engine.ts, would clear it.)
