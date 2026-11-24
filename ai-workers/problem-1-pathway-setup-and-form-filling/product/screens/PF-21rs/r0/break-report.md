# Break report: PF-21rs R0 (#3492), head 0d756d5ed64ebac1b5206a2a6bdb3e1c563cd190

Scope: runtime only (no screen). I attacked `GET /api/system/register/breaches[/:id]`, `GET /api/system/register/holds`, `GET /api/system/register/requests[/:id]`, `Messages.storedWords` and `names.ts` / `names.bypass.ts` through the API and the database.
How: a scratch harness built on `tests/check_pf21rs_r0.ts` (outside the repo: `/tmp/claude-0/breaker/b1.ts`). It makes a scratch database from the migrations on 127.0.0.1:54329 and runs the real `Messages` (LocalFiles, and S3Files over the recorded `tests/fixtures/pff1-s3/fake-s3.ts`). It also mounts `audit-access` (SystemAccessLines) so the platform's own lines are counted, and uses a walled pool with max 10, pg's default. The PR's own check passed 15/15. My scratch databases and folders were dropped. The four `xr_studio_pf21rs_r0_{668,1068,1523,1920}` databases and `studio/var/pf21rs-r0-*` folders are older than this session (created 11:42–11:43), not mine, and were left alone.

## Blocker
None found.

## Major
**M1. With the S3 file store, a changed or unreadable stored message turns the whole breach read into 500, not "words null + note".**
- Steps: `Messages` on `S3Files`, firm D notified (201), `GET /breaches/:id` gives 200 with the words. Then:
  - change the object's bytes in the bucket: `GET` → **500** `{"statusCode":500,"message":"Internal server error"}`. Log: `S3FilesError: files: S3 get failed (IntegrityMismatch)` at `messages.ts:170` ← `breaches/service.ts:219`.
  - make one GET answer `AccessDenied`: → **500** (`S3 get failed (AccessDenied 403)`).
  - `NoSuchKey`: 200 with the note, correct. `InternalError`: 200, because the SDK retries.
- Why it matters: S3 is the file store built for production (PF-F1; production must set `PLATFORM_FILES`). `S3Files.get` throws on an integrity mismatch (`s3-files.ts:157`), where `LocalFiles.get` returns the bytes and lets the hash check run. So the PR's "tampered → no words + note" case (R0-1) holds only on LocalFiles, the only store the check uses. On S3, one notice with a changed or unreadable file hides the whole breach, every other notice and its events from the Owner and the Auditor: the record most needed after tampering is the one that cannot be opened.
- Smallest fix: in `storedWords`, `let file; try { file = await this.d.files.get(…) } catch { return null; }`, so a file that cannot be read gives the same `null` as a missing one. Add one check line using the recorded fake S3, as above.

## Minor
**m1. A stored file whose hash matches but whose body is not a JSON object, or a directory in the file's place, gives 500.** Both need a database or filesystem change.
- Steps (LocalFiles): write `%PDF-1.7 not json` to the file and set `msg_outbox.rendered_hash` to its sha256 → **500** `SyntaxError … is not valid JSON` (`messages.ts:172`). The body `null` → **500** `TypeError: Cannot read properties of null (reading 'outboxId')` (`messages.ts:173`). Replace the file with a directory → **500** `EISDIR` (`files.ts:68` via `messages.ts:170`).
- Held for comparison: valid JSON naming another outbox or another firm, or `subject: 7`, gives 200 with words null and the note. A corrupt `.meta` or a deleted file gives the note too.
- Smallest fix: `let r: unknown; try { r = JSON.parse(…) } catch { return null; } if (!r || typeof r !== "object") return null;`. The try around `files.get` from M1 also covers EISDIR.

**m2. One breach read starts one interactive transaction per notice, all at once (`Promise.all`, `breaches/service.ts:218`). Under parallel reads these run out of Prisma's 2 s wait for a connection and the read answers 500.**
- Steps: a breach naming 200 firms (the schema's maximum), all notified.
  - One read at a time: 200 OK in 147–286 ms, 309 KB.
  - 10 parallel reads: all 200, slowest 1,769 ms.
  - 20 parallel reads: **8 of 20 answer 500**, `P2028 Transaction API error: Unable to start a transaction in the given time` from `Breaches.one` → `storedWords`.
- Judgment: the fan-out (200 concurrent transactions per page view) also takes the shared pool from firms' own requests while it runs.
- Smallest fix: read the words one notice at a time (`for … of`) or a few at a time. One read was 150–290 ms at full fan-out, so time at small concurrency should stay small; I did not measure the sequential version.

**m3. Judgment, not a break: `names.bypass.ts` allows `GET …/(breaches|requests|holds)/<anything>`, but holds has no `GET /:id`.** Today nothing extra runs (no handler; `firmNames` is called only from the five reads). Any later route there would inherit the bypass. Fix: list the five routes exactly.

## What held
- Roles:
  - A firm's token gets 403 on all four reads and on `POST …/notices`, with no names and no words in the body. No token gets 401.
  - Our staff with Support, Admin or no role get 403 on all four.
  - The Auditor gets 200 with names and words on breaches, and 403 on holds and requests (their keys are Owner-only).
- Ids:
  - `x`, `' OR 1=1--`, a 5,000-character id, a uuid without dashes, a trailing `0`, a leading or trailing space, `%00`, `%2Fnotices`: all 404 `NOT_FOUND`, no 500.
  - Upper-case id and trailing `/`: 200 with the right words.
  - Unknown breach: 404 and no names line.
- Port:
  - Firm A's outbox id asked as firm B gives `null`. An upper-case outbox id works. A random id gives `null`.
  - A malformed firm id throws `firmScope` (not reachable from the route: notice firm ids come from the database).
  - Recipients are checked when a notice is recorded (outbox row with this breach's idempotency key) and `plat_breach_notice` is immutable, so a notice cannot be pointed at another message without owner-level database changes.
- First recipient SUPPRESSED (firm C: Owner hard-bounced, Admin queued): the notice shows the words with no note. A suppressed row still has its stored file.
- Only subject and text leave the stored file: the notice keys are `id, firmId, channel, recipients, templateVersionId, sentBy, sentAt, firmName, sentByName, subject, text, wordsNote`, with no address, html or from. The list carries no words.
- Audit lines: 6 reads (breach list, one, one with upper-case id, the Auditor's one, the holds list, the requests list) wrote **0** lines on firm A's and firm B's trails.
  - 6 firm-less `cross_tenant.access` lines (one per read).
  - 4 `platform.bypass` firm-names lines, under the reader's `ourstaff:<id>`, `firm_id` null, method GET. The empty holds and requests lists name no firm, so they write none.
- The bypass is refused (BypassRefused) on `POST /breaches`, `PATCH /breaches/:id`, `GET /breaches/x/notices` and `GET /api/platform/me`. `HEAD` counts as GET, by design.
- Names: `platform_firm` id and `operating_name` only. Staff names come from `plat_system_staff` (`staff:` / `ourstaff:` actors), never a firm's staff.
- Reads while sending: 30 firms (Owner and Admin each) notified in parallel with 40 reads of the same breach. All sends 201, all reads 200, 0 notices with a note: a notice is visible only after commit, and its files are written before.
- Lists:
  - 500 breaches × 50 firms: 200 in 145–156 ms (3.1 MB), `truncated: true`.
  - `limit=501`, `0` or `abc`: 422 `BREACH_FIELDS`.
- A 60 MB stored file with a matching hash: 200 in 1.8 s, no 500 (LocalFiles has no size cap on read).

Verdict: Changes 0d756d5ed64ebac1b5206a2a6bdb3e1c563cd190
