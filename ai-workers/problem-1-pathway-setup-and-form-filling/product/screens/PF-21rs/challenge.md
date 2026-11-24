# PF-21rs — challenge of concept r1 (fresh challenger, 24 Nov)

Read: `concept.md`, `design/board-r1.html`, the PF-21rs and PF-21c rows, QA-757, R1.85/R1.86, `j_85.ts`, `j_86.ts`, `api/src/platform/register/{breaches,requests,holds}`, `keep-period/service.ts`, `ports/legal-hold.ts`, `ports/messages.ts`, `messages/send/messages.ts`, `system-console/{routes,firms}.ts`, `system-identity/{guard,keys,routes}.ts`, `audit/access/declare.ts`, the brief (`trace-requirements.py --brief PF-21rs`), EXPERIENCE §2-§5, §7, STANDARDS §2-§6, and #3489's `web/src/modules/system/*` (branch `pr3489`). `ai-workers/tools/freshness.sh` cannot run in this copy (no `code/` folder): team sources are **Unverified** for freshness. Paths below are under `prototype/studio/`.

## Verdict
**Build after these changes.** No Blocker. Six Majors, all cheap to settle on paper before the build; none needs a migration or new scope. The routes and fields the concept leans on exist, with the exceptions named below.

## Objections

### Major
**M1. R0 (a) puts the read of a firm's stored message inside the breach service: that crosses the module wall.** *Needed for the proof.*
* Fact: the breach service reaches messages only through `MessagePort` (`features/platform-register-breaches.ts:11`), and the port has `send` and `dispatch` only (`ports/messages.ts`, interface `MessagePort`). The outbox row, its `rendered_hash` and the file key are the messages module's own (`messages/send/messages.ts:72`, `:118`, `:211-212`). No file under `register/` reads `msg_outbox` today. STANDARDS §4 [M]: modules talk through services and contracts, not each other's tables.
* Example: R0 as written ("`register/breaches/service.ts`, no migration") would copy the key rule and the hash check into a second module; a later change to the stored shape breaks the register silently.
* Fix: the messages module gets one read ("the stored words of this outbox row of this firm": subject and text only, `null` when the file is missing or its hash differs), reusing its own hash check, reached through the port (interface, fake and port contract test updated in the same PR). The breach service calls it once per notice, inside that firm's scope. Still no migration. Feasible: yes (fact for the wall; judgment for the shape, high confidence).
* Also say in R0: only `subject` and `text` leave the file (it also holds the recipient's address and the HTML); a suppressed first recipient still has a file (`messages.ts:118` stores before the state is set), so "first recipient" is safe.

**M2. Staff names on the board have no source.** *Needed for the proof.*
* Fact: every answer carries `staff:<id>` only: breach `openedBy`, `decidedBy`, notice `sentBy`, event `actor` (`breaches/service.ts:51-55`, `:207`), request `recordedBy` and step `actor` (`requests/service.ts:35-37`), hold `placedBy`, `releasedBy` (`holds/service.ts:36`). No route lists our staff (`system-identity/routes.ts:26-45` has changes only); `/api/system/me` gives the reader's own name. The board prints "Platform Owner (Sample)" in the breach header, the Decision card, History, the request steps and the hold row.
* Fix (pick one, say which): R0's joins also return the staff display name beside each `staff:<id>` (our own table, the same PR), or the pages show "You" for the reader's own id and "ExpatReady staff 3f2a…c91e" otherwise, with "Daily check" for `system:platform.register.data-requests`. Recommended: the R0 join. Judgment, high confidence.

**M3. The Definition of ready promises journey steps the build cannot turn green by itself.** *Needed for the proof.*
* Fact, j_85: its browser never signs in to the console (`j_85.ts:88`, `:106`, `:164` are bare `goto`s; the token at `:76` is used for API calls only) and #3489 keeps the session in `sessionStorage` (`session.ts`), so all three console steps land on the sign-in card. W1 also wants a heading matching `/privacy|data requests/i` (`j_85.ts:90`); the concept's heading is "Requests to us". W2 reads `main` for "in progress", "completed" and the actions taken (`:107-108`).
* Fact, j_86 W6: the sent time must appear as `2026-11-24`, "Nov 24, 2026" or "November 24, 2026" (`j_86.ts:216`; checked with node). The board shows "24 Nov 2026, 09:05 UTC", which is #3489's style (`contract.ts` `dayWords`, en-GB; `momentWords` has no year). None of the three forms matches.
* Sound here: `/system/privacy/breaches`, "Record a breach", a heading with "Breaches", "Send notice to <firm>" (matches `/(send|notify).*<firm>/i`, and no such button once sent), firm names A and B and not C, the subject in view, widths 400/1024/1440 all match j_86 W1, W6, W9.
* Fix: add a short "For qa to align" list to the concept (j_86's header, `:28-31`, says qa aligns paths and labels once the concept is agreed): j_85 signs in on the card as j_86's `consolePage` does and reads the heading "Requests to us"; j_86's `timeShown` accepts the console's date form. Keep one date style in the console (do not switch only these pages). Reword the Definition of ready to "after qa's alignment".

**M4. The person on a request or a hold is a pasted id that nothing checks, and the dialog that takes it is not drawn.** *Needed for the proof.*
* Fact: the API accepts `firmId` + `subject {kind: PERSON, id}` on a request and returns `firmId`, `personId` (`requests/service.ts:50-54`, `:71-72`): the concept's assumption holds. But `plat_data_request_log` stores the id as given (migration `20261123200000_pf21b_data_requests`), and the hold checks only that the firm exists (`holds/service.ts:130`). No system route reads a firm's people (rightly: walls).
* Example: the Platform Owner pastes a person id with one wrong character, clicks "Hold this person", sees an active hold. It covers nobody; the deletion later proceeds.
* Fix, no new scope: draw "Log a request" (it is not on the board): type, requester, email, day received, and under "About a firm's person (optional)" the firm picker plus "Person record id" (full id, pasted; shown chunked after). Both dialogs say in one line: "The console cannot check that this id is a person of that firm. Copy it from the firm's record." Log the missing check as a runtime gap for qa (Not built here). Judgment on severity: medium-high.

**M5. Two PRs will not hold under 800 lines; plan the third cut now.** *Needed for the proof.*
* Fact: #3489's one read-only page cost 334 web lines (frame 74, session 86, contract 85, page 79, routes 10) plus a 198-line browser check. The concept counts "5 dialogs"; the board needs nine actions: record, edit, confirm a draft, decide, send; log, move (start / complete / held); place, release.
* Judgment (medium confidence): PR A as proposed (list, breach page, four or five dialogs, contract, menu, W4-W6) lands near 900-1,100.
* Fix: three screen PRs after R0: **A1** menu group, Breaches list, "Record a breach", contract (j_86 W1, W9; j_85 W7); **A2** the breach page: decide, send, words, history (W4; j_86 W6); **B** Requests and Holds (W1-W3). W5 and W6 run per PR on that PR's pages. One shared form serves Record, Edit and Confirm a draft (same fields; confirm adds `status: RECORDED`).

**M6. W5 as written cannot happen in the browser.** *Needed for the proof.*
* Fact: a firm user has no console session; `systemApi` sends only the console's token (`session.ts`), so a firm user at `/system/privacy/*` sees the sign-in card, never "the 403 words". The 403 words on a page are reachable only by one of our staff without the key (the Auditor on Requests or Holds).
* Fix: W5 = (a) a firm Owner's token on every register route → 403 (API); (b) a firm Owner's browser at each page shows the sign-in card and no register data, and the card refuses their email; (c) the Auditor opens Requests and Holds by address → the API's 403 words, no table; on Breaches no change buttons.

### Minor
* **m1. BR-7 is not true for requests.** Fact: the request routes are `@SystemChange` without `@SystemReason` (`requests/routes.ts:23-27`); `reason` is optional and recorded when given (`guard.ts:119`). Fix: BR-7 reads "breach and hold changes need a reason; on requests it is optional", the field marked optional there. *Needed.*
* **m2. A missing reason is a 400 with code `REASON_REQUIRED`, not a 422 with `fields`** (`guard.ts:114`, `:123-124`; a reason needs a letter or digit). Fix: the dialogs put `REASON_REQUIRED` and `REASON_TOO_LONG` under the reason field. *Needed.*
* **m3. `systemApi` cannot send a header** (`session.ts`: `init` is `{method, json}`), and "Record a breach" needs `Idempotency-Key` (`breaches/routes.ts:28-30`). Fix: add `headers` to `systemApi` in PR A1. Requests and holds have no idempotent create (runtime gap, Not built): their buttons go busy while the call runs. *Needed.*
* **m4. "Kept until Nov 2033" invents a rule.** The brief says "kept 7 years" with no start point. Fix: "Kept 7 years." *Needed.*
* **m5. Status edges not defined:** Notify firms with no firm named yet (0 of 0); a firm that answers `NO_RECIPIENTS`. Fix: "Firms to be named" for the first; the second stays "Notices owed" with the API's words on its row. Put the status function in `privacy/contract.ts` with a pass and a fail test. *Needed.*
* **m6. "Held → as the API allows" is not a design.** Fact: Held → In progress or Completed; Overdue → Completed or Held; Pending may go straight to Completed (the migration's MOVES comment). Fix: Held offers "Resume work" and "Mark completed". Add under "Mark held": "This marks the request only. It places no legal hold." (a person may think it protects data). *Needed.*
* **m7. The firm picker's cost.** Fact: `GET /api/system/firms?q=` works for the Platform Owner (`system/firm:read` is seeded to it) and finds every firm by name, but each call writes one `cross_tenant.access` line and reads up to 50 firms' usage figures (`system-console/firms.ts:13-19`, `:44`). Fix: search after 300 ms and 2+ characters (as #3489's page), never per keystroke. Sound otherwise. *Needed.*
* **m8. Words depend on a file the firm's side owns.** Judgment (medium): if that file is ever disposed (`FilesPort.delete` exists, `ports/files.ts:56`), a 7-year record shows no words. R0's `words: null` + note is the honest answer for now; a copy on the notice row is a migration: *Not built* (see question 2).
* **m9. R0's read is one firm-scoped read per notice** (up to 200 firms a breach, `breaches/service.ts:65`). Only on `GET :id`, never on the list. State the bound in R0; fine at sample scale (STANDARDS §9). *Needed.*
* **m10. The menu "group" changes #3489's `frame.tsx`** (`SECTIONS` is a flat list, used twice: side menu and phone row). Name it in the touch list; five links, within UXL-06. *Needed.*
* **m11. Gold-plating watch:** "Hold this person" on the request page is beyond the row (W3 only says "place a person hold"). Keep it only if PR B stays under size; cut it first. The breach list's Draft row needs no draft-making screen (correctly Not built). *Not built if cut.*

## What is sound
* Every list, read and change the concept names exists with the stated keys: breaches (list, one with `events`, POST, from-alert, PATCH, notices), requests (list with `?status=`, read with `steps`, POST, status), holds (list with `?state=`, POST, release). No new route is needed beyond R0.
* A request can move to HELD (`requests/service.ts:56`); Overdue by hand is refused; the Overdue alert shows as one `OVERDUE_ALERTED` step on the request's read, so W2's "one alert row" is real data (the list itself carries no alert, so the proof belongs on the request page, as the concept has it).
* R0 (b)'s reason is right: `GET /api/system/firms/:id` is `@ReadsFirm` and writes a line on that firm's trail per call (`system-console/routes.ts:19`, `declare.ts:4-5`); names must come with the register's own answers.
* Not re-rendering words from today's record is right: the description can change after a notice (only the decision and notified firms are fixed, `breaches/service.ts:97-98`).
* W3's reasoning is right: on main only the firm-closure purge asks the hold port (`firm-closure/closure.ts:76`, `:113`) and `KeepPeriods.check` has no route; no firm screen deletes a person. Proving HELD through the app's check, as j_85 W4 does, is the honest proof. The SA-11-18 copy point is right: the firm's words are "This data is on hold and can't be deleted."; our reason stays in our console.
* One notice per confirmation, no "send to all": matches the 409 rules and keeps W4 plain. Hold dialog: one Reason field serves both the hold and the guard. Patterns, states and widths fit EXPERIENCE §3-§4, §7.
* SA-11-34's "no client data requests panel" does not forbid SA-11-27's register of requests to ExpatReady (judgment, medium-high).

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Breaches list, status | `plat_breach` | GET `/register/breaches` + R0 firm names | status calculated in `contract.ts` (m5) | unit pass/fail; j_86 W1, W9 |
| Record / edit / confirm | `plat_breach`, events | POST (Idempotency-Key), PATCH | BR-1, BR-3; 422 `fields`; 400 reason (m2) | W4; double click records once |
| Decide | `plat_breach` | PATCH `decision` + `decisionReason` | BR-2; `DECISION_KEPT` 409 | W4 fail path |
| Send one notice | `plat_breach_notice`, outbox | POST `:id/notices` | BR-3; `ALREADY_NOTIFIED` 409 | W4; second send by API → 409 shown |
| Words sent | outbox file + `rendered_hash` | GET `:id` via the messages read (M1) | subject and text only; `null` if changed | R0: equals file; tampered → null |
| Names (firm, staff) | `platform_firm`, `plat_system_staff` | R0 joins (M2) | no `firms/:id` call per row | names present; firm key 403 |
| Requests list, page | `plat_data_request`, events | GET list, GET `:id` | BR-5; moves per m6 | W1, W2 |
| Log, move | same | POST, POST `:id/status` | Completed needs "What was done" | W1 fail path |
| Holds list, place, release | `plat_legal_hold` | GET, POST, POST `:id/release` | BR-6; `ALREADY_RELEASED` 409 | W3 with `KeepPeriods.check` |
| Access | system keys | each route's guard | BR-8 | W5 (a)-(c) per M6 |

## Questions for the founder (≤3, recommendation first)
1. **W3's proof (recommended: accept the rewording).** No firm screen deletes a person yet, so PF-21rs proves the hold through the app's own delete check, and the firm-side refusal on screen comes with the erasure row. The other choice, waiting for the erasure, holds these pages back for nothing they change.
2. **Notice words kept with the breach record (recommended: read them from the stored message now; decide the copy later).** Today the words live in the firm's message file. A copy on the notice row would make the 7-year record stand alone but needs a schema change. Unconfirmed: no counsel on what the record must hold.
3. **Requests to ExpatReady in the console (recommended: yes).** SA-11-34 bars a "client data requests" panel; SA-11-27 asks for the register of requests made to ExpatReady itself. We read these as two different things.

## Lead response

## Agreement

## Build discoveries
