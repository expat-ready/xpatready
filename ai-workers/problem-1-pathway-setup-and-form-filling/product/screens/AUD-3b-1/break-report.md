# AUD-3b part 1: break report (PR #3675, head a9243675e)

**Scope:** the read-only support session as built: the start route, `SupportSessionCalls`, the session tag on lines (hook.ts, context.ts, audit-event.ts) and the `plat_support_session` register and its definers. Later parts are out of scope: change mode, ending the session with the staff member's own session (SA-2-41), the sessions list, the firm's own routes.
**How:** I copied the PR's harness (`tests/check_aud3b_support_session.ts`: the real guards, interceptors and walled pool, on a scratch database on 127.0.0.1:54329, never :4400) into two scratch scripts outside the repo and added about 50 attacks. The PR's own check passes 22/22. `prisma migrate diff` from all migrations to the schema folder gives "an empty migration" (no drift).
**Verdict: Changes.** One Major and seven Minor findings. No Blocker.

## Findings

**M1 (Major): a "Bulk export" works in a read-only session, and it is a GET that writes.**
- Did: the Platform Owner starts a session on firm A, then calls `GET /api/system/firms/A/access-report/export?from&to` with `X-Support-Session: <O>`.
- Expected: 403 SUPPORT_SESSION_REFUSED plus a refusal line. The start answer's own `alwaysBlocked` lists "Bulk export" (SA-2-17), and the design says nothing changes in a session.
- Actual: 200 and a CSV of firm A's access report. A new `audit.exported` line is written, tagged with the session and its reason.
- Cause: `refusalInSession` allows any GET that is `@ReadsFirm` on the session's firm (`api/src/platform/support-session/service.ts:93-98`). It does not look at the route's keys (`system/audit:export`) or its side effects (`api/src/platform/audit/access/report.ts:184-189`, which writes the `audit.exported` line at :154).
- Note: the answer the banner will show (PF-6sb) is therefore untrue. The export is the only GET under /api/system that writes something other than an access line.

**m1: the start line does not carry the session in its column.**
- Did: started a session, then read the `support_session_id` column of its `platform.support_session.started` line.
- Actual: NULL. The id is only in `detail.supportSessionId` (`service.ts:63-65`, a call made without the header). Querying the trail by session (B9) returns only the refusal lines, never the start. SA-2-19's per-session "actions" will miss it.

**m2: the stored reason is not the one the guard checked, and control characters reach the lines.**
- What happens: the guard cleans the reason with `lineText`/`reasonOf` (`api/src/platform/system-identity/guard.ts:39-43`). `StartBody` only trims it (`service.ts:44`), and the raw text is what is kept.
- Did: started a session with the reason `"ticket 42 ‮txt.exe‬"`.
- Actual: `plat_system_audit.reason` holds `ticket 42 txt.exe`. `plat_support_session.reason`, the start line's `detail.reason` and every session line's `detail.supportReason` keep the right-to-left override.
- Same: 150 zero-width spaces after "a" are accepted. Newlines are kept.
- Did: a reason containing NUL (`"ticket\u0000 42"`). Actual: 500 (Prisma 22021, invalid byte sequence 0x00) after the guard had already written an ALLOWED line. No session is opened.
- Expected: the same cleaned text everywhere, and 422 for a NUL.
- Why it matters: the reason is shown on the firm's own trail, so a bidi override can disguise it there.

**m3: two different length limits and two ways of counting.**
- Did: started with reasons of 201 and 501 characters.
- Actual: 201-500 characters gets 422 INVALID "at most 200 characters". 501 and over gets REASON_TOO_LONG "at most 500 characters" (the guard's `REASON_MAX`).
- Counting: the route's zod `max(200)` counts UTF-16 units (read in the code). The database check counts characters: B4b, 200 emoji (400 units) passed straight to the definer, gives STARTED. So non-English reasons with emoji or supplementary-plane characters under 200 characters are refused by the API but would be accepted by the database.

**m4: refusal lines are not throttled.**
- Did: 40 refused calls (`GET /api/system/firms` in firm A's session).
- Actual: 40 `platform.support_session.refused` lines on firm A's trail. One person in their own session can flood the trail the firm Owner will read (SA-2-29).

**m5: starting a session while sending an ended session's header.**
- Did: `POST /firms/A/support-sessions` with the header of an expired session.
- Actual: 401 SUPPORT_SESSION_ENDED, "Start a new one". The same request without the header gives 201. A client that keeps the old header can never start the session the message asks for.

**m6: a HEAD read is refused as if it were a change.**
- Did: `HEAD /api/system/firms/A` in firm A's own session.
- Actual: 403, plus a refusal line on firm A that says "read-only: no change is made in it". Fail-closed, but the line's words are wrong (`service.ts:93`).

**m7 (from reading the code, not run): a change sent with `If-Match` gets no refusal line.**
- Cause: `platform-if-match.ts` loads before `platform-support-session.ts`, so its interceptor runs first and refuses a POST to an unversioned route with an `If-Match` header (`api/src/platform/http/if-match.ts:40-41`) before the session check runs.
- Effect: SA-2-17's "a refusal is logged" line is missing for that call.

**Design note (not scored; for the reviewer to confirm it is intended in part 1):** read-only is enforced only on calls that send the header.
- B5: with a read-only session open on firm A, the same Owner places a legal hold on A without the header. Answer 201; the line's `support_session_id` is NULL.
- B6: the same Owner reads firm B without the header (200).
- So SA-2-17's "every action is tagged with the session" depends on the client sending the header. Nothing on the server applies the session to a staff member who has one open.

## What held (each run)
- Start:
  - Billing and the Auditor get 403; no token gets 401; a sign-in older than 5 minutes gets STEP_UP_REQUIRED.
  - Unknown or malformed firm gets 404; blank reason or extra field gets 422.
  - 10 starts in parallel by one person gives one 201, nine 409, one row and one line.
- Session ids:
  - Another person's, unknown, malformed, empty or expired id gets 401 and nothing is read.
  - A duplicated header (two lines, same or different ids) gets 401.
  - Header name in capitals and a padded value are honoured; upper-case session and firm ids are lowercased and the line is right.
- Cross-firm:
  - Firm B by id, mixed-case `/API/System/...`, a trailing slash, or an id with a space all get 403.
  - The firms list, the holds list filtered to the session's own firm, and starting another session from inside one all get 403. All refusal lines land on the session's firm only; none ever on firm B.
  - The other firm's id is never written on firm A's line.
- Wrong plane:
  - A firm-plane token with the header gets 403 on /api/system.
  - On a firm route the header is ignored, and no line carries a session.
  - OPTIONS gets Express's 404 with no handler run.
- Session tag:
  - A JSON-shaped reason stays a string; `detail.firmId` stays the session's firm (`firmId` is spread last, `audit-event.ts:67`).
  - Lines written without the header never carry `supportReason`.
- Database:
  - xr_app reads nothing and updates nothing directly (forced row-level security, no policy).
  - The definers refuse while `app.firm_id` is set.
  - The owner cannot delete, truncate, rewrite the reason or `ends_at`, or end a session twice. An end set in the future is clamped to `ends_at`.
  - An insert with chosen `started_at`/`ends_at`/`ended_at` gets the database's own times and an open session.
  - The definers belong to xr_wall_reader, are SECURITY DEFINER, and EXECUTE goes to xr_data only.
- By design (the pattern of PF-21b, said in the migration header):
  - With no firm set, xr_app (a member of xr_data) can call `plat_support_session_start` for any staff member and any firm, and `_open` with known ids (D2, D5).
  - xr_app can clear `app.firm_id` itself and then call them (D4).
  - The code's guard is the only gate.

Scratch scripts (outside the repo): `/tmp/claude-0/-home-user-xpatready/c210fc55-d3ce-57a3-9b9d-c9e34f64fbbe/scratchpad/aud3b-break/break.ts`, `break2.ts`; results in `out.txt` and `out2.txt` in the same folder.
