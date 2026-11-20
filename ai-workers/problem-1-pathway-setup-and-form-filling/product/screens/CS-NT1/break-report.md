# CS-NT1 part 1: break report (API and database; no screen yet)

Commit `e8cc6fbfbd2407c4ae0678d9dcbbbd4e1c5b2585`, branch `claude/hopeful-planck-csbott`. Run on 19 Nov on an isolated copy (`tools/isolated.sh br_csnt1 4683`, `PLATFORM_IDENTITY=local`, database `xr_studio_br_csnt1`, now stopped and removed). Setup: configured checkpoint; case A (firm sample-firm, client user-P), case A2 (sample-firm, client user-Q), case B (sample-solo, client user-P). Staff tokens: user-O (CASE_OFFICER, author), user-R (OWNER), user-S (firm B), plus breaker staff inserted as READ_ONLY, BILLING_FINANCE, ADMIN, CASE_MANAGER and a second CASE_OFFICER. Scope: the brief's Part 1 only. @mentions, rich text, delete, timeline and panel are later parts and are not findings.

**Counts: 0 Blocker, 0 Major, 4 Minor.** DW3, DW4 and DW5 held on every route I tried.

## Findings

**m1 (Minor): the note lock can be bypassed with a different letter case in the note key. The losing writer gets a generic 409 with no NOTE_CHANGED code and no `current` note, and the audit line stores the key as the caller typed it.**
`service.ts:188` builds the advisory lock from the raw path text (`case_note:${noteKey}`). The UUID check at `:21` ignores letter case, and PostgreSQL treats both spellings as the same uuid. So two requests for one note with keys `7f0e…` and `7F0E…` take different locks, both read version 1 and both insert version 2.
- Repro: add a note (key k). At the same moment send `PUT /api/runtime/cases/{A}/notes/{k}/text` four times with `{"text":"v-…","version":1}`, using the keys k, K (upper case), and two mixed spellings.
- Actual: one 200. Three 409s with body `{"title":"Already exists","detail":"This already exists, or someone else saved the same thing at the same moment…"}`: the unique-index P2002 mapped by `main.ts:213`, with no `code` and no `current`. `run()` at `:124` maps only P2034, serialisation failures and deadlocks.
- The audit line of the winner has `"noteKey":"7F0E4C88-E41D-…"`, while the line for the add has the lower-case key. A search on noteKey misses one of them.
- No data damage: the `(note_key, version)` unique index held, and the versions stay 1,2,3,4 with no gaps. Same race with pin across 3 rounds × 6 spellings: one 200 per round, the rest bare 409s.
- Expected: lower-case the key, or use the stored key, before locking and auditing. Every loser then gets STANDARDS §4's 409 NOTE_CHANGED with the current note.

**m2 (Minor): an add that races a case delete answers 500 instead of 404.**
- Repro (psql): `begin; delete from runtime_case where id='{A2}'; select pg_sleep(4); commit;`. One second in, send `POST /api/runtime/cases/{A2}/notes {"text":"…"}` as user-O.
- Actual: the request waits about 3 s, then returns 500 "Something went wrong on the server". The log shows `PrismaClientKnownRequestError code P2003` at `service.ts:170`. The insert trigger's `FOR KEY SHARE` finds the row gone and raises `foreign_key_violation`.
- No note is left behind, and no note text is in the log.
- Expected: 404 "No such case", as `caseOf` would have answered a moment later. This can happen in real use when an add races a demo reset.

**m3 (Minor): text that looks blank or hides content passes the "no control or invisible characters" rule.**
The `INVISIBLE` regex (`contracts/runtime.ts:22`, used at `service.ts:33`) refuses U+200B, U+200E/F and U+202A–E. It accepts:
- notes made only of U+3164 (Hangul filler), U+2800 (braille blank) or U+00AD (soft hyphen). Each returned 201, and each note looks empty.
- U+061C (Arabic letter mark, a bidi control like the refused U+200F) and U+2060 (word joiner).
- Unicode tag characters U+E0000–E007F. `"hi"` followed by the tag-letter spelling of "ignore all" was saved and shows as `hi`, which is hidden "ASCII smuggling" text. In a CLIENT_VISIBLE note it would reach the client's read unseen.

The DB CHECK (`migration.sql`, `case_note_text_check`) refuses only C0 controls and DEL. A direct insert of `'  a​‮\u0085b  '` (untrimmed, zero-width, RTL override, C1 control) is accepted. The schema comment ("no control or invisible characters … (CHECKs)") says more than the CHECK enforces.
- Expected: refuse the listed characters, and refuse text that has no visible character after trim, in both the API and the CHECK.

**m4 (Minor): the list has no paging limit.**
`GET …/notes` returns every current note in one response. With 200,000 notes inserted on case B, firm B's list answered 200 with 74.5 MB in 2.8 s. STANDARDS §6 [M] asks for cursor pagination. The brief does not ask for paging in part 1, so this is Minor. A cap or cursor is cheap now, and part 3's timeline already pages at 50. The client read of the same case stayed small (998 bytes, 0.6 s), because the SQL filter returns only CLIENT_VISIBLE notes.

## What held
- **DW3 (firm isolation):** firm B's token on firm A's case returned 404 `NOT_FOUND` on list, add (INTERNAL and CLIENT_VISIBLE), text, pin, visibility and versions. Mixing ids also gave 404 every time: firm B's case with firm A's note key, firm A's case with firm B's note key, and case A2 with a note key from case A. Firm A's note row was unchanged afterwards (v1, INTERNAL, unpinned). Adding `x-actor: user-O` to firm B's token changed nothing.
- **DW4 (who may edit):** a second CASE_OFFICER and a CASE_MANAGER who are not the author got 403 `NOT_NOTE_AUTHOR`. ADMIN, OWNER and the author got 200 (v3, v4, v5). A non-author on a stale version gets 409 before 403, which leaks nothing the list does not already show. READ_ONLY and BILLING_FINANCE can list, but add and pin return 403 `MISSING_PERMISSION`. Pin and visibility by a non-author holding `case:edit` are allowed, as the brief says.
- **DW5 (client read):** user-P's `GET /api/runtime/cases/{A}` (also the persona alias `client`, and `case.notes` in `/questionnaire` sqr and pqr) carried only the CLIENT_VISIBLE current note, with no staff names or actor ids. Once that note's current version was INTERNAL, the client read returned `[]`, even though v1 was CLIENT_VISIBLE. user-Q got 404. Staff x-actor reads (O, R, T) had no `notes` field, user-S got 404 and user-A got 403. user-P on firm B's case saw only that case's notes. A bearer token on the client read returned 403 link-only.
- **Guard:** x-actor without a bearer token returned 401, and a made-up bearer token returned 401.
- **Validation (all 400, never 500):** empty, blank, NBSP/ideographic-space-only, NUL, lone high and low surrogates, RTL override, ZWSP, U+0085, VT, 5,001 ASCII, 5,001 emoji, 2 MB text, text as number, array, object or null, extra fields (`author`, `caseId`), wrong visibility or letter case, string `pinned`, array body, invalid JSON. 60 MB returned 413.
- **Accepted as they should be:** exactly 5,000 ASCII, exactly 5,000 emoji (code points), 5,000 with padding (trimmed), ZWJ emoji, Hindi, CRLF. HTML is stored as plain text.
- **Ids:** malformed, all-zero, injection-shaped and too-long case ids returned 404. `version` of 0, −1, 1.5, `"1"`, null or 1e308 returned 400. `2^31` returned 409.
- **Concurrency:** 10 edits at the same version with the same key spelling gave one 200 and nine 409 `NOTE_CHANGED`. Pin, visibility and text at v1 together: one winner, no lost write.
- **Idempotency:** 8 adds at once with one key saved 1 row (one 201, seven replayed). The same key with different text returned 409 `IDEMPOTENCY_KEY_REUSED`. Trimmed-equal text is a replay. The key on another case, or on firm B's own case, makes a new note. Replay by READ_ONLY returned 403. A malformed key returned 400.
- **Database:**
  - UPDATE, DELETE and TRUNCATE were refused. `TRUNCATE runtime_case CASCADE` was refused too, by `case_decision`.
  - Direct inserts were refused for: wrong firm, wrong workspace, missing case, version gap, author change, carrying a note onto firm B's case, reusing a v1 key, v0, bad visibility, control character, 5,001 characters, blank author, and an idempotency key on v2.
  - A supplied `created_at` was overwritten with `now()`.
- **No note text leaked:** none in `audit_event` (summary and detail hold version ids only), `module_event`, the API log (including the 500), or any error body. The 409 shows the current note only to the same firm's staff.
- **Speed:** with 200k notes elsewhere, the list query uses the `(case_id, …)` index (0.5 ms).
- **Not counted as findings:** the database role `xr_studio` is a superuser and owns the table, so `ALTER TABLE … DISABLE TRIGGER` goes past insert-only; that is outside this row. A direct insert can plant a CLIENT_VISIBLE note with a non-staff author, which only database access allows.
