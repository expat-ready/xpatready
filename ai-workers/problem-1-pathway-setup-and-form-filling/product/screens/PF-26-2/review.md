# PF-26 part 2 review: one person's data as an export, logged (R1.34)

Head 4931ba67bee2182960d177a033808dedad801091, `git diff 6eb8fe565…4931ba67b` (14 files, +698 −9). Independent reviewer, fresh context,
25 Nov IST. I judged it against AG-2-93 (AG-02 L4364-4412), C4.5 (L5459), SA-11-36 and SA-11-40 (SA-11 L508-512), BACKLOG PF-26 (L303), the shape
and the Lead's shape approval (#3637, 05:14Z: "shape approved as written … Audit lines never hold the content"; this settles part 1's m8,
the reason). Paths are under `prototype/studio/` unless named. The part has no screen. So the app, 1024 px, 200 % zoom, keyboard use and the
BIC scorecard do not apply, and I started no app copy and used no port (never :4400). The breaker's report is `PF-26-2/break-report.md`.

## Verdict: Ship after fixes (three Majors, no Blocker). Not Approve.

## What I ran
* `tests/check_pf26_person_export.ts`: 21 passed, 0 failed, 8.5 s.
* `tests/check_pf12_walls.ts` from the worktree: 105 passed, 5 failed (the API-spawn checks: the symlink, `ERR_MODULE_NOT_FOUND`).
  The guard check passed: every firm table's trigger functions run as xr_wall_reader, and every firm table has its policy.
* `prisma migrate diff` from the migrated database to the schema folder: nothing names `platform_person_export` or its enum.
* Break script, kept in the scratchpad only (`scratchpad/break/b1.mts`). The tree is unchanged.
* `graph.mjs`: G3 lists `allowed`, `:id`, `:id/download` as untested; the parser's miss (the suite calls them via `P(id)`, test :102, :140).

## What held
* **Keys and 404s.** No key gives 403 before any lookup. Holding the key without seeing the person, an absent person, another firm's
  person and a merged-away record all give 404 with the same body. The 503 gate names every module exactly (the `case-side.extra`
  look-alike stays shut). `allowed` answers 404 before 503, so it never confirms that a person exists.
* **One person record.** The lineage follows only `merged_into_id` from a live record (service.ts:67-75). No family member is swept in.
* **Download.** Requester only, re-checked each time; another person's path 404; expired 410, QUEUED 409, FAILED 409 "Export failed".
* **The build.** One REPEATABLE READ, READ ONLY transaction (a writing exporter ends FAILED); all-or-nothing; the line names the module only.
* **Audit lines.** None holds the reason, a name or any package content (test :165-168, and the breaker's sweep).
* **Migration.** It is new and empty, and its rollback order is written. It has the forced policy, the firm-first gate, and the trigger
  functions handed over to xr_wall_reader (CREATE is granted, then revoked). States only move forward, and DELETE and TRUNCATE are
  refused. The folder name `platform__` passes SPD-2's area rule. No scope is invented beyond the approved shape.

## Issues
**Blocker:** none.

**M1 (Major, Must): a reason with a line break or a tab answers 500, not a field error** (service.ts:47-51 against migration.sql:33).
* `ODD` lets U+0009, U+000A and U+000D through. The table check `[[:cntrl:]]` refuses them: `select E'a\nb' ~ E'[[:cntrl:]]'` returns t.
* Run: POST `{ reason: "Client asked by email\nfor a copy" }` gives 500 "Internal server error". So does `"Client asked\tby phone"`.
  The request is lost, with no message on the field (D11). A "why" box is very likely to get a line break.
* Fix: refuse these characters in zod ("Write it as ordinary text.") or allow them in the check, so the two rules agree. Add both cases to
  test :151. The breaker's m1 and m2 (invisible and direction characters, UTF-16 length against `char_length`) belong to the same fix.

**M2 (Major, Must): an expired file can outlive its expiry forever** (service.ts:201-215). The expiry runs once and never comes back.
* **Held, then released.** Run (B4): hold on, 7 days + 1 min, the job runs (EXPIRED, file kept); hold off; 60 more days. The file still
  exists and no job is waiting. SA-11 BR-7 suspends a deletion; it does not cancel it.
* **A failed delete.** A delete that throws after the commit is never retried (the breaker's M3). The retry finds the row not READY and
  returns. The audit line at :210 already says "its file is deleted".
* **An early run.** A run on a clock a few ms early returns without rescheduling (:206; the breaker's m3).
* Each case leaves a complete, unmasked copy of every module's data with no route, job or state to remove it.
* Fix (code only; the table is unchanged): while held or failed, schedule the expiry job again (for example the next day), and
  write the deleted line only after `files.delete`. Test: hold, release, and the file goes.

**M3 (Major, Must): a retried build orphans the first file** (service.ts:184-191; the breaker's M1, confirmed by reading).
* `files.put` is write-once (ports/files.ts:54). Once the put succeeds, any failure of the final transaction leaves the row QUEUED.
  PF-14 retries the job (retryLimit 3), the second put of the same key is refused, and the row ends `FAILED (files)`. The first file is
  stored, and no row points to it.
* Fix: on a retry, when the key already holds a file, finish READY with that file's own sha256 and size, or delete it before FAILED.

**Minor (Should):**
* **m1: a client file without a case does not count as seeing the person** (service.ts:85-87). Run (B3): a client file for P owned by
  T, no case (FO-8's `prospect-won.ts:95` makes these), P's only lead R's, everyone-sees-all off → T gets 404. AG-2-93 rule 2 ("or their
  client file") and C4.5 rule 1 ("File owner") allow it. Fix: also check `caseClient` (`foPersonId in records`, file owner or scope `all`).
* **m2: the lineage is cut short without a word** (service.ts:72-73). Run (B8): a merge chain 55 records deep gives a lineage of 51, and
  the package still says complete. Fix: fail the build "(person)" past the depth or the 200 limit; never truncate.
* **m3: a queue failure leaves a row "Preparing" forever** (service.ts:116-123). Run (B9): `enqueue` throws after the commit. The
  answer is 500, but the row and its line exist, QUEUED with no job. Fix: enqueue again on `read` or `list` when the row is QUEUED
  with no job, or sweep QUEUED rows older than N minutes to FAILED "(build)".
* **m4: a double click makes two full copies** (B2: two 201s, two rows, two files). No rule forbids it, but D5 asks that a repeat
  launch be refused. Fix: answer the caller's open QUEUED export of the same person, or take an operation id.
* **m5: the lineage and the language are read outside the snapshot** (service.ts:174, :179; the breaker's m5). Read them inside the build
  transaction. Also, `as typeof pkg` (:180) hides that `language` is not in the port's package type. Add it to the type.
* **m6: the back-relations sit inside PF-10a's slot** (platform.prisma:128, :301). They sit between PF-10a's own lines, under its
  comment. Rev 16.6 and P-600 (b) put each back-relation under its own slot line. Fix: add `// back-relation slot: person export (PF-26)`
  in both models. (The breaker's m4, `person_id` not tied to the firm in the database, is by design: the build refuses it.)

## D1-D20 (an API part; screen dimensions not applicable)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | rules 1, 2, 3, 5, 7, 8, 10 (JSON), 11 and SA-11-36 and -40 are coded and tested; rule 2's client file without a case is missed (m1) |
| D2 Data integrity | 3 | the table's checks and forward-only states hold; orphaned and kept copies (M2, M3); two copies on a double click (m4) |
| D3 Reuse | 5 | it uses `visibilityOf` and `sees`, `caseScope`, PgLegalHolds, PF-14's runner and FilesPort, with no copy |
| D5 Stability and recovery | 3 | a retry orphans a file (M3); a delete is never retried (M2); a queue failure leaves a stuck row (m3) |
| D11 Feedback and state | 3 | plain 404, 409, 410 and 503 answers; a line break gives 500 with no field error (M1) |
| D15 Speed | 5 | the whole suite runs in 8.5 s; no request per row (one findMany per kind of record) |
| D16 Testability | 4 | every rule has a pass and a fail; no test covers a line break, a retry, a hold being released, or a client file without a case |
| D18 Provenance | 4 | AG-2-93 rules are cited on each rule; the 7 days are marked Sample; "Unconfirmed: no counsel" is there |
| D4, D6-D10, D12-D14, D19 | N/A | no screen and no content in this part |
| D17, D20 | not done | simulated only; there is no screen to walk |

## Journey score (reviewer; the one score for this check)
Full report: `PF-26-2/journey-test-reviewer-2026-11-25.md`.
* Task 1 · next step ½ (m3) · plain words 1 · feedback ½ (M1, m3) · correct data ½ (M2, M3, m2, m4) · recovery ½ (M1, M3) · speed 1 ·
  trust 1 · accessibility and visual N/A.
* That is 6 of 8 applicable criteria, so **7.5/10: below pass**. M1 raises feedback and recovery. M2 and M3 raise correct data.

## Not checked
pg-boss and S3 (fakes only), a typecheck, erasure while READY (not this part's rule), a screen reader, an intended user's walk.

Fix list for Approve: M1, M2, M3, each with a failing test first.

Verdict: Changes 4931ba67bee2182960d177a033808dedad801091

## Round 2 (diff-only: `git diff 4931ba67b…657f504b2`, head 657f504b2b41955f4e6600f3d19f8339647455b1, 25 Nov IST)
* **Ran:** `check_pf26_person_export.ts` gives 29 passed, 0 failed.
* **Old code, new test:** the same file run in a scratch copy of 4931ba67b gives 15 passed, 14 failed. That copy has
  `${LINEAGE_MAX}` inlined as 200, because the old code does not export it. Every new or changed line fails on the old code: M1 (app
  and table), M3, m3, m4, m1, m2, the hold kept and then released, and the retried delete. Three older lines fail only because the
  m4 dedupe changes the row counts.
* **Break script:** in the scratchpad only (`break/b2.mts`). The tree is unchanged.

| Item | Status | Evidence |
|---|---|---|
| M1 | **Not fixed (regression)** | See R2-M1 below. Line break, tab, zero-width, U+061C, tag, U+2028, BOM, lone surrogate and "...!!!" now give 422 on the field, and the table refuses them too. |
| M2 | Fixed, with a gap | Held: READY, one "kept" line, checked daily, deleted after release (test). A failed delete is retried (test). The early-run path does nothing (R2-m1). |
| M3 | Fixed | Each attempt stores its own key, and an unrecorded attempt deletes its file in `finally`. Test: the ready line fails, the first file is gone, and the retry ends READY. |
| m1 | Fixed | A client file without a case: its owner sees the person, and another staff member does not (canSee :102-106). |
| m2 | Fixed | 201 records give 409 LINEAGE_TOO_LONG; the build fails "(lineage)". Nothing is truncated. |
| m3 | Fixed (queue) | A failed enqueue gives 503, and the row is FAILED "(queue)". A failed *schedule* is still open (R2-m2). |
| m4 | Fixed | Sequential (test), and three concurrent POSTs (B2 rerun) give 201 ×3, one id, one row. |
| m5 | Fixed | The lineage, modules, exporters and language are read in the one read-only snapshot, with no type cast. |
| m6 | Accepted | As stated. |

**R2-M1 (Major, Must): a reason written only in a non-Latin script now answers 500** (migration.sql:35 `"reason" ~ '[[:alnum:]]'`).
* This cluster is `C` (initdb with no locale, `cloud-setup.sh:123`). Under `C`, `[[:alnum:]]` matches only ASCII:
  `select 'طلب العميل' ~ '[[:alnum:]]'` returns f. So do Hindi, Chinese and Greek.
* The app's `\p{L}` (service.ts:58) accepts these reasons, and the table refuses them.
* Run: `"طلب العميل نسخة من بياناته"`, `"ग्राहक ने प्रति मांगी"`, `"客户要求副本"` and `"Ο πελάτης ζήτησε αντίγραφο"` each give
  500 "Internal server error". In round 1 they were accepted (the breaker's "held").
* A check whose meaning changes with the cluster's locale is wrong on any `C` cluster.
* Fix: drop the alnum term (the app keeps the rule), or use a test that does not depend on the locale, such as
  `"reason" ~ '[^[:space:][:punct:]]'`. Add a non-Latin pass case to the test.

**Minor (Should):**
* **R2-m1: an early expiry run does not reschedule** (service.ts:264, :258).
  * `next(r.expiresAt)` uses the key `…:expire:<expiresAt>`, the same key the build scheduled (:246). A used key never queues again:
    `fakeJobs` uses a used set, and pg-boss treats the key as the job id (`pgboss-jobs.ts:7-8`).
  * Run: `schedule(…, sameKey)` gives `queued: false`. So a runner whose clock is ahead of the app's leaves the row READY with its
    file forever.
  * Fix: key the reschedule by the run time, or by `expiresAt` plus 1 s.
* **R2-m2: a schedule that throws after READY leaves no expiry** (service.ts:246).
  * Run (R4): `schedule` throws, the build's retry finds the row not QUEUED and returns, and 10 days later the row is still READY with
    its file.
  * Fix: schedule inside a retry, or let `read`/`list`/a sweep re-arm READY rows that have no expiry job.

Journey score, round 2: task 1, next step 1, plain words 1, feedback ½ (R2-M1), correct data 1, recovery ½ (R2-M1, R2-m2),
speed 1, trust 1. Accessibility and visual are N/A. That is 7 of 8, **8.75/10**. It passes on the number, but one Major is open.

Fix list for Approve: R2-M1, with its pass case. R2-m1 and R2-m2 are Should.

Verdict: Changes 657f504b2b41955f4e6600f3d19f8339647455b1

## Round 3 (diff-only: `git diff 657f504b2…32a9fa697`, head 32a9fa6976d0e2a3dc0d2941b8a7c175d78922c9, 25 Nov IST)
* **Ran:** `check_pf26_person_export.ts` gives 32 passed, 0 failed.
* **Old code, new test:** the same file run in a scratch copy of 657f504b2 gives 29 passed, 3 failed. The 3 are exactly the new lines:
  non-Latin reasons, the stale row, and the early run with the lost schedule. So each one fails without its fix.
* **The table's reason check, outside the app,** on this cluster (C) and on a builtin C.UTF-8 database:
  * Arabic, Hindi, Persian with ZWNJ, Chinese, Arabic-Indic digits and "Zoë asked" all pass.
  * "...!!!" is refused.
  * In C, "¿¡«»…" and "📄📄" pass the table, but the app refuses them with 422. The table is only looser than the app, never stricter,
    so no reason the app accepts can reach a 500.
* **Scratch only:** the throwaway copy and databases were in the scratchpad and are dropped. The tree is unchanged apart from this file.

| Item | Status | Evidence |
|---|---|---|
| R2-M1 | **Fixed** | Table `[^[:space:][:punct:]]` (migration.sql:35); app `\p{L}\p{N}` with ZWNJ and ZWJ allowed (service.ts:52). The test sends five scripts through the API and gets 201 for each. |
| R2-m1 | Fixed | `expireKey(id, at, run)` gives each reschedule its own key. Test: an early run queues (`queued: true`) with a four-part key. |
| R2-m2 | Fixed | A redelivered build of a READY row schedules under the base key, which queues once only. Test: the schedule fails, the retry queues it once. |
| Breaker R2-M1 | Fixed | A row QUEUED for over 30 min is closed FAILED "(stale)" with one line, and a new export becomes READY (test). A late build of the closed row finds it FAILED and stops, or fails `finish` and deletes its own file. |
| Breaker R2-m4 | Fixed | `finally` reads the row again before deleting, so a recorded file is never removed. |

**Nits (not blocking; for part 6 or a tidy):**
* service.ts:266: if that second read fails, `.catch(() => null)` still deletes the file. When the commit landed but its answer was
  lost, this leaves a READY row whose download answers 500 "does not match its record. Request it again." That is safe for the
  person's data, but a dead row.
* service.ts:148: a lost build is closed only when its requester asks again. Until then, `read` and `list` show QUEUED, which the
  screen (part 6) would show as "Preparing…". The view could report a QUEUED row older than STALE_MS as failed.
* Two requests in the same instant can still make two rows; the code says so, and both are logged. Three concurrent POSTs gave one row
  in round 2.

Journey score, round 3: task 1, next step 1, plain words 1, feedback ½ (the stale row reads QUEUED until the requester asks again),
correct data 1, recovery 1, speed 1, trust 1. Accessibility and visual are N/A. That is 7.5 of 8, **9.4/10: pass**.

No Blocker or Major is open. Round 1's M1-M3 and m1-m5 and round 2's R2-M1, R2-m1 and R2-m2 are closed; m6 is accepted as listed.

Verdict: Approve 32a9fa6976d0e2a3dc0d2941b8a7c175d78922c9
