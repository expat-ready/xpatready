# PF-26 part 2 break report: one person's data as an export (API and database only)

Breaker, fresh context, 25 Nov IST. Head 4931ba67bee2182960d177a033808dedad801091; diff `6eb8fe565…HEAD`. Paths are under `prototype/studio/`.
This part has no screen, so these do not apply: keyboard, 1024 px, 200 % zoom, reload or back, uploads, 100 programs.
Harness: a copy of `tests/check_pf26_person_export.ts` with 17 attack groups, run on a scratch database (127.0.0.1:54329). Every
migration was applied, the sample firms were seeded, and the real routes, guard, audit and PgLegalHolds were used, with fake jobs,
files and clock. The script was `tests/zz_break_pf26.ts`; it is deleted now and the tree is clean. Before the attacks I ran the
existing suite: 21 passed, 0 failed. Attacks: 12 held, 3 failed, and some only log what they saw (marked "seen").

## Blocker
None. Every rule on who may do what held (see "What held").

## Major
**M1. A retried build leaves an orphaned full copy of the person's data** (service.ts:184-191; at-least-once runner, pgboss-jobs.ts:48 `retryLimit: 3`).
* Steps: (1) T asks for an export of Client B. (2) The build stores `person-export/<id>.json`, then its final transaction throws.
  The test made the audit write fail on `platform.person_export.ready`; a database blip or a crash does the same. The row stays
  QUEUED. (3) Move the clock 1 minute and run `build` again, as the runner's retry would.
* Expected: the retry ends READY. If it ends FAILED, no file is left behind.
* Actual: `FAILED|(files)|file_key null`, and the first file is still stored (`files.exists` true). The package's `generatedAt`
  differs, so the write-once store refuses the new bytes under the same key (FileKeyTaken). No row names the stored file, so no
  expiry job ever deletes it: an unmasked copy of every module's data stays indefinitely, and the requester sees "Export failed".
  The same end comes when two deliveries overlap and the FAILED update commits first. That can happen after `expireInSeconds`
  (15 min) on a large package. In the fake run, READY won the race.

**M2. A file kept under a legal hold is never deleted after the hold ends** (service.ts:203-214).
* Steps: (1) T exports NoLead and the build makes it READY. (2) A hold covers the person; move the clock 7 days and 1 minute; the
  expiry job runs. (3) Release the hold; move the clock 30 more days; run the due jobs.
* Expected: once no hold applies, the kept file goes. SA-11 BR-7 suspends the deletion; it does not cancel it.
* Actual: the row is EXPIRED and the file still exists after 30 days. Nothing reschedules the job, and the row does not record
  that its file was kept (only the audit line's `detail.held` does), so no later sweep can find these files from the table.

**M3. A failed file delete during expiry is never retried** (service.ts:204-214).
* Steps: (1) Make an export READY. (2) Make `files.delete` throw once. (3) Move the clock 7 days and 1 minute; the job runs:
  EXPIRED commits, then the delete throws. (4) Call `expire` again, as the runner's retry would.
* Expected: the retry deletes the file.
* Actual: the retry finds the row not READY and returns, with no error, and the file stays forever (`fileStillStored: true`).
  M2 and M3 have the same cause: EXPIRED is committed before the delete (PF-Fd's order, which is right), but nothing comes back
  for a file that was not removed.

## Minor
* **m1. The reason rule lets through direction, invisible and altered text** (service.ts:47-51; migration.sql:33).
  * Accepted with 201 by both the app and the table: U+061C (Arabic letter mark, a direction mark like the refused U+200E and
    U+200F); a reason made only of U+200B U+200B, or only U+2060, which is an invisible "why"; Unicode tag characters
    (U+E0049…, invisible text); U+2028; a BOM inside the text.
  * A lone surrogate (`"a\uD800b"`) is accepted and stored as U+FFFD (`61efbfbd62`): the stored text is not what was sent.
  * Expected: 422 "Write it as ordinary text", or an exact stored copy. Ordinary Arabic, Hindi and Persian (with U+200C) are
    accepted, and that is right.
* **m2. The length is counted in UTF-16 units, not characters** (service.ts:50).
  * A reason of 200 emoji (200 characters) gets 422 "Keep the reason under 300 characters"; 150 emoji pass.
  * The table counts code points (`char_length`, migration.sql:33), so the two limits disagree.
* **m3. An early expiry run is a silent no-op, with no reschedule** (service.ts:206; found by reading).
  * The job is due at `expiresAt` by the runner's database clock, but the service checks `this.d.now() < r.expiresAt` on the
    app's clock. If the app's clock is a few ms behind, the run returns, the job completes, and the export stays READY with its
    file. The download still answers 410 by the view, but the file is never deleted.
  * The expiry is also scheduled after the READY commit, outside the transaction (service.ts:198). If scheduling throws, no
    expiry is queued and the build's retry exits at once, because the row is no longer QUEUED.
* **m4. Nothing in the database ties `person_id` to the firm** (migration.sql:9-28).
  * Steps: as xr_app with firm A's `app.firm_id`, insert a firm A row naming firm B's person.
  * Expected: the insert is refused. Actual: it is stored. The service would then fail the build "(person)", so nothing leaks.
  * The schema comment names the design ("no foreign key across areas"), but the table check could still refuse it.
* **m5. The lineage and the person's language are read outside the read-only snapshot** (service.ts:174, :179; found by reading).
  * A merge that commits between `lineageOf` and the REPEATABLE READ transaction builds a package for a lineage that is no
    longer true, with the record as it was at the snapshot. This is narrow, and nothing is swept in from a family member.

## What held (tried, and could not break)
* **Key** (rule 1): with the Case Manager grant ended and the same token, 403 MISSING_PERMISSION. With the grant back, 200. A
  deactivated requester with a live token gets 401 STAFF_NOT_ACTIVE. With no key, 403; with no session, 401 (the existing suite).
* **Seeing the person** (rule 2): the lead moves from R to T after R's request. The build still finishes READY, but R's download
  is 404 (the check runs again), and so is T's (T is not the requester). With everyone-sees-all off, the Owner and Case Manager
  cannot see another person's lead: 404.
* **Wrong ids**: person A's path with person B's export id gives 404 on read and download. Firm B staff with firm B's path and
  firm A's export id, or with firm A's path, get 404. A malformed id gives 404. Upper-case ids reach the requester's own export.
* **Merged and family** (rule 3): a person merged between the request and the build ends `FAILED|(person)` with no file, and
  reading it on the merged-away path gives 404. No family member appears in a package (the existing suite and exporterCases).
* **Download states**: while QUEUED, 409 NOT_READY. A hold-kept EXPIRED export still answers 410. A concurrent double build had
  one outcome and one finish line, and its download gave 200.
* **Two requests at once**: both get 201 and make two rows, two jobs and two lines. Each request is logged, and no rule asks
  for one at a time.
* **Bodies**: an array, a number or null as the reason gives 422; a bare JSON string gives 400. None gives 500. A reason with
  U+0085 or another control character is refused by both the app and the table.
* **Audit** (rule 7): no `platform_person_export` line, taken as the whole row as JSON, holds any reason text (including Arabic
  and Hindi), a name, or the merge-race person's name. The failure line names only the module.
* **Table as xr_app** (all refused):
  * an insert for firm B while set to firm A (policy), and a requester from another firm (FK);
  * an update of `requested_by` or `firm_id`, FAILED to READY, QUEUED to EXPIRED, and a READY row's `expires_at`;
  * DELETE;
  * `set session_replication_role = replica`, and `alter table … disable trigger all`.
  With no firm set, a read sees 0 rows; firm B's update of firm A's rows touches none.
* **503 until whole** and the read-only build: the existing suite held, and I did not break them.

## Not tested
A real pg-boss run and S3 (M1 and M3 use the fake runner and store, with the retry called by hand), erasure while an export is
READY (not in this part's rules), and a typecheck.

Verdict: Changes 4931ba67bee2182960d177a033808dedad801091

## Round 2 (diff only: `git diff 4931ba67b…657f504b2`, head 657f504b2b41955f4e6600f3d19f8339647455b1, 25 Nov IST)
I re-ran my round 1 script, changed to the new `<id>/<uuid>.json` file keys, with four new attacks. The script was
`tests/zz_break_pf26r2.ts`; it is deleted now. Results: 15 passed, 2 failed. The new official suite gives 29 passed, 0 failed.

**Status of round 1**
| Item | Status | Evidence |
|---|---|---|
| M1 | **Fixed** | Crash after the file is stored, then a retry: READY, and the first attempt's file is deleted. Two builds at once: one outcome, one line, exactly one stored file. |
| M2 | **Fixed** | Held at expiry: the row stays READY and the file is kept. 30 days after release: EXPIRED, file deleted. The held download still answers 410. |
| M3 | **Fixed** (by the runner's retries) | A delete that fails once is redone by the retry. Once the runner's 3 retries (about 4 minutes) are used up, nothing comes back for the file. |
| m1 | **Fixed** | U+061C, zero-width-only, U+2060, tag characters, U+2028, a BOM and a lone surrogate all get 422. The table refuses U+0085 and U+061C. |
| m2 | **Fixed** | `a` plus 299 emoji is accepted; `a` plus 300 emoji gets 422. |
| m3 | **Not fixed** | The schedule after the commit is kept, as stated. The new reschedule on an early run does nothing (R2-M2 below). |
| m4 | Not fixed, accepted | I agree: the build fails with "(person)" and nothing leaks. |
| m5 | Fixed (by reading) | The lineage, the language and every module are read in one read-only snapshot (service.ts:222-233). |

**New findings**
* **R2-M1 (Major): a build that never finishes blocks its requester from exporting that person, with no end** (service.ts:141-142).
  * Steps: (1) T asks for person Y. (2) Every write of the build's final line fails (audit down during the runner's retries).
    The row stays QUEUED. (3) An hour later, with the audit back, T asks again with a new reason.
  * Expected: a new export, or the dead one ended.
  * Actual: 201 with the old row's id and the old reason ("first try"); there is still one row, and it is still QUEUED. The
    queue refuses the job key again (a key never queues twice), so no build ever runs. Every later request by T for Y returns
    this dead row. The new reason is dropped without an audit line.
* **R2-M2 (Major on a C-locale database): a reason with no ASCII letter or digit gives 500** (migration.sql:35).
  * The table's `~ '[[:alnum:]]'` follows the cluster's ctype. On this lane's cluster (54329, ctype `C`), the app accepts
    "طلب", "复制数据", "प्रति" and "طلب العميل نسخة من بياناته", but the table refuses them, and the API answers 500.
  * The same text passes on C.UTF-8 and en_US.UTF-8 (tried), and "طلب 1" passes everywhere.
  * So "matched by the table's check" holds only on some clusters, and the migration does not pin the locale.
* **R2-M3 (Major): an early expiry run is still lost** (service.ts:258, :264, :246).
  * The reschedule's key is `person-export:<id>:expire:<expiresAt>`. That is the key `build` already used for the job that is
    running early, so `schedule` answers `{ queued: false }` (seen in the run).
  * In production the early job then completes, no job is left, and the READY file stays past its 7 days (old m3, still open).
* **R2-m1 (Minor): the format-character rule refuses ordinary Persian and emoji** (service.ts:52).
  * \p{Cf} includes ZWNJ (U+200C) and ZWJ (U+200D). "می‌خواهم نسخه", written as Persian is normally typed, and an emoji family
    sequence get 422 "Write it as one line of ordinary text".
* **R2-m2 (Minor): the "same export" rule races** (service.ts:141).
  * Two requests at the same moment still make two rows, under READ COMMITTED and with no unique index.
* **R2-m3 (Minor): the app's and the table's format-character lists differ** (migration.sql:36).
  * The table accepts U+0890, U+13430 and U+1D173, which the app refuses. Only the app is stricter, so there is no hole.
* **R2-m4 (Minor, by reading): a lost commit acknowledgement deletes a recorded file** (service.ts:243).
  * If `finish()` commits READY but its answer is lost (connection drop), `won` stays false and `finally` deletes the file.
  * The row is then READY with no file, and the download gives 500 FILE_MISMATCH.

**Still held:** every round 1 access, wall and trigger attack (A1-A7, A12, A14, A16), and the merge race (A4).

Verdict: Changes 657f504b2b41955f4e6600f3d19f8339647455b1

## Round 3 (diff only: `git diff 657f504b2…32a9fa697`, head 32a9fa6976d0e2a3dc0d2941b8a7c175d78922c9, 25 Nov IST)
My round 2 script plus three new attacks (A23 to A25 below): 17 passed, 1 failed. The official suite gives 32 passed, 0 failed.
The script was `tests/zz_break_pf26r3.ts`; it is deleted now.

**Correction to round 2:** my reason attempts on one person were not built in between. So after the first accepted reason,
each later 201 was the "same export" answer, not a new row. The round 2 500s are still real: they came before any row
existed. The R2-m2 claim (300 characters accepted) is now proved, because each attempt is built first and the stored reason
is checked against the one sent.

**Status of round 2**
| Item | Status | Evidence |
|---|---|---|
| R2-M1 | **Fixed** | A dead QUEUED row is answered for 30 minutes. After that the next request closes it FAILED "(stale)" and makes a new row with the new reason. |
| R2-M2 | **Fixed** | On ctype `C`, "طلب", "复制数据", "प्रति" and the Arabic sentence each give 201, and the table accepts them directly. |
| R2-M3 | **Fixed** | The early run's reschedule key ends `…:expire:<expiresAt>:<run time>`, and `schedule` answers `{queued: true}`. |
| R2-m1 | **Fixed** | Persian with ZWNJ, Hindi with ZWJ and an emoji family give 201. A ZWNJ-only reason gives 422. |
| R2-m2 | Open, accepted as Minor | Two requests at the same moment still make 2 rows. |
| R2-m3 | Open (no hole) | The table still accepts U+0890, U+13430 and U+1D173, which the app refuses. |
| R2-m4 | **Partly fixed** | See R3-m2. |
| Reviewer R2-m2 | Held | A redelivered build of a READY row calls `schedule` with the original key; `{queued: false}` because it is already queued. |

**New findings (Minor only)**
* **R3-m1 (Minor): an unassigned character from the tag block gives 500** (service.ts:52; migration.sql:37).
  * A reason of `"ok \u{E0002} ok"` passes the app, because U+E0002 is unassigned (\p{Cn}, not in ODD). The table's range
    `\U000e0001-\U000e007f` refuses it, so the request answers 500. This is so for U+E0002 to U+E001F.
  * Expected: 422. Fix: add \p{Cn} to ODD, or cut the table's range to the Cf code points.
* **R3-m2 (Minor): if the re-read fails too, a READY row loses its file** (service.ts:266, `.catch(() => null)`).
  * Steps: `finish()` commits READY and then throws (its answer lost), and the re-read in `finally` also throws.
  * Actual: the row is READY, the file is deleted, and the download gives 500 FILE_MISMATCH. With the re-read working, the file
    is kept, so the fix works on that path.
  * A database outage is the usual cause of a lost answer and would likely fail the re-read too. Keeping the file when the
    re-read fails would leave at most one orphan, which the next build or expiry could clear; deleting loses a recorded file.
* **R3-m3 (Minor, by reading): only the newest QUEUED row is closed as stale** (service.ts:147-149).
  * If R2-m2's race left two QUEUED rows whose builds died, the older one stays QUEUED in the requester's list for good.
  * The stale test also compares the app's clock with `created_at`, which is the database's clock (only a skew of 30 minutes or
    more would matter).

**Still held:** A1-A7, A9-A10, A12-A14, A16-A17, A21-A22, and the merge race (A4). Three new attacks also held:
* A23: a lost answer with the re-read working keeps the file.
* A24: a redelivered READY build schedules no second expiry.
* A25: a ZWNJ-only reason gives 422.

Note: during this round `product/screens/PF-26-2/review.md` was changed in the worktree by someone else; I did not touch it.

Verdict: Approve 32a9fa6976d0e2a3dc0d2941b8a7c175d78922c9
