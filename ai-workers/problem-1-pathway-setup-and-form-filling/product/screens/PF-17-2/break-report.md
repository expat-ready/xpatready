# PF-17 part 2 (R1.93): break report

Breaker, 23 Nov, on `claude/runtime-pf17-support` at d1cf4ba67 (diff `cd306cb67..d1cf4ba67`). API only, so this checks build-notes "What gets built" items 1 to 7. Anything on its "Not built" line is out of scope.

**How I tested.** (a) A throwaway probe built on the suite's harness: scratch database, the small Nest app with PF-4s's guard and wall, PF-12's interceptor and the real feature providers, about 120 calls. (b) An isolated copy `brk17` on :4497 (`PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`), with a seeded Support person, an Auditor and a ticket in `sample-firm`, called with curl and then stopped. (c) The migration run on its own as a NOSUPERUSER, NOBYPASSRLS table owner under FORCE RLS. The builder's `check_pf17_support.ts` gave 26/0 and `check_pf4s_system_signin.ts` gave 102/102. No file in the repository was changed apart from this report.

## Attempts

| # | What I did | Expected | Actual | Sev |
|---|---|---|---|---|
| 1 | Replied as Billing, Content publisher, Admin and Auditor; opened one ticket as Billing and as a Content publisher | 403 MISSING_PERMISSION, nothing written | 403 every time. One PF-4s line each; no message, status change, audit_event or bypass line | held |
| 2 | Firm staff token on `/API/System/Support/Tickets`, `/api/System/Support/Tickets`, `…/tickets/`, `…/:id/`, and a POST to `/api/System/Support/Tickets/:id/Replies` | 403 | 403 FIRM_SESSION_REFUSED, in the harness and in the running app. In the running app `/API/…` (capital API) never reaches the API: it gets the SPA's index.html, with no data | held |
| 3 | System token used on the firm route `/api/platform/support/tickets/:id` | refused | 403 SYSTEM_SESSION_ELSEWHERE | held |
| 4 | Forged token (`sub` changed to the Owner's, signature kept), `alg: none`, garbage, a token past its expiry (clock +2 h), a one-step sign-in, a grant ended after sign-in | 401 / 403 | 401 TOKEN_REFUSED ×3, 401 TOKEN_EXPIRED, sign-in refused TWO_STEP_REQUIRED, 403 MISSING_PERMISSION (keys are re-read from the database on every request) | held |
| 5 | Bad ids on GET and on reply: `'; DROP TABLE …--`, `%00`, 5,000 characters, `{uuid}`, `..%2F..%2Fsystem%2Ffirms`, `uuid%20`, the all-zero, all-f and non-v4 uuids | 404, no bypass line | 404 NOT_FOUND every time, 0 bypass lines. An upper-case real id gives 200/201 (it is lower-cased) | held |
| 6 | Bad queries: `status=OPEN' OR 1=1--`, `page=0`, `100000`, `1e3`, `2.5`, `%201`, `status=open`, `status=`, `page=`, a repeated `status`, `firm[]=`, `firm[$ne]=` | 422 SUPPORT_QUERY naming the field | 422 naming the field each time. `page=99999` gives 200 with an empty page and the right total; an upper-case firm uuid filters correctly; an unknown firm uuid gives 200 with total 0 | held |
| 7 | Extra body fields `status`, `authorKind`, `firmId`, `ticketId`, `authorId` | 422, nothing written | 422 `fields.<name>`, nothing written | held |
| 8 | Raw JSON `{"body":"…","__proto__":{"status":"CLOSED"}}` | 422 (item 4: "an extra field → 422") | **201.** Zod's `strictObject` skips the `__proto__` key and leaves it out of its output, so the field is dropped without an error. Nothing from it is stored and no prototype is polluted (checked) — `support.ts:43` | Minor |
| 9 | Bodies: 5,000 × "x", 5,000 emoji, 5,001 emoji, invisible marks only (ZWSP, WJ, BOM, SHY, Braille blank, Hangul filler, combining marks only, tag characters, VS17), BEL, NUL, ESC, empty, tabs and newlines only, `null`, an object, text/plain, malformed JSON, 120 kB and 2 MB | 201 for real text; 422/400/413 otherwise, nothing written | 201 at 5,000 (counted in code points, stored byte-exact). 422 for the 5,001 emoji and for every invisible, control, blank, null or object body. text/plain → 422, malformed JSON → 400, 120 kB / 2 MB → 413 from the parser. Each refusal leaves 0 messages, 0 audit_event lines, 0 bypass lines | held |
| 10 | Non-English (Cyrillic, Chinese, Arabic, emoji) and an RTL override at the start | 201, stored as sent | 201, stored byte-exact (md5 checked) | held |
| 11 | A body with a lone surrogate (`\ud800`) | 422 or stored as sent | 201, stored as U+FFFD. This is PF-18b's `Body` (`support/support.ts:70`), not this diff. Noted only | — |
| 12 | Reply to a CLOSED ticket; a blank body on a closed ticket | 409; 422 | 409 SUPPORT_CLOSED: message count, status and `updated_at` unchanged, 0 audit_event lines, 0 bypass lines on the firm, 1 PF-4s line. Blank body: 422, 0 lines | held |
| 13 | Race: 8 parallel replies (Support and Owner alternating) on one OPEN ticket; a reply racing a direct `UPDATE … CLOSED` | 8 × 201; one wins | 8 × 201: 9 messages, WAITING_ON_FIRM, 8 `support.ticket.replied` lines and 8 bypass lines, all on that firm (the `FOR UPDATE` lock serialises them). The close won and the reply got 409 with nothing written | held |
| 14 | Firm walls: opened and replied on firm S's ticket, then listed | lines on firm S only; the list firm-less | GET: firm S +1, firm A +0. Reply: firm S +1 (`system:platform.console.support-ticket`, method POST), firm A +0. List: one firm-less line, nothing on any firm. Raiser and author names come only from the ticket's own firm. The running app's trail shows the same | held |
| 15 | Called the list's bypass use from other routes (`GET /api/system/firms`, `/api/platform/support/tickets`, `POST …/tickets`, `…/ticketsX`, `…/x/../..`) | BypassRefused | BypassRefused every time | held |
| 16 | Called `reply()` inside the GET one-ticket route's scope (one use covers the read and the write) | refused by the key | Under that route the bypass would allow the write; only the service's own `system/support:manage` check (`support.ts:66`, item 6) stops it. Over HTTP the GET route only ever calls `one()`, so it cannot be reached. Held; noted for review | held |
| 17 | The firm reads its ticket after our reply (`/api/platform/support/tickets/:id` with the firm's token, running app) | our reply shown, status Waiting on firm | `WAITING_ON_FIRM`; our message has `authorKind: SUPPORT`, `authorId: "support"`, `authorName: null`. The firm's screen names it "ExpatReady support" itself (`web/…/support-contract.ts:34`). Another firm gets 404 | held |
| 18 | System route called on a firm's own web address (`Host: sample-firm.localhost`) | not served | 404 "This page is not available." | held |
| 19 | Scale: 5,005 tickets, pages 1 to 51 | list < 200 ms (STANDARDS §9) | list 33–60 ms, one ticket 13–19 ms; ORDER BY with OFFSET 2,500 runs in 3.4 ms | held |
| 20 | The reply's 201 body compared with the next GET | the same shape | identical keys and values; the subject is unchanged | held |
| 21 | Migration as a NOSUPERUSER, NOBYPASSRLS owner under FORCE RLS; run twice | 6 rows, FORCE put back | 6 rows (25 → 31), FORCE back on. The second run fails on the duplicate key, rolls back whole, and FORCE stays on. No Billing or Content-publisher row and no `system/support:reply` | held |
| 22 | Error wording: a blank reply from our staff | — | 422 "write what you need help with, without control characters": the firm's words, as item 4 intends. Part 4's screen may want our staff's own words. No action for this part | — |

## What held
The key check at the guard and again in the service. The firm and system planes stay apart, mixed-case paths included. Forged, expired, one-step and revoked tokens are all refused. Ids and query values are strictly checked (404 / 422, never 500). The body is `body` only. Invisible and control text is refused. Every refusal is whole: it writes nothing except PF-4s's own line. A closed ticket gives 409. Concurrent replies are serialised. The per-firm bypass line lands only on the ticket's firm, and the list's line names no firm. Both bypass uses are refused on any other route. The firm sees our reply and the status Waiting on firm. Speed is well inside budget. The migration seeds data only and is safe under FORCE RLS.

## Findings
* **Minor m1** — `support.ts:43` (`ReplyBody = z.strictObject(...)`): a `__proto__` key in the JSON body is dropped without an error rather than refused 422 as item 4 says. It does no harm (nothing stored, nothing polluted). One possible fix is to check `Object.hasOwn(input, "__proto__")` before parsing; the same Zod behaviour applies to PF-18b's schemas.

No Blocker or Major findings.

Verdict: Approve on d1cf4ba67
