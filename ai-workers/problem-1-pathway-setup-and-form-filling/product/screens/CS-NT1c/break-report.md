# CS-NT1 part 3: break report (PR #3649)

Head attacked: 31ffaa4e7ad3464cbb69483c26cfed4b3a335a2d. The head then moved to 8afd05d8c2faf65bd80d368e2e752861f579028f. I checked that move with `git diff 31ffaa4e7 8afd05d8c`: it renames the migration folder to `20261125100000_shared__csnt1c_case_client_note` and changes 3 one-line references to it. No SQL or code changed, so every result below holds for 8afd05d8c.
Breaker reasons: schema (migration 20261125100000_csnt1c_case_client_note) and personal data (notes).
How I ran it: an isolated copy `brk_nt1c` on :4437 (`isolated.sh … start --ttl 30 PLATFORM_IDENTITY=local`). It was stopped after the run, and its database and files were dropped.
Sign-ins: `POST /api/platform/session/local` as the Sample firms' staff. Firm A (sample-firm): Owner user-R, Case Manager user-T, Case Officer user-O. Firm B (sample-solo): Owner user-S.
Fixtures: cases written in SQL, as `check_csnt1_timeline.ts` does, in the shared `demo` workspace. Audit lines were inserted directly with `session_replication_role = replica`.
Scope: Sample data only, US$0, no model calls. This PR has no screen (the panel is part 4), so the keyboard, 1024 px and zoom checks do not apply.
Scope (P-26): only the listed surface was checked, meaning the client notes routes, the case timeline, and the migration's rules.

## Findings

| # | Sev | Where | What I did → expected → actual |
|---|-----|-------|--------------------------------|
| F1 | Minor | `api/src/case-notes/timeline.ts:38` | I sent `GET /cases/:id/timeline?cursor=<base64url of ["9999999999999999999","audit",<uuid>]>`. Expected: 400 INVALID. Actual: **500** "Something went wrong on the server". The check `^\d{1,19}$` accepts a 19-digit number above the bigint maximum (9223372036854775807), and the `::bigint` cast in SQL then throws. The largest bigint itself answers 200. |
| F2 | Minor | `api/src/case-notes/timeline.ts:94` (the filter), `:118-128` (floor and `more`) | I put 300 pre-AUD-1m lines (`case_id` null, `firm_id` null) in the workspace. Each contains case D's 8-character prefix in its words, but names a different case first (`Moved case 0000aaaa to X (ref <d8>)`). Above them sat 10 real lines of case D. Expected: page 1 shows D's 10 lines. Actual: the pages come back with sizes **0,0,0,0,0,6,4**, and each empty page says `more:true`. Nothing is skipped or repeated. But a reader that stops at an empty first page shows "no activity", and the 10 lines are split across two pages. The SQL prefilter (`strpos`, line 89) picks up 51 lines that case-feed.ts's rule then drops. The floor then moves the cursor on without filling the page. |
| F3 | Minor | `api/src/case-notes/timeline.ts:94-95` | Setup: firm B's case Bc has the same first 8 characters as firm A's case A. I added an audit line with `entity='case'`, `entity_key=<Bc's full id>`, `case_id` null, `firm_id` null and the words `FIRMB-LEAK moved case <a8>…`. I added a second line, `case document`, saying `FIRMB-LEAK2 uploaded on case <a8>`. Expected: neither line on A's timeline, since the first one's key names another case. Actual: **both show on firm A's timeline**, with actor `user-S`. A line with `firm_id` set to FB was correctly left out. This is case-feed.ts's own prefix rule, inherited. It is unlikely: it needs an 8-character prefix collision plus a line written without a firm id. AUD-1m also leaves `case_id` null whenever 2 cases share a prefix (core.ts:158). One cheap guard is still missing: an `entity='case'` line whose `entity_key` is a full id other than this case's could be dropped. |
| F4 | Minor | `api/src/case-notes/service.ts:148` | I deleted a standalone case client inside an open psql transaction and held it open for 3 s. During that time I sent `POST /clients/:id/notes` as user-O. Expected: 404 "No such client in your firm." Actual: 404 **"No such case in your firm."** `run()` calls `notFound()` with its default word, and the check on that line matches only `case_note: no case`. It is the right status with the wrong word. No note was left orphaned: the insert waited 2.2 s on the row lock, then was refused. |
| F5 | Minor | `api/src/case-notes/service.ts:124` (the `current()` used by `list`) | Database level. A standalone client (no case refers to it) of firm A has a note. I ran `update case_client set firm_key='sample-solo'`. No trigger refuses this; the foreign key refuses it only while a case refers to the client. Expected: firm A's note stays unreadable to firm B. Actual: firm B's `GET /clients/:id/notes` → **200 with firm A's note text**, and firm B's POST → 201, which mixes firm ids on one client. `history` (it filters `firmId`) and `change` (it checks `n.firmId`) still answer 404, but `list` and the timeline note source filter only by subject. No app path changes `firm_key` (grep: none), so this is defence in depth only. Part 1 has the same gap for `runtime_case`. |

## What held (each tried, result as expected)
- **Another firm.** Firm B was refused on firm A's client and its note on GET list, POST, GET versions, and PUT text, pin and visibility. Firm B was also refused on firm A's case timeline. Every answer was a 404 with "No such client/case in your firm."; no note text appeared. Calls with no session, or with only `x-actor`, got 401. An unknown id got 404. For firm B, a bad cursor or kind answers 400 before the 404. That 400 is the same for any id, so it does not reveal whether the case exists.
- **Wrong subject.** I used a client note key on the case routes (versions, text, pin, visibility) and a case note key on the client routes. I used a case id on `/clients/:id/notes` and a client id on `/cases/:id/notes` and `/timeline`. All answered 404. An upper-case client id or note key resolves to the same row (200).
- **Database rules.** All of these were refused, each with its own message:
  - a client note carrying firm B's id;
  - another workspace;
  - an unknown client;
  - both subjects, or neither;
  - version 2 moved to another client, or to a case;
  - a version 2 with another author;
  - version 3 skipping version 2;
  - version 1 reused on a case;
  - UPDATE (including a subject swap), DELETE and TRUNCATE.

  When the delete of a client races an insert, one waits for the other, and neither direction leaves an orphan note.
- **Paging.** 70 notes written in one transaction (same `created_at`) plus 70 audit lines at that exact microsecond paged as 50, 50, 40: 140 lines, none skipped, none repeated. Filtered by kind, the pages were 50, 20 for NOTE and 50, 20 for ACTIVITY.
- **Cursors.** SQL text in the id, an unknown source and a JSON object were each refused with 400 INVALID. Extra array items or `=` padding are accepted, which is harmless. `?kinds=` given twice and `?cursor[a]=` were refused with 400. Dates from 0000-01-01 to 9999-12-31 were accepted; `2026-1-1` was refused with 400. An author filter naming an unknown staff id, or firm B's Owner, returned 0 lines.
- **Personal data.** No audit line (words or detail) contains any note text from the run. A client line is `case client`, keyed by the client, with `case_id` null and `firm_id` = firm A. The api.log of the run (344 lines) holds no note text.
- **Text.** These were refused with their messages: empty text, only white space, Hangul fillers only, an RTL mark, NUL, a non-string, and 5,001 characters. These were accepted: 5,000 emoji (10,000 UTF-16 units) and 5,000 CJK characters.
- **Concurrency.** 4 parallel edits on version 1 gave one 200 and three 409 NOTE_CHANGED, leaving 2 versions. 4 parallel adds with one idempotency key gave one note and three replays. The same key on the case is independent.
- **Roles.** The Case Officer and the Case Manager may add a CLIENT_VISIBLE note: both roles hold `agent/note:share-with-client`.
- **Budget.** I added 200,000 unrelated workspace audit lines, a third of them with no `case_id`. The timeline then took 109-126 ms and `kinds=NOTE` 70-81 ms, within the 200 ms of STANDARDS §9. The audit query is a sequential scan (there is no index on `case_id`) and runs twice per page (`auditFloor`). This is fine at this size; the scale work is the team's.

Verdict: Approve 8afd05d8c2faf65bd80d368e2e752861f579028f (attacked at 31ffaa4e7ad3464cbb69483c26cfed4b3a335a2d; five Minor findings above, no Blocker or Major)
