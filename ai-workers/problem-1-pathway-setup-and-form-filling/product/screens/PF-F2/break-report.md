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
