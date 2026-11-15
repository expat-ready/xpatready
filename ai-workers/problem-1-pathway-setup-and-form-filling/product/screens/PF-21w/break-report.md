# PF-21w break report: complaints routes behind PF-4's guard

PR #1823, commit d02865694, branch claude/tender-cannon-wl91rj. Breaker (Opus 5.5), 15 Nov. US$0, no model calls.
**Scope:** this row has no `screens/PF-21w/concept.md`, so the brief's route table (`product/design/lead-b-briefs/PF-21w.md`, branch lead-b-front-office) is the "what gets built". The screen is PF-21s, so screens, keyboard, 1024 px, 200 % zoom and uploads are not in this row and were not tried.
**How:** I ran the real `api/src/main.ts` as an isolated copy on :4486, with its own database `xr_studio_pf21wbrk` (every migration, `PLATFORM_SAMPLE_SEED=on`, `PLATFORM_IDENTITY=local`, its own signing key), so the real ProblemErrors filter, body parser, ConfigReadGuard and SPA fallback were all in the path. Firm A had one staff member per role, plus a second CASE_OFFICER. Firm B had an Owner and a CASE_OFFICER. Tokens came from LocalIdentity. The scripts are in the session scratchpad (`attack.mts`, `remind.mts`, `steps.mts`). The copy is stopped and its database is dropped. I never touched :4400. The PR's own `tests/check_pf21w_routes.ts` also passes here: **83 passed, 0 failed**.

## Blockers
None. DW2, DW3 and DW8 held on every route I tried (see "What held").

## Majors
**M1. A double submit records a complaint twice, and the copy can never be removed (STANDARDS §4 [M] "Idempotent creates").**
* What I did: sent three identical `POST /api/platform/complaints` at the same moment as OWNER.
* Expected: one complaint. The second and third should get the first one back, or a 409.
* Actual: `201,201,201`, three distinct ids. Each one is a permanent entry in the firm's complaints register, and each queued its own acknowledgement reminder. `DELETE` is refused for everyone (405). The only way out is to close the copy with an outcome such as WITHDRAWN, which records something untrue.
* `POST /:id/steps` does the same: two identical posts give `200,200` and two identical STEP events.
* A browser reload or retry of the POST has the same effect.
* Where: `api/src/platform/complaints/routes.ts:27-28` (no idempotency key read) and `complaints.ts:197-218` (`record` has no dedup).
* The fix needs `complaints.ts` and probably a column, both outside the touch list. That makes it a question for the tech lead, not a change this PR can make silently.

## Minors
**m1. Two sessions changing the handler: last write wins (STANDARDS §4 [M] optimistic concurrency).** OWNER and ADMIN each posted `/:id/handler` at the same moment, naming different people. Both got `200`, and each response showed that person's own choice; only the second stuck. Nothing gave a stale-save 409. The history keeps both HANDLER_CHANGED events, so nothing is lost, but the first admin is told the wrong handler. `routes.ts:48-49`; `complaints.ts:108` and `:317-328` (no version check).

**m2. DELETE's 405 has no `Allow` header.** RFC 9110 §15.5.6 requires one with a 405. `allow=null` on every DELETE. `complaints.ts:348-350`, reached from `routes.ts:51-52`. On the flagged reading of the brief, the uniform 405 **leaks nothing**:
* the body is identical for the caller's own id, an id that does not exist, firm B's id, `not-an-id`, a 3,000-character id, all six roles and firm B's Owner;
* no token gives a 401 before the id is looked at;
* `DELETE /api/platform/complaints` (no id) gives Nest's generic 404, which depends only on the path.

**m3. Upper-case paths are refused by the wrong guard (outside the touch list, PF-4's).**
* `POST /API/Platform/Complaints/<id>/Steps` with any valid staff token, even the Owner's or the handler's, gives `403 link-only` ("A person's own link reaches only…"). The cause is ConfigReadGuard's case-sensitive check at `core.ts:92`; the platform's own check, `keys.ts:19`, ignores letter case (`/i`).
* `GET /API/Platform/Complaints[/<id>]` is answered with the SPA's `index.html` (200 for anyone), from the case-sensitive fallback at `main.ts:243`.
* Neither one leaks anything: the answer is the same for every id and every role, and no complaint data comes back. It is still a 403 where DW2 says "never 403", and a broken door for that spelling.

**m4. Two body-parser errors become a 500 (app-wide, already there before this PR).**
* `Content-Type: application/json; charset=x-bogus` gives 500 (UnsupportedMediaTypeError 415).
* `Content-Encoding: gzip` on a body that is not gzip gives 500 (Z_DATA_ERROR 400).
* Same result on `/api/programs` and `/api/platform/web-address`.
* Where: `main.ts:208` maps only 413; everything else falls to `:220`.
* Also: a `text/plain` body is silently treated as empty (422 "this is needed" on every field) where a 415 would be the honest answer.

**m5. The reminder is recorded as sent when nothing was sent (interim, same as FO-3).**
* A complaint received 20 days ago became overdue, and the worker ran its reminder within seconds. It wrote `REMINDER_SENT {sentTo:"handler"}` and the audit line "Acknowledgement reminder sent to the handler".
* But the mail port is `fakeMail` (`features/platform-complaints.ts:20`), so no message left the machine.
* `complaints.ts:366` sends the reminder only once, so complaints recorded before PF-4b's sending adapter arrives will never get a real reminder.
* Say this in the PR, or have PF-4b's row re-arm them.

**m6. A lone UTF-16 surrogate is accepted and silently changed.** A `summary` of `"\ud800tail"` gives 201, and it is stored as `U+FFFD tail`: the record differs from what was sent and nobody is told. `complaints.ts:62-65` (`text()` has no well-formedness check). Outside the touch list; it sits next to R3-m1.

**m7. A refused caller still takes a row lock.** `change()` locks the complaint with `FOR UPDATE` before it checks whether the caller may read it (`complaints.ts:257-258`). So READ_ONLY posting acknowledge on any id they know briefly blocks the handler's writes; the answer itself is still the uniform 404. Contention only, and a tiny timing signal.

**m8. Stale header.** `complaints.ts:16` still says "Not yet here: routes wait for PF-4's @PermissionKeys", which is no longer true after this PR (`complaints.ts` is outside the touch list).

## What held
* **DW2.** CASE_MANAGER, CASE_OFFICER, BILLING_FINANCE and READ_ONLY, each on a complaint they do not handle, got a byte-identical status and body to an id that does not exist and to the upper-case id. I tried this on GET and all four handling steps, with valid, malformed and future-dated bodies.
  * A bad body gives the same 422 for any id, because the service checks it before the lookup, so nothing leaks.
  * On every list view (all, open, overdue, closed) each role saw exactly what it should: Owner and Admin the whole firm, CASE_MANAGER and CASE_OFFICER only their own, BILLING_FINANCE and READ_ONLY none, and nobody saw firm B's.
  * `/:id/handler` gives 403 MISSING_PERMISSION to anyone without both keys, the same for every id. That is the brief's DW4 and leaks nothing.
* **DW3.** The CASE_OFFICER handler, holding neither key, ran acknowledge, step, response-sent and close, each 200.
  * After the Owner moved the complaint to someone else, the old handler got 404 on GET and steps and it left their list. The new handler got 200.
  * CASE_MANAGER on their own complaint, and CASE_OFFICER, both got 403 on `/handler`.
* **DW8.** Firm A's Owner on firm B's id got 404 on GET, the four steps and `/handler`, identical to an id that does not exist. Firm B's CASE_OFFICER on firm A's ids got the same.
  * Naming the other firm's staff member as handler, on record or on a handler change, gives the same 422 as an id that does not exist.
  * An extra `firmId` in the body is refused (422, strict schema).
* **Tokens.**
  * Deactivated: 401 STAFF_NOT_ACTIVE, at once. Revoked: 401 SESSION_REVOKED, on reads and writes.
  * An Admin whose grant ended: the same token now gets 404 and an empty list.
  * Tampered token: 401 TOKEN_REFUSED.
  * A comma-joined second bearer: 401. The simulated-person header alone: 401.
  * `bearer` in lower case with extra spaces works, as intended.
* **Path and id tricks**, all a uniform 404 for everyone except the real handler, with 401 when there is no token:
  * trailing slashes; an id in upper case (accepted for the handler);
  * `%00`, `%20`, `{id}`, the id without hyphens, `;x`, `.json`, `..%2F`, a zero-width prefix, a 5,000-character id;
  * a double slash, which gives Nest's 404.
* **Query.**
  * Repeated `view`, `limit` or `cursor`, negative or huge limits, `1.5`, `+5`, `1e1`, Arabic-Indic or full-width digits, a NUL, non-ASCII text and a 10,000-character view: all 422.
  * `view[]` and `limit[]` are other parameter names and are ignored.
  * A forged cursor can only page within the caller's own scope.
  * `__proto__` and `constructor` parameters are harmless.
* **Bodies.**
  * An array gives 422. `null`, a bare string, number or `true`, and invalid JSON give 400 (parser). 4.9 MB gives 422; 6 MB gives 413.
  * 100,000-deep nesting gives 422, with no crash.
  * Text limits: 4,000 é is accepted and 4,001 refused; 2,000 emoji are accepted and 2,001 refused, because the limit counts UTF-16 code units.
  * Non-English text (Arabic, Hindi, Japanese, Chinese) is stored correctly.
  * A right-to-left override, zero-width-only text and a NUL are refused at their field.
  * A `__proto__` key is ignored.
  * urlencoded bodies are parsed and accepted. That needs a bearer token, so it opens no cross-site request forgery.
* **Methods.**
  * HEAD gets the same answer as GET: 404 for both the other person's complaint and an id that does not exist.
  * OPTIONS, PUT and PATCH give a uniform 404, with no CORS opening.
  * TRACE is refused by the client.
* **Concurrency.**
  * Five parallel acknowledges: one 200, four 409, and one ACKNOWLEDGED event.
  * Close, close, step, handler change and response-sent in parallel: one close (200), four 409, the record consistent.
* **Volume** (STANDARDS §9, under 200 ms per request):
  * 425 complaints paged in pages of 100 with no row repeated or missed: at most 21 ms a page.
  * The overdue view over 401 rows: at most 15 ms a page. `GET /:id`: 8 ms.
* **500s.** No route produced a 500 apart from m4's two body-parser cases, which happen before any route runs.
* **Logs.** Request lines carry only the route pattern and the firm, never a complainant's data (PF-23).

Leftover databases `xr_studio_pf21w_3324`, `_10903`, `_11215` and `xr_studio_pf21wrev` are not mine. I left them alone; they may belong to the reviewer or to earlier runs (`tools/prune-test-dbs.sh`).
