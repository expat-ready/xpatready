# AUD-3b part 1: journey test, reviewer, 25 Nov 2026 (PR #3675, head a9243675e)

**API journey, no screen.** Browser walking, axe, screen widths and keyboard were skipped: there is nothing to draw until PF-6sb.

**Setup:**
* The full API ran from a scratch worktree of the head: `isolated.sh rv187 4436`, a runtime-lane port, never :4400; database xr_studio_rv187, Sample firms.
* Our staff were inserted by SQL as Sample people, as the R1.87 probe does, then signed in through `/api/system/session/local`.
* Firm A's Owner (user-R) signed in through `/api/platform/session/local`.
* Script: `scratchpad/tools/journey.sh`, plus `probe_aud3b_review.ts` in the same scratch copy (the PR's harness with about 20 attacks).

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Our Support: "look at firm A for ticket 4821" | Start with the reason "Sample: ticket 4821, invoices missing", then `GET /api/system/firms/A` with `X-Support-Session` | 201 READ, 60 min; read 200; the read's line carries the session and reason | 201 (23 ms), endsAt = start + 60:00; read 200 (41 ms). Line: `platform.system.firm_read`, `ourstaff:<id>`, session id, `supportReason` = the ticket text. The bypass line is tagged too. |
| J2 wrong firm | the same Support reads firm B in A's session | `GET /firms/B` | refused, nothing of B | 403 SUPPORT_SESSION_REFUSED "reads only its own firm"; 0 lines on B; the refusal line is on A, with no B id in it |
| J3 across | the firms list in the session | `GET /firms` | refused | 403 "is one firm's" |
| J4 another session | start again, in the session and outside it | POST with the header; POST without it | 403, then 409 | 403 "starting another session is never allowed"; 409 SUPPORT_SESSION_OPEN with the open id |
| J5 wrong role | Billing starts a session | POST | 403 | 403 missing-permission (system/firm:impersonate) |
| J6 someone else's session | Billing sends Support's session id | GET A | refused | 401 SUPPORT_SESSION_ENDED, nothing read |
| J7 change | the Platform Owner in a session adds one of our staff | POST /api/system/staff | 403, read-only | 403 "read-only", refusal line |
| J8 always blocked | the Platform Owner exports firm A's access report in the session | GET …/access-report/export | 403 (SA-2-17 "bulk export") | **200 CSV and a new `audit.exported` line (Major, M1 in review.md)** |
| J9 boundary to the firm | firm A's Owner opens Activity log, "ExpatReady staff access" | `GET /api/platform/audit?ours=1` | sees our read with the reason | 6 lines, who "ExpatReady support". The reason is only under Raw detail (`supportReason`), not in the summary. The start line shows "ExpatReady staff". Firm B's Owner sees 0 lines of the session. |
| J10 recovery | minute 61; malformed or two headers; HEAD; upper-case ids | (PR harness and probe) | 401; fail closed | Minute 61 → 401. Junk, empty or two headers → 401. HEAD → 403 (worded as a "change", breaker m6). Upper-case session and firm ids work. `/API/System/…` and a trailing slash are still refused for firm B. |

## Data underneath
* One session row per start: 10 parallel starts give one row (the breaker's run); two in the PR test.
* ends_at − started_at = 3600 s.
* `plat_support_session`: forced RLS, 0 policies; xr_app sees 0 rows.
* Definers owned by xr_wall_reader, pinned search_path, refused under `app.firm_id`.
* Every in-session line carries `support_session_id` and `detail.supportReason`.
* Nothing is written on firm B. Roles are enforced on the server: guard 403 before the interceptor.

## Break it (Blocker / Major / Minor)
* Major: J8.
* Minor:
  * the start line has no session in its column;
  * a NUL reason → 404 "removed by a reset" (expected 422);
  * a change with If-Match → 422 before the session check, no refusal line;
  * reasons are not cleaned like the guard's (bidi characters);
  * refusal lines are not throttled.
* Held: the 200-character limit, non-English text (185 characters with `<b>`, accents, CJK and ß, stored as given, never rendered as HTML), another firm by URL, a forged or foreign session, the race.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2 and J9: start, read A with the reason, refused on B, firm A sees it |
| Next step obvious | ½ | The start answer gives the header, end and blocked list. The 409 says "Finish it first", but part 1 has no way to finish. |
| Plain words | ½ | The refusals are plain. The firm reads the reason only as raw `supportReason`. "staff" and "support" are mixed on the start line. |
| Feedback and state | 1 | Distinct codes and Problem Details for each outcome (J1-J7) |
| Correct data | ½ | 60 min exact, one row under race, lines right. But J8 exports and writes in a read-only session, and the start line's session column is null. |
| Error recovery | ½ | A wrong-firm start locks the person out for 60 min (no end until a later part). A NUL reason gives the wrong error. |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 14-41 ms per call |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Every in-session line names the person, session and reason. Refusals are logged. Reasons are Sample. Requirement ids are cited. |

**6 of the 8 criteria that apply = 7.5 / 10. Below the pass mark (8); no criterion at 0.** Fixes that would raise it, most valuable first:
1. Refuse the export in a session (M1). This raises correct data.
2. Put the session id on the start line, and the reason in plain words in the in-session lines' summary or a named field. This raises plain words.
3. Have the 409 say when the open session ends. This raises next step.
4. Answer 422 for a NUL or control-character reason. This raises error recovery.

## Not tested
Any screen (PF-6sb), a real screen reader, an intended user's unaided walk (D17 and D20 stay with the founder), SA-2-41's end and change mode (later parts).

---

# Round 2 (head 517ea9daf; the journeys the diff touches)
**Setup:**
* Scratch worktree of the head, `isolated.sh rv2187 4437 start PLATFORM_SYSTEM_IDENTITY=local` (runtime-lane port, never :4400); stopped afterwards.
* The same script as round 1 (`scratchpad/tools/journey2.sh`), plus the PR's harness with 26 probes.
* Still API only.

| # | Journey | Result |
|---|---|---|
| J1 | Support starts with a ticket reason and reads firm A | 201 (38 ms), read 200 (63 ms). The start line now carries the session in its column. |
| J2-J7 | Wrong firm, list, nested start, Billing, a foreign id, a change | Unchanged: 403, 403, 403, 403, 401, 403 "read-only". |
| J4b | Start again with no header | 409 "open until … (it ends by itself then)". |
| J8 | The Owner exports firm A's access report in a session (GET and HEAD) | **403 "bulk export is never allowed"; 0 `audit.exported` lines** (round-1 Major fixed). The on-screen report → 200; the export outside the session → 200. |
| J10 | Start while sending an ended session's header; HEAD on the firm | 201 (no longer a 401 dead end); HEAD → 200. |
| J11 | Non-English reason: "Sample 工单 " + 110 CJK Extension B characters (120 characters) | **500 "Something went wrong"**, plus a BR-5 `audit_write_failed` alarm. With 90 of them → 201. (Major, R2-M1 in review.md.) |
| J12 | Reason with a right-to-left override | 201. The override is stripped; the register, guard line and start line hold the same text. |
| J13 | 300 Latin characters, then 600 | 422 "1-200 characters", then 422 REASON_TOO_LONG "at most 500 characters" (R2-S1). |

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J8: start, read, and the export refused. |
| Next step obvious | 1 | The 409 says when the session ends. A start with an old header works. |
| Plain words | ½ | "bulk export is never allowed" is plain, but the length words disagree (200 against 500, J13). The firm still reads the reason only as raw `supportReason` (unchanged). |
| Feedback and state | ½ | Distinct codes and Problem Details, but J11 gets a 500 for a valid reason. |
| Correct data | 1 | No export and no export line in a session. The column is set. The reason is the same everywhere. |
| Error recovery | ½ | NUL → 422, and the ended header no longer blocks a start. J11 gives no field message to recover by. |
| Accessibility and screen sizes | N/A | No screen. |
| Speed | 1 | 16-63 ms per call. |
| Visual quality | N/A | No screen. |
| Trust and sources | 1 | Every in-session line has who, session and reason. Refusals are logged. Reasons are Sample. |

**6.5 of the 8 criteria that apply = 8.1 / 10: a pass, no criterion at 0.** The open Major (J11) still blocks the review.
Fixes that would raise it, most valuable first:
1. Count the 200-character limit the way the audit line counts it, so J11 gets a 422. This raises feedback and error recovery.
2. One wording and one limit for every reason length. This raises plain words.

Not tested: any screen, a screen reader, an intended user's walk (D17 and D20), the firm Owner's view (J9; the firm stand-in was not on in this copy, and that part is unchanged in this diff).

---

# Round 3 (head 8a8de4bca; the journeys the diff touches)
**Setup:**
* Scratch worktree of the head, `isolated.sh rv3187 4437 start --ttl 20 PLATFORM_SYSTEM_IDENTITY=local` (runtime-lane port, never :4400); stopped afterwards.
* Script: `scratchpad/tools/journey3.sh`. Each start is by a new Support person (one session at a time).
* The harness probes as in review.md, Round 3.
* Still API only.

| # | Journey | Result |
|---|---|---|
| J1 | Support starts with a ticket reason | 201 (62 ms) |
| J11 | Non-English: "Sample 工单 " + 110 CJK Extension B (120 characters, 228 UTF-16 units) | **422** "1-200 characters", `fields.reason` (was 500 in round 2) |
| J11b | The same with 95 (105 characters, 200 units) | 201; the start line equals the register |
| J11c | The same with 96 (201 units) | 422, the same words |
| J13 | 300 Latin, then 600 | 422 INVALID "1-200", then 422 REASON_TOO_LONG "at most 500" (R2-S1 partly) |
| J14 | Reason names the client by email: "Sample: ticket 4821, client.a@sample-firm.example cannot see invoices" | **500 "Something went wrong on the server"**, plus one BR-5 `audit_write_failed` alarm; nothing opened (R3-M1) |
| Break | Lone surrogate `\uD800` in the reason (crafted request) | 500 plus alarm (R3-S2) |

Data: 2 sessions opened (J1, J11b), each with exactly one start line whose reason equals the register's. No session for any refusal.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J11b |
| Next step obvious | 1 | The 422 names the field and the 1-200 limit |
| Plain words | ½ | "1-200" for 201-500, but "at most 500" above it (J13) |
| Feedback and state | ½ | J11 is fixed, but J14 gets a 500 for a reason a person would type |
| Correct data | 1 | The reason is the same everywhere; nothing opened on any refusal |
| Error recovery | ½ | J14 gives no field message to recover by |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 42-62 ms per call |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Unchanged from round 2 |

**6.5 of the 8 criteria that apply = 8.1 / 10: a pass, no criterion at 0.** The open Major (J14, R3-M1) still blocks.
Fixes that would raise it, most valuable first:
1. Refuse an email-shaped reason with a 422 field message (J14). This raises feedback and error recovery.
2. One limit and one wording above 500 too. This raises plain words.

Not tested: any screen, a screen reader, an intended user's walk (D17 and D20), the firm Owner's view (unchanged in this diff).

---

# Round 4 (head 82081ec02; the journeys the diff touches)
**Setup:**
* Scratch worktree of the head, `isolated.sh rv4875 4437 start --ttl 20 PLATFORM_SYSTEM_IDENTITY=local` (runtime-lane port, never :4400); stopped afterwards.
* Script: `scratchpad/tools/journey4.sh`. Each start is by a new Support person.
* Still API only.

| # | Journey | Result |
|---|---|---|
| J1 | Support starts with a ticket reason | 201 (54 ms) |
| J11, J11b, J11c | Non-English: 228, 200 and 201 UTF-16 units | 422 "1-200", 201, 422 (as in round 3) |
| J13, J13b | 300, then 600 Latin | 422 "1-200", then 422 "at most 500" (R2-S1, unchanged) |
| J14 | "Sample: ticket 4821, client.a@sample-firm.example cannot see invoices" | **422** "…without an email address or other personal detail: it is kept on the firm's audit trail. Nothing was opened." `fields.reason` names it (was a 500 plus an alarm) |
| J14b | "ticket a@b.co" | 422, the same words |
| J14c | Recovery: the same reason with "Client A" instead of the email | 201 |
| J15 | Exactly 200 Latin | 201 |
| Break | A lone surrogate `\uD800` (crafted) | 422 (was a 500); the field words mention email (R4-m1) |
| Break | A valid emoji pair | 201 |

Data: 5 sessions opened (J1, J11b, J14c, J15, the emoji), and every start line's reason equals the register's. No session for any refusal. The API log has no `audit_write_failed` and no 500.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J14c, J15 |
| Next step obvious | 1 | J14's 422 says what to leave out; J14c succeeds right after |
| Plain words | ½ | "at most 500" above 500 (J13b), and the email words for a lone surrogate |
| Feedback and state | 1 | Every refusal is a 422 with a field message, and nothing was opened |
| Correct data | 1 | The reason is the same everywhere |
| Error recovery | 1 | J14 → J14c |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 30-54 ms per call |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Unchanged |

**7.5 of the 8 criteria that apply = 9.4 / 10: a pass, no criterion at 0.** This passes on the journeys alone; R4-M1 (a type error, see review.md Round 4) still blocks the merge.
Fix that would raise it: one limit and one wording above 500 (plain words).

Not tested: any screen, a screen reader, an intended user's walk (D17 and D20), the firm Owner's view (unchanged in this diff).
