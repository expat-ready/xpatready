# PF-F2 part 1: break report (tus upload rail, API only; schema and security breaker)

Head `ec7565e04b41ea79f0803bcd6fd85df3ef329b96` on `claude/quirky-mayer-g0iinz`. Scope: the row's part 1 (the rail, the doors registry, `plat_file`, its migration). Part 2 (client library, screen words, browser cut) is not in this report.
Method: the harness from `studio/tests/check_pff2_uploads.ts` (scratch DB on Postgres 18 :54329, Nest app on :4561, as `xr_app`, LocalFiles, real PgLegalHolds), with attack steps appended in a scratch file under `studio/var/`. The scratch file, databases and folders are deleted. No repo file changed except this one.

## Findings

### F1. Blocker: another firm reads and writes an upload by putting the victim id in the query string (claims a, c)
- **Repro:** firm A's owner creates an upload `V` (6000 bytes) and sends 1000 bytes. Firm B's staff create their own upload `D`, then send
  `HEAD /api/platform/files/uploads/D?x=/V` (also works as `D?/V`) and
  `PATCH /api/platform/files/uploads/D?x=/V` with `Upload-Offset: 1000` and 5000 bytes of their own.
- **Observed:** HEAD answers 200 with V's offset, length and full `Upload-Metadata`: the client's file name, `personId`, `xr_firm`, `xr_actor` (firm A staff id) and `xr_target`. PATCH answers 204 with an `Upload-File-Id`. Firm A's FilesPort now holds the mixed file under `uploads/<A's person>/V`, a `plat_file` row in firm A says SCANNING, and firm A's door `onComplete` ran. Another person in firm A can do the same (`A1c`: 200).
- **Expected:** 404. Only V's uploader may touch V.
- **Cause:** `rail.ts:73` checks the id taken from the path **before** `?`. `@tus/server` 2.4.7 takes the id from the **whole URL including the query**: `BaseHandler.getFileIdFromRequest` runs `/([^/]+)\/?$/` on `req.url`, and srvx makes that the full href. So the rail checks one id (D, the caller's own) and tus acts on another (V). A planted PDF ("IGNORE ALL PREVIOUS INSTRUCTIONS…") went in this way as firm A's file.
- **Fix:** pass tus the id the rail checked, e.g. `getFileIdFromRequest: () => this.#id.getStore()` (keep the checked id in the AsyncLocalStorage next to the context), or refuse with 404 any request with a query string or with `req.url` other than `UPLOADS_PATH[/<id>]`. Add DW4 cases for `?x=/<id>` and `?/<id>` on HEAD and PATCH.

### F2. Major: an upload finished inside its creation POST is stored, but the client is told 404
- **Repro:** `POST /api/platform/files/uploads` with `Upload-Length: 3000`, `Content-Type: application/offset+octet-stream`, STAFF metadata and the whole 3000-byte PDF as the body. This is tus's `creation-with-upload`, which OPTIONS advertises in `Tus-Extension`.
- **Observed:** 404 "The file for this url was not found". No Location and no `Upload-File-Id`. Yet one `plat_file` row (SCANNING) exists, the FilesPort file exists, and the door's `onComplete` ran once.
- **Cause:** `PostHandler` calls `onUploadFinish` (`rail.ts:67`, which removes the staging copy at `rail.ts:131`), then calls `store.getUpload(id)` to set `Upload-Expires`. That call throws FILE_NOT_FOUND, and the success becomes a 404. A client that retries gets a second stored file and a second `onComplete`.
- **Fix:** refuse a creation body, or drop `creation-with-upload` from the store's extensions. Or keep the staging record until the response is written (remove it on `POST_FINISH`). Add a test.

### F3. Minor: raw internal error text in responses (finish failures)
- **Repro:** (a) The final PATCH and 3 empty `PATCH`es at `Upload-Offset: <size>` sent while finish runs. (b) A door whose `onComplete` throws `Error("door says no: SECRET-DETAIL")`. (c) A door whose `keyOf` repeats a key (`uploads/<person>/passport`) or leaves the firm's folder (`../../x`).
- **Observed:** 500 with tus's `UNKNOWN_ERROR` body plus `error.message`: (a) Prisma's "Invalid `tx.platFile.create()` invocation in /home/user/…/prototype/…" with the server path; (b) "door says no: SECRET-DETAIL"; (c) "file key uploads/<personId>/passport already holds other content", and a zod issue dump. Data held in all three: the unique `(firm_id,key)` stopped a second row, `onComplete` ran once, and FileKey refused the escape.
- **Fix:** an `onResponseError` that maps any non-`Refusal` error to `500 "Something went wrong. Nothing was stored."` and logs it through `logPort`. Map `FileKeyTaken` to 409.

### F4. Minor: a finish that fails after `FilesPort.put` leaves an unrecorded, unscanned file
- **Repro:** as F3 (b).
- **Observed:** the FilesPort file exists and `plat_file` has 0 rows. Staging is kept: HEAD 200, and an empty PATCH later finishes it (204). If nobody retries, the bytes stay in the firm's store with no row. PF-F3's queue never scans them, they count toward storage, and the 24 h sweep removes only the staging copy.
- **Fix:** run `put` after the transaction commits. Or on a thrown transaction, delete the just-put key (FilesPort delete) and remove staging. Or write the row first and put inside the transaction, deleting on rollback.

### F5. Minor: staged uploads have no quota
- **Repro:** one staff session sent 50 creations of `Upload-Length: 26214400`. **Observed:** 50 × 201, and each may be filled to 25 MB in the staging folder. Plan storage (EntitledFiles) only applies at finish. **Fix:** cap open uploads per person or firm (for example 10), or count staged bytes against the plan at creation (Sample value).

## What held
- **(a) other ids:** unknown, upper-case, `%2F`, `%00`, `;x`, `//<id>`, `/./<id>`, `/x/../<id>`, `/<id>/extra`, `/<id>//` and `#x` all answer 404. `/<id>/` reaches the right upload. Firm B and another person get 404 on HEAD and PATCH through the path. No session gives 401.
- **Method override:** `X-HTTP-Method-Override: GET|DELETE` is ignored. tus 2.x has no override, and the upload stays.
- **(b) metadata:** `XR_firm`, `Xr_Door` and a bare `xr_firm` give 400. Duplicate `door` and `__proto__` give 400. 12 KB of metadata gives 431. A non-English file name gives 201. The server's `xr_*` overwrite the client's.
- **Concatenation:** `Upload-Concat` partial and final give 501, nothing staged.
- **(c) never served:** GET (also `?x=/<id>`) and DELETE (also lower-case `delete`) give 404. Through the path, nothing is in FilesPort or `plat_file` before the last byte.
- **(d) PF-F4:** an EMPTY declared size gives 400. A bad creation body gives 415, nothing staged. Bad bytes at finish give 415, nothing stored (suite DW3 and DW7 re-run green).
- **(e) chunks:** a repeated chunk gives 409. Bytes past `Upload-Length` give 413, the offset stays 0 and nothing is stored. HEAD during finish shows offset = size.
- **(f) expiry:** 410 on the rail's clock, and the sweep keeps a held person's upload (suite DW5 and DW6).
- **(g) `plat_file`:**
  - Walls: as `xr_app`, firm B reads 0 rows and no firm reads 0. Inserting another firm's row is refused by RLS. B cannot update A's row.
  - Privileges: DELETE, TRUNCATE, key and firm_id updates are refused by permission for `xr_app` and `xr_data`. Only INSERT, SELECT and the three scan columns are granted.
  - Insert rules: a CLEAN insert is refused, and `created_at` is forced to `now()`.
  - Note, not a finding: the trigger allows any scan-state move (QUARANTINED → CLEAN, CLEAN → SCANNING). Moves between states are PF-F3's concern.
- **(h) CORS:** no `Access-Control-Allow-Origin` or `-Credentials` on OPTIONS, POST, HEAD, PATCH, GET or 404 answers, even with a foreign `Origin`.

Verdict: Block

## Round 2: head `dc3301c778341d9504c14ecffa2ddd9fca38cef6`

Scope: only `git diff ec7565e..dc3301c` (`rail.ts`, `platform-files.ts`). Same harness (Nest on :4562, as `xr_app`, real LocalFiles). The test door's `keyOf` was changed for one person only, for R8. Scratch file and databases deleted.

### Retried
- **F1: fixed.** Firm B's HEAD and PATCH through `D?x=/V`, `D?/V`, `D/?x=/V/`, `D%3Fx=/V`, `D%3F/V`, `U?/V` and `D#/V` all give 404. So does `POST U?x=/V`. V stays at offset 1000 with nothing stored, and B's own D is untouched (offset 0).
- **F2: fixed.** A POST with the whole body gives 201 with Location and `Upload-File-Id`. HEAD then answers 200 at offset 3000, and an empty PATCH retry gives 204 with the same id. There is 1 row and `onComplete` ran once.
- **F3: fixed.** A failing `onComplete` gives 500 "The upload could not be finished. Try again in a moment; what you sent so far is kept." No path or internal message appears.
- **Racing finish: held.**
  - The last chunk with 20 empty PATCHes at the end, fired 0, 5 and 30 ms after it: all 21 answers are 204, with one `Upload-File-Id`, 1 row, `onComplete` once and no 500.
  - Two rail instances sharing one staging folder and database (two processes), with 3 finishes of one upload at once: the same file id ×3, 1 row and `onComplete` once. This went through the P2002 re-read.
- **A finished upload's kept staging copy: held.**
  - Read: GET is 404 for the owner. HEAD with `X-HTTP-Method-Override: GET` is a plain HEAD (no bytes).
  - Others: DELETE is 404. Firm B and another person in the same firm get 404 on HEAD and PATCH.
  - Overwrite: more bytes at the end give 413, PATCH at 0 gives 409, `Upload-Length` on PATCH gives 400, and the offset stays 5000.
  - Re-finish: an empty PATCH gives the same id with 1 row. After a FilesPort delete (retired key) it returns the same id and does not store the bytes again. After the row goes QUARANTINED it returns the same id, the state is unchanged, and no second file is made.

### New findings
- **R8. Minor (got quieter since round 1): a door key that repeats now silently answers success for a different file.**
  - Repro: a door whose `keyOf` leaves out the upload id (`uploads/<person>/passport`). Upload a 3000-byte PDF, then a different 3300-byte PDF for the same person.
  - Observed: the second upload gives 204 with the **first** file's `Upload-File-Id`. Its bytes are not stored and its `onComplete` does not run. In round 1 this was a loud 500 (`FileKeyTaken`).
  - Why: `#stored` (`rail.ts`, `#finishOnce`) matches on (firm, key) only, so any upload hitting an existing key is treated as a retry.
  - Expected: 409 "This file is already stored", or the door contract enforced.
  - Minor because part 1 registers no door and `keyOf`'s contract says to use the upload id. Fix before CS-D1 registers doors: treat a found row as a retry only when its sha256 matches (else 409), or have `keyFor` refuse a key that does not contain `uploadId`.
- **R7. Minor: every empty PATCH on a finished upload re-reads and re-checks the whole staged file.** 30 re-finishes of a 5 MB upload took 705 ms (about 23 ms each, so about 115 ms each at 25 MB), plus one database read each, repeatable for 24 h. Fix: keep the finished file id in the staging record's metadata (or a small cache) and answer from it before reading the bytes.
- Note, not a finding: a finished upload's staged bytes stay on disk for 24 h, even after the stored file is QUARANTINED or deleted. They are never served.

Round-1 F4 (an unrecorded file after a failed `onComplete` until retried) and F5 (no limit on unfinished uploads) were not in this diff and stay open as Minor. No Blocker or Major is open.

Verdict: Approve

## Round 5 (a2acd4caa), 25 Nov 2026: the migration against today's main (63f5cc91)
Scratch databases on 127.0.0.1:54329 only (four `xr_studio_pff2r5_*`, all dropped after). Main's 170 migrations in order (from `git archive origin/main`), then `20261125120000_pff2_plat_file`.
- **Held, applies after main's newest:** psql in order exits 0. So does `prisma migrate deploy` from empty on the head folder, and `migrate diff --exit-code` is empty (0). The RDS-shaped run (`tools/rds-shape-check.sh 15461`, non-superuser runner, own throwaway cluster) gives 21/21. `check_pff2_uploads` gives 40/40, with DW9 naming 20261124170000 as the newest before it.
- **Held, what main's new migrations change (FO-9b, PF-21d ×2, FO-6, AUD-3):** a catalog snapshot was taken before and after plat_file: roles and their flags, `pg_default_acl`, the owner, definer flag, md5 and search_path of `platform_session_firm` and `platform_firm_first`, event triggers (0), and CREATE on public. The two snapshots match. Read by hand, the five only add their own definers (each handed to `xr_wall_reader` inside a GRANT/REVOKE CREATE pair, as plat_file does) and AUD-3 adds seed rows (its FORCE lift is only on `plat_system_role_permission`). The full catalog fingerprint after plat_file adds 40 lines, all plat_file's own, and removes none.
- **Held, the walls with main underneath (as `xr_app`):** a firm reads only its own rows; with no firm, an insert is refused by RLS. A new row must start SCANNING, `created_at` is forced, and a duplicate (firm, key) is refused. DELETE, TRUNCATE, and changes to key or firm_id are refused by permission for xr_app, xr_data and xr_staff_bypass. Firm B updates 0 of A's rows. `xr_app` cannot SET ROLE to the reader, and cannot ALTER, replace or skip the trigger. `plat_file_write` belongs to `xr_wall_reader` (SECURITY DEFINER, fixed search_path) and cannot be called directly.
- **Held, rollback in the header's order:** the four steps run with no error. The schema then matches main alone (0 fingerprint lines differ, `_prisma_migrations` has no pff2 row), and a re-deploy is again identical with an empty diff. The wrong order fails safely: DROP TYPE or DROP FUNCTION first is refused because of what depends on it.
- **Held, a database that applied the old 20261124060000 row:** moving it to head, deploy runs 070000 to 170000, then gives P3018 on 120000 ("type PlatFileScanState already exists"), and the next deploy stops with P3009. The body's recipe works: run the rollback, delete the two rows (060000 and the failed 120000), then deploy. The result is identical to a fresh database, with an empty diff and status up to date. A stale 060000 row left behind does not trouble `migrate status` or deploy (both exit 0).
- **N1. Minor (record): the PR body was not updated for the re-stamp.** Its first line and Plan step 2 still say stamp **20261124060000**. The Lanes line names only "the old `20261124040000`" and "any failed 060000", so the case most lanes now have (060000 applied, then 120000 failed) is only covered by reading it generously. Fix: name 120000 in the body, and in Lanes write "060000 (or 040000) applied, then a failed 120000: rollback, delete both rows, deploy".
- Notes, not findings: "Pure rename, the SQL unchanged" is true of the statements; three header comment lines changed. The recipe drops any rows already in plat_file (none on a lane: no door is registered). On the local cluster `xr_wall_reader` is a member of `xr_studio`, so it has CREATE on public before and after; on the RDS shape it ends with none (PASS). This was there before this PR.
- Left alone: six stale scratch databases (`xr_studio_pff2_{,empty_}{14411,14762,16419}`) that are not from this pass. One read-only `SELECT` on `xr_studio_demo._prisma_migrations` found no pff2 row; nothing on :4400 was touched.

Verdict: Approve a2acd4caa55d547f859059aa9a785af00e9aae9e
