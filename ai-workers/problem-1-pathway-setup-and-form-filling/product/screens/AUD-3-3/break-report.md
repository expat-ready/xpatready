# AUD-3 part 3 (R1.87): break report, our audit search `GET /api/system/audit` (PR #3657, head 7cb4008a5)

This was an API-only adversarial pass on the permissions and cross-firm access of `access/search.ts`, under `access/lines.ts`'s interceptor and part 2's per-firm access report. The app was built the same way as `tests/check_aud3_access.ts`: PF-4s's real guard, PF-23's request scope, the walled pool, and a scratch database `xr_studio_brk33_<pid>` on 127.0.0.1:54329, built from migrations and the Sample seed, then dropped. It listened on a random port, never :4400. It cost US$0 and used no network. I fixed nothing.
Script: `break_aud33.mts` in the session scratchpad (run it with `BRK_ONLY=1` for the short probes). Paths below are relative to `prototype/studio/api/src/platform/audit/`.
**Result: no Blocker, 1 Major, 3 Minor.** Every role, token and header attack held, every planted or duplicate `firm`, the SQL injection, the fail-closed line and the range rules held too.

## Findings

| # | Attack and reproduction | Expected | Actual | Sev. | Where |
|---|---|---|---|---|---|
| M1 | **Reading one firm's trail without naming it.** The Platform Owner searches `?from&to&entityKey=<firm A id>` (7 lines back, all on firm A's trail). Then `correlationId=<id of a firm A request>` (5 lines, all firm A) and `action=<an action only firm A has>` (5 lines, all firm A). Then the Owner opens firm A's access report | The search's own line lets someone rebuild what was searched (the file's header: "the query that produced the evidence logs itself"). A search aimed at one firm should be visible to that firm | Each search wrote one `cross_tenant.access` line. Its detail is only `{scope:"our audit search", method, route}`: no firm, no dates, no filter. Firm A's report showed only the 2 searches that used `firm=A`; the 3 targeted searches are missing. The platform trail cannot tell those 3 searches from an unfiltered browse, so a staff member can read one firm's lines and leave no trace in that firm's report. The header calls the unnarrowed case stated, but it does not cover narrowing to one firm with the other filters. Today the port's schema allows only `firm` as a filter in detail (`ports/audit.ts:147-153`) | Major | `access/lines.ts:250`; `access/search.ts:10-13, 78` |
| m1 | **A crafted cursor with a date that does not exist.** `cursor=base64url(["2026-02-30T00:00:00.000000Z", <uuid>])`, and the same with `2026-04-31` or `0000-01-01` | 422 BAD_CURSOR, as for every other bad cursor | **500** "Internal server error", and no line is written. `decode` checks only `Date.parse`, which V8 rolls over (Feb 30 becomes Mar 2), and then Postgres refuses `::timestamptz`. Part 2's access report gives the same 500, because it uses the same `decode`, which this PR exports. AUD-4's own `decode` uses `realMoment` and refuses these dates | Minor | `access/report.ts:73`; used at `access/search.ts:62, 66` |
| m2 | **A NUL byte in a text filter.** `action=a%00`, `entity=a%00`, `entityKey=a%00`, `correlationId=a%00` | 422 field error | **500** in all four cases (Postgres refuses 0x00 in text). No line is written and the database's error text is not shown. Other bad input is handled: invalid UTF-8 (`%FF`, `%ED%A0%80`, `%C0%AF`) answers 200 with replacement characters, and Cyrillic or CJK text answers 200 | Minor | `firm-read/service.ts:51-55, 79`; `access/search.ts:65` |
| m3 | **HEAD.** `HEAD /api/system/audit?from&to[&firm=A]` | Either refused, as part 2 refuses HEAD on its export, or no line | 200 with no body sent. It still writes a `cross_tenant.access` line, and with `firm=A` that line shows in firm A's report as a search of A's lines that delivered nothing. It over-logs and leaks nothing. OPTIONS gives 404 with no line | Minor | `access/search.ts:78` (Express routes HEAD to `@Get`) |

## What held

| Attack | Result |
|---|---|
| Roles: Platform Owner, Auditor / Support, Billing, Content publisher, Admin / no token / a token that is not real (`a.b.c`) / a firm's Owner token (sample-firm, user-R) | 200, 200 / 403 ×4 / 401 / 401 / 403 FIRM_SESSION_REFUSED. Only the two 200s write a `cross_tenant.access` line. A refused call adds 0 `audit_event` rows (the guard's REFUSED line is on our own table) |
| Forged `x-actor: ourstaff:<owner>`, `x-staff-id`, `x-system-staff`, `x-actor-type`, `x-firm-id`, `x-roles`, sent with no token, a firm token or Support | 401 / 403 / 403. With the Auditor's token plus `x-actor: ourstaff:someone-else`, the line's actor is the Auditor's own `ourstaff:<id>` |
| Path variants: `/API/SYSTEM/AUDIT`, `/api/system/Audit`, a trailing `/`, `/./`, `/.` | 200, each with exactly one line (SYSTEM_PATH ignores case). `/api//system/audit` gives 403 and the handler never runs. `;x` and `%2F` give 404 |
| `firm=<A in UPPER CASE>` | Lowercased on both sides. The line names A, and A's report shows it |
| `firm=A&firm=B`, `firm=A&firm=`, `firm=platform&firm=A`, `firm[]=A`, `firm[x]=A`, `Firm=A`, `__proto__=x`, `constructor=x` | 422 INVALID, no line, so nothing can be planted in A's or B's report |
| `firm=%20A`, `A%00`, `A%0A`, A without dashes, `{A}`, A with a full-width `a`, `PLATFORM` | 422 BAD_FILTER, no line |
| `firm=platform` / `firm=` / `firm=<uuid of no firm>` | The platform trail only, and the line names no firm / unnarrowed, and the line names no firm / 200 with 0 lines, and the line names that uuid, which is in no firm's report |
| The interceptor reads the same `req.query.firm` string that the handler's strict query parses | No value can narrow the handler without being named on the line, or be named without narrowing |
| SQL injection: `' or 1=1 --` in action, `x' or 'a'='a` in entity, `'); drop table audit_event; --` in entityKey, `' union select null --` in correlationId, `%` and `platform_%` | 200 with 0 lines, and the table is intact (all values are bound, with `=` and no LIKE). `actorType=OUR_STAFF' or '1'='1` and `our_staff` give 422 |
| Lengths: correlationId of 201 characters / action of 201 / action of 501 | 422 BAD_FILTER / 422 / 422 INVALID, no line |
| Cursors: one from another query (firm B's) / far future / an upper-case id / `T24:00` | It continues the keyset with nothing new readable (the key reads every line anyway) / 200 / 200 / 200 |
| Cursors: `T23:60`, `12-32`, 3 items, an object, `nope` | 422 BAD_CURSOR, no line |
| Ranges: `to = from`, `to < from`, one year exactly, one year + 1 ms, 2024-02-29 to 2025-03-01 (+1 ms), 1969, 1970, 9999, `+14:00`/`-12:00`, `.1234Z`, `20261125`, `now`, a leading space, a repeated `from`, only one of the dates | 422 / 422 / 200 / 422 RANGE_TOO_LONG / 200 (422) / 422 / 200 / 200 / 200 converted to UTC / 422 / 422 / 422 / 422 / 422 / 422 DATES_REQUIRED. No refusal writes a line |
| Fail-closed: a trigger refuses every `cross_tenant.access` insert (as in DW4), then a firm-narrowed search by the Owner and an unnarrowed one by the Auditor | Both 500 `{"statusCode":500,"message":"Internal server error"}`. No `lines` in the body, the trigger's text is not shown, and one `audit_write_failed` alert per call (2) |
| Concurrency: 20 searches at once / 2 with the same client `X-Request-Id` | 20 × 200 and 20 lines with 20 correlation ids / 2 × 200 and 2 lines |
| What the answer shows | `from, to, firm, lines, next`. Each line has id, at, firmId, trail, who, actor, actorType, action, actionWords, summary, entity, entityKey, correlationId, supportSessionId and detail. `audit_event` has no before/after or name column, so nothing more can come out |
| Volume (300k lines on one firm, one year, unnarrowed) | 48 ms with a filter that matches nothing, 37 ms with `ours=1`, 162 ms plain. The plan is a parallel sequential scan by `at` (stated in the header: no index of its own in this part) |

## Not findings

- An unnarrowed search shows every firm's lines and names no firm. The PR's header states this (search.ts:12-13), and part 2 made the same ruling. M1 covers only the narrowed case that the header does not state.
- A search with `firm=<uuid of no firm>` writes a line naming that uuid. It can reach no firm's report.
