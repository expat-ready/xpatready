# FO-3sr break report: staff booking routes (PR #1811, head e96a6f5)

Breaker, 15 Nov 2026. Scope: the seven routes in the brief (`staff.controller.ts`, one feature line) through PF-4's guard;
DW3, DW4, DW5, DW8 plus the brief's extra attacks. No tracked file edited; nothing committed.

**How.** Two set-ups. (1) The PR test's harness copied into a scratch script (scratch DB `xr_studio_breaker_fo3sr_<pid>`,
every migration, LocalIdentity tokens, six roles plus a second BILLING_FINANCE host, a staff member with no role, a
deactivated host, firm B with an OWNER and a BILLING_FINANCE, FakeClock). (2) The real `api/src/main.ts` on port 4477
(scratch DB `xr_studio_breaker_fo3sr_real`, `PLATFORM_IDENTITY=local`) to see the production filter and `ConfigReadGuard`.
Both DBs dropped with `--force`, the app stopped, the temporary `tests/tmp_breaker_*` files deleted. Port 4400 not touched.

**Result: 0 Blocker, 0 Major, 5 Minor.** No access rule broke: no cross-firm read or write, no host saw or changed
another host's booking without the key, and an id was never confirmed.

## Findings

| # | Sev | What I did | Expected | Actual | Where |
|---|---|---|---|---|---|
| m1 | Minor | `POST /:id/attendance` as the BILLING_FINANCE host, body `{"outcome":"COMPLETED","staffId":"<OWNER>","firmId":"<firm B>","prospectId":"x"}` | 400 for unknown keys, as create and reschedule do (`Unrecognized key: "staffId"`) | **200**, status COMPLETED; the extra keys are dropped without a word. Same on the real app (`{"outcome":"NO_SHOW","firmId":"x","staffId":"y"}` gives 200). A form-encoded `outcome=COMPLETED` is also taken (200). Nothing is misused, but this body is the only one of the three that is not strict | `staff.controller.ts:39` (`(body ?? {}).outcome`) |
| m2 | Minor | OWNER cancels a booking; before its start the host sends `POST /:id/attendance {"outcome":"COMPLETED"}` | 409 not-active ("A cancelled booking has no attendance.") | 409 `too-early`, "Not yet. Attendance is recorded once the meeting has started.", which suggests it can be recorded later. After the start it answers not-active. The PR test asserts this order | `service.ts:311-312` (too-early is checked before not-active) |
| m3 | Minor | READ_ONLY (list key, no edit) records attendance on another host's started booking | 403 with a `code` like the guard's 403s (`MISSING_PERMISSION`; DW1 names `NOT_ALLOWED`) | 403 `{"type":".../problems/forbidden","title":"Not allowed","detail":"This needs the permission agent/booking:edit."}` with **no `code`**. A client cannot tell it apart the way it can with the guard's 403s | `service.ts:722` (`need` → `forbidden(key)`) |
| m4 | Minor | `GET /?from=…&staff=nope`, `GET /` with `from` missing, `POST /:id/attendance {"outcome":["COMPLETED"]}` | A refusal named for what was asked | 400 titled **"Not booked"** ("Please check the highlighted details.") on a list query and on an attendance answer, where nothing was being booked | `service.ts:124-127` (`parse` → `refused`) |
| m5 | Minor | Real app, valid OWNER token: `POST /API/Front-Office/Bookings/<id>/attendance`, `GET /api/Front-Office/bookings?from…`; no token: `GET /API/FRONT-OFFICE/BOOKINGS?from…` | Either served as the lower-case route (PF-4's guard treats paths case-blind, break M1) or one clear refusal | Mixed case: 403 `link-only`, "A person's own link reaches only their own questions…", for a staff token. Upper-case `/API/`: **200 with the SPA's index.html**. It fails closed (no data, no write; the harness without `ConfigReadGuard` serves and guards these paths correctly), but the answer is wrong and misleading. Pre-existing for every `/api/front-office/*` route; outside this row's touch list | `core.ts:92` (case-sensitive regex), `main.ts:244` (case-sensitive `(?!api\/)`) |

## What held (tried, answered as expected)

* **DW3 list.** BILLING_FINANCE host: only their own booking, 200, never 403. `staff=<OWNER>`, `staff=<firm B staff>`,
  `staffId=`, `firmId=<firm B>`, `staff[]=` all ignored, so the list stays their own. OWNER `staff=<firm B staff>` gives `[]`.
  `firmId=B` is ignored and B's booking is never in A's list. An upper-case staff uuid filters correctly. A staff member
  with no role sees their own list only. READ_ONLY sees the firm's (it holds `agent/booking:list`, per PF-3's seed).
  Malformed query: `from` or `to` missing, from>to, from=to, 92 days + 1 s, no offset, year 1900, repeated `from` or
  `staff`, `from[gt]`, broken `%` escapes all give 400, never 500. Exactly 92 days gives 200.
* **DW4 get.** Another host's booking without the key, another BILLING_FINANCE host's booking, an unknown uuid, a non-uuid,
  uuid+suffix, `{uuid}`, no dashes, `%00`, a 5,000-character id, firm B's tokens: all give 404 `{"title":"Not found",
  "detail":"No such booking."}` with identical bodies. HEAD gives the same 404. Timing: other-host 6.7 ms against unknown
  6.1 ms (40 calls each), so there is no usable signal. The host's own id in upper case gives 200.
* **DW5 attendance.** BILLING_FINANCE host, own booking: too early gives 409 too-early; after the start 200; changing it
  to NO_SHOW gives 200 with a new event; repeating the same answer gives 200 with no new event. Non-host BILLING_FINANCE
  (no list key) gives 404 on OWNER's and on another BILLING_FINANCE host's booking. READ_ONLY non-host gives 403, nothing
  recorded. A staff member with no role records their own (200, AG-4-39). Outcome as array, object, number, null, true,
  lower case, leading space, CANCELLED, SCHEDULED, missing, a body that is an array, or only in the query: all give 400
  and nothing changes. Cancelled booking after its start gives 409 not-active. A completed booking can no longer be
  rescheduled or cancelled (409). Two opposite answers at once both give 200, serialised (COMPLETED seq 1, then NO_SHOW
  seq 2, final status matches the last event).
* **DW8 cross-firm, every route.** A's OWNER, BILLING_FINANCE and READ_ONLY on firm B's booking: get and attendance give
  404, reschedule and cancel give 404 for OWNER and 403 for the roles without edit (the same 403 for any id, so nothing is
  confirmed). B's row is byte-for-byte unchanged. Firm B's OWNER on A's booking gives 404 on all four. Create with
  another firm's type gives 404 "No such consultation type." and with another firm's person 404 "No such person.".
  Firm B's attendance-due does not show A's bookings. A bad reschedule body gives the same 400 for B's id and an unknown id.
* **Bodies.** create and reschedule refuse `prospectId`, `staffId`, `firmId` (strict). An array body, text/plain, no
  body, bad JSON (problem+json 400 on the real app), a 5,000-character or non-Latin time zone all give 400. 6 MB gives
  413 before the guard. `__proto__` in the body is harmless (201, nothing else set). No booking-link token in any answer.
* **Routing.** `attendance-due` (also `ATTENDANCE-DUE` and with a trailing slash) is never read as `:id`. `%61ttendance-due`
  gives 404 as an id. `POST /attendance-due/attendance` gives 404. PUT, DELETE, OPTIONS and `//` give 404. In the harness
  `/API/Front-Office/Bookings` is guarded (401 without a token, 403 MISSING_PERMISSION for BILLING_FINANCE create). With an
  upper-case path, BILLING_FINANCE reschedule gives 403.
* **Tokens and headers.** `bearer`, `BEARER`, two spaces, a tab and a leading space are taken. Trailing junk, no scheme,
  `Basic`, `Bearer` alone, two tokens comma-joined, a quoted token, a tampered signature, a token in the query string,
  `x-actor` or `x-simulated-person` only: all give 401. Two Authorization headers: the first wins (BILLING_FINANCE's own
  list). No second step gives 401 TWO_STEP_REQUIRED; an unknown staff id gives 401 UNKNOWN_STAFF. Deactivated (list, get,
  attendance-due, own attendance) and suspended (create) both give 401 STAFF_NOT_ACTIVE at once. A role grant ended
  mid-session gives 403 on create and 404 on another host's booking on the next call.
* **Concurrency.** Four creates on one slot: one 201, three 409. Two cancels: one 200, one 409, one `booking.cancelled`.
  Two reschedules into one slot: one 200, one 409. Reschedule against cancel: the loser 409, final CANCELLED.
* **Volume.** 1,409 bookings over 92 days: OWNER list 47 ms (464 KB), host list 21 ms, empty host list 5 ms. Note, not a
  finding (STANDARDS §9: scale work is the team's): `attendance-due` has no window, so every unanswered past booking
  stays in it. 1,417 rows and 466 KB in 31 ms here.
