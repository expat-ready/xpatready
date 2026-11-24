# PF-17 part 4: our console's Firms and Support pages (R1.93), concept r1, 24 Nov

Status: **concept, waiting for the challenge and Lead 26's approval (P-223 (4): no board; the founder looks next morning).** Board source: `design/console-r1.html` (self-contained). Hand-over: `handover.md`.

## 1. Job and journey
* **Job:** our own staff see, in one place, which firms need us (health, failed jobs, plan state) and answer the firms' "?" tickets.
* **Persona:** ExpatReady's Platform Owner and Support (PF-4s roles; Support holds `system/firm:read` and the two support keys, SA10-X3, Sample, **Unconfirmed: SA10-X3 pending**).
* **Requirements:** SA-2-14 (per-firm status, plan, trial end, payment state, usage vs limit, over-limit, last staff sign-in); SA-10 §3.2 (one queue, each row "firm (name and plan)", status, ticket age, "Waiting on firm" marker, oldest unanswered first, server-paged); SA-10 §3.4 (ticket workspace, reply only here). R1.93 "health per firm (last sign-in, failed jobs, plan state); support button". j_93 W2 and W4 screen lines.

## 2. Ten layers (STANDARDS §2)
| Layer | On main | New in part 4 |
|---|---|---|
| Data | all tables (PF-4s, PF-5, PF-14, PF-15, PF-18b) | none: **no migration** |
| Rules | health (part 1), queue order (part 2) | m1: a capped dead-letter read is said, not hidden |
| API | `GET /api/system/firms`, `/:id`, `GET /api/system/support/tickets`, `/:id`, `POST /:id/replies`, `/api/system/me`, `POST /api/system/session/local` | `firm.plan` on each queue row and ticket (Lead 15); `failedJobsComplete` on each firm |
| Session (web) | firm staff: `xr-staff-session` (`modules/platform/session.ts`) | **ours: `web/src/modules/system/session.ts`** (§4a) |
| UI | none under `/system/*` | `/system/firms`, `/system/support`, the ticket side panel, the console frame and sign-in card |
| Audit | guard line per call; AUD-3 firm line on `/:id` and replies | nothing new (the screens call the same routes) |
| AI | none | none (live AI off, US$0) |
| Team's code | the team's super-admin console (read-only reference) | names kept: Firms, Support, Waiting on firm |

## 3. Business rules
* **BR-1** Each page shows only to a signed-in staff member with its key: Firms `system/firm:read`, Support `system/support:list`, Reply `system/support:manage` (SA-07 App. A; SA10-D8). Without the key: the page says so (403 words from the API), never an empty list. Nav hides a page the person cannot open.
* **BR-2** Our session never reaches a firm route and a firm's never reaches ours (PF-4s wall): two keys, two fetch helpers; neither helper ever sends the other's token.
* **BR-3** Health stays part 1's (HELD, ATTENTION, OK, NOT_LIVE with reasons). **Failed jobs are shown, not judged** (no requirement gives a threshold; inventing one is out, A73). m3 proves it.
* **BR-4 (m1)** When PF-14's read returns the full cap `DEAD_LETTER_READ`, every firm's `failedJobsComplete` is false; the page shows "N+" and one note, never a bare 0 that may be wrong. When the list cannot be read: "Not known" (null, part 1).
* **BR-5** Each queue row and the ticket name the firm's **live plan** from the same source as the Firms page (PF-15's `limitOf`), so the two pages never disagree; no live plan → "No live plan".
* **BR-6** Queue order and filters are the server's (part 2); the page never re-sorts. Ticket age = now − created; "waiting since" = updated.
* **BR-7** A reply is PF-18b's (blank → the API's 422 on the field; closed ticket → 409 shown in the panel, composer read-only).
* **BR-8** The same Sample-labelled data the API returns; no immigration values on these pages.

## 4. Layout (EXPERIENCE §3: **Library list** for both pages, **Side panel** for a ticket)
**4a. Session (the brief's ask).** `sessionStorage["xr-system-session"] = {token, expiresAt}` (ms), the firm side's shape under its own key, as j_93 assumes; an in-memory copy when storage is refused (firm side's break M3). Kept for this tab only; a new tab signs in again (same as firm staff; SA-7's MFA sign-in each session). A timer ends it at `expiresAt`; any 401 ends it and the sign-in card says why (`TOKEN_EXPIRED`, `SESSION_REVOKED`, ended by a Platform Owner's "end sessions"). Sign out drops the token and every `["sys", …]` query. **Sign-in card:** PF-4s's local stand-in (`POST /api/system/session/local`, work email; the card states "local stand-in, second step taken"); when the server answers `STAND_IN_OFF` (Cognito servers) the card says "Sign-in for ExpatReady staff is not set up on this page yet" (real Cognito pages: Not built, Q1).
**4b. Frame.** The app's one `Frame`, titled "ExpatReady console"; left nav Firms, Support (by keys); the person's name and Sign out set apart at the end. No firm "?", no trial banner, no firm menu.
**4c. Firms (`/system/firms`, h1 "Firms").** Search (name or web address, `?q=`), health chips (All · Held · Needs attention · OK · Not live, `?health=`), table 50 a page: **Firm** (name, web address muted) · **Health** (icon + word + reasons as text, UXL-14) · **Plan** (name) · **Plan state** (Active, Trial ends 3 Dec, Overdue, Payment hold, Ended) · **Seats** used/limit · **Cases** individual and corporate used/limit · **Storage** MB used/limit "as of" date · **Failed jobs** (number, "N+", "Not known") · **Last staff sign-in**. Over-limit figures carry the word "over". `complete: false` → note "Some firms' figures were not worked out on this filter; narrow the search." No row action (opening a firm: Not built here, §6b).
**4d. Support (`/system/support`, h1 "Support").** Status chips (All, the default: the server already puts tickets waiting on us first · New (OPEN) · Waiting on us (WAITING_ON_SUPPORT) · Waiting on firm · Closed; one `?status=` each, the API takes one); a firm filter arrives from the URL `?firm=` only; table 50 a page: **Subject** · **Firm** (name, plan under it) · **Status** ("Waiting on firm" as a marker) · **Raised by** · **Page** · **Age** · **Waiting since** · **Messages**. Whole row opens the ticket.
**4e. Ticket panel (520 px; one pane at 375).** Header: subject, firm name and plan, status, age. Thread in order (firm messages; ours "ExpatReady support"). Composer: "Reply (the firm will see this)", one primary button **Send reply**; read-only on a closed ticket or without `:manage`.
**States (§4):** loading skeleton rows; empty Firms "No firms match this search" / Support "No tickets here." with a link to All; error with Retry; no key (403 words); signed out (card); long firm names wrap; job queue down ("Not known").

## 4b. Best in class
Stripe Dashboard customers (status chips over one dense table, every figure clickable), Intercom/Zendesk inbox (oldest unanswered first, status as text marker, side-panel thread with an unmistakable reply composer), Help Scout ("Waiting on customer" pill). We copy: chips + table, side-panel thread, text-plus-icon status. We beat: numbers that agree across pages (same plan source BR-5), no false zero (BR-4). Scorecard BIC-01..20: case-side only (§6 scope): **N/A**, our internal console. UXL-01..14 answered in `design/console-r1.html` notes; at 375 px tables scroll inside their box with a visible edge (UXL-10).

## 5. Copy
Firms empty: "No firms match. Clear the search or pick All." · failed jobs note: "Only the oldest 10 000 failed jobs were read; newer ones may not be counted here." · "Not known: the job queue could not be read just now." · Support empty: "No tickets here. Pick All to see every ticket." · closed ticket: "This ticket is closed. The firm can reopen it by writing again." · no key: the API's own sentence.

## 6. Contract and tests
* **API (m1-m3 + plan):** `FirmHealth.failedJobsComplete: boolean`; `QueueItem.firm.plan` and `QueueTicket.firm.plan: {code,name} | null`. Tests in `tests/check_pf17_console.ts`, **red first**: DW11 (m1) a read returning 10 000 entries → every firm `failedJobsComplete:false`; 9 999 → true; DW10 (m2) the fake reader records `limit === DEAD_LETTER_READ`; DW12 (m3) a firm OK in every fact with 5 failed jobs → `health:"OK"`, `reasons:[]`; SQ-plan pass: both Sample firms' queue `plan.code` equals the Firms page's; fail: a firm with only an ENDED subscription → `plan:null`.
* **Browser (`tests/check_pf17_console_browser.ts`, B1-B9, own port, never :4400):** B1 signed out → card; stand-in sign-in → Firms; B2 Firms lists both Sample firms with failed jobs and plan state (j_93 W2); B3 health chip `Held` narrows (fail: unknown `?health=X` → the API's field error shown); B4 Support shows the "?" ticket with firm A's name and plan (j_93 W4); B5 open, reply, status "Waiting on firm"; fail: blank reply → field error; B6 a Support-less staff member (Billing) opening `/system/support` → the no-key words, nav hides it; B7 a firm token in `xr-staff-session` alone → the console shows the card (BR-2); B8 expiry on the clock → card with reason; B9 keyboard only, axe 0 serious, 1024/1440 and 375.
* `tests/journeys/j_93.ts` W2 and W4 screen lines pass unchanged (they use the key and shape in §4a).

## 6b. Capability or scaffolding
Needed for the proof: session, frame, Firms, Support list, ticket panel with reply, plan on rows, m1-m3. **Scaffolding:** the stand-in sign-in card (PF-4s's stand-in, local only). **Not built:** Cognito sign-in pages for our staff (Q1); a firm detail panel (`/:id` read is on main; no requirement line for a page in R1.93); internal notes, assignment, priority (part 2 Not built); overdue list, extend trial, refund, sign-up links (other PF-17 parts).

## 7. Questions for the tech lead (recommendation first)
1. **Session on Cognito servers:** recommend the stand-in card only (local), with "not set up here" on Cognito servers, and a follow-up row for our staff's real sign-in pages. Else: build the Cognito hosted sign-in in this part (+1 PR).
2. **PR split (P-610):** recommend 3 PRs: (A) API: plan on queue rows + m1-m3; (B) session, frame, Firms page; (C) Support page and ticket panel. Else two (A+B, C).
3. **Firm detail:** recommend no firm panel in part 4 (opening one writes a line on the firm's own log, AUD-3; nothing in R1.93 needs it). Else a read-only side panel from `/:id`.

## Definition of ready
Acceptance: j_93 W2 and W4 screen lines, `check_pf17_console.ts` DW10-DW12 + SQ-plan, `check_pf17_console_browser.ts` B1-B9. Row: BACKLOG PF-17 (screens; support list and reply). Decisions: Lead 15 on #3225 (plan on rows); Q1-Q3 above; no migration.
