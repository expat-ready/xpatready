# PF-21s — Complaints list and record page: concept (stage 1, approved by Lead B for stage 2)

Row PF-21s (BACKLOG). Source: P-579 (complaints record: "each complaint, its handling, outcome, dates"), P-584 (8) (complaints record: platform, a firm-level register). Code SOR/2022-128 s. 24(3)(r), s. 29, s. 37 as cited in PF-21's service header; legal reading **Unconfirmed: no counsel**; every list and period **Sample** until the College's by-laws are read. No board (P-223 (4)): layout in `design/layout.html` (list, record page, record drawer, states). Challenge: `challenge.md` (1 Blocker, 5 Major, 8 Minor, all accepted).

## 1. Job and journey
* **Job:** keep the firm's complaints record: record each complaint when it arrives, see what needs acknowledging, walk it to a close with an outcome, never lose an event.
* **Personas (keys from the PF-21 migration):** Owner and Admin hold `agent/complaint:record` + `agent/complaint:read`: see every complaint, act on any, change handler. Case Manager holds record only: records, sees and handles only complaints they handle. Any staff member named handler: sees and handles their own (no key needed). Exact rules: the table in §3.
* **Journey:** Record a complaint (drawer) → the handler sees it in Open → Record the acknowledgement → Add handling steps → Record the response sent → Close with an outcome. Steps are never required: a complaint can be closed at any point while open (for example Withdrawn the same day). Overdue = open, not acknowledged, past its acknowledge-by date (service `isOverdue`).
* Activity / SA-01B ids: not known (P-579: "map §0 C No card found").

## 2. Ten layers
| Layer | In the app (main) | Team's code | New here |
|---|---|---|---|
| Masters, links | `plat_complaint`, `plat_complaint_event` (insert-only, database-guarded); enums subject kind, channel, category, outcome, event kind | none found | none |
| Rules, engine | `ComplaintsService` (who sees what, order of dates, closed changes by note only, never deleted); `acknowledgeBy` = 2 business days (Sample) in the firm's calendar | none | none (PF-21v adds `businessDaysLeft` beside `acknowledgeBy`) |
| Contract | PF-21w routes (prefix `api/platform/complaints`); `GET /api/platform/me` gives `staffId`, `displayName`, `keys` | none | PF-21v view fields and `GET /handlers` (§6) |
| Screen | nothing; staff session and platform frame come from PF-6 part 1 | none | `web/src/modules/platform/complaints/` |

## 3. Business rules (the screen shows them; the server enforces them)
* BR-1 Read: the read key sees all; otherwise only complaints you handle (service `canRead`, `list` `mine`).
* BR-2 Act (acknowledge, step, response, close): the handler, or someone with both keys (`canAct`).
* BR-3 Change handler: both keys only, open only, an active staff member, not the same person (`changeHandler`).
* BR-4 Not found: another firm's complaint, someone else's, or a bad id all give the same 404 and the same words (`notFound`).
* BR-5 Order: acknowledge once, after received, no later than the response; response once, no earlier than the acknowledgement when there is one (a response before any acknowledgement is allowed); close once, at any point while open, no earlier than any recorded date (received, acknowledged, response); no date in the future. Steps are never required.
* BR-6 Closed: only a note may be added (409 `complaint-closed` otherwise); the record keeps its facts.
* BR-7 Never deleted: no delete control; `DELETE` is refused for everyone (405 `complaint-kept`).
* BR-8 Overdue: open and not acknowledged after `acknowledgeBy` (2 business days, Sample, `business-days.ts`). Once acknowledged there is no further date in the service, so an acknowledged complaint shows plain Open however long it waits (said in the Overdue chip's tooltip and the "How it works" panel).
* BR-9 Who made it: Someone else needs a name and no linked id; front office or case party needs the other module's id (`RecordComplaint`). The screen sends `complainantName` for every kind.

**Who sees what** (from `/me` keys and the view's `handlerStaffId`; the server still decides):
| Who | List | "Record a complaint" | Action buttons on a record | Change handler |
|---|---|---|---|---|
| Both keys (Owner, Admin) | all | shown | on every open complaint | shown while open |
| Read key only | all | hidden | only on ones they handle; otherwise read-only with its reason | hidden |
| Record key only (Case Manager) | ones they handle | shown | on ones they handle | hidden |
| Handler, no key | ones they handle | hidden | on ones they handle | hidden |
| None of these | empty; a record opens Not found | hidden | none | hidden |

## 4. Layout (`design/layout.html`)
* **Header (PF-6 part 1's platform frame):** names the signed-in staff member from `GET /api/platform/me` (`displayName`); no simulated-person controls on these pages. Where-line set by each page: "Complaints" and "Complaints › {subject}", with Cases only as the way back.
* **List: Library list pattern** (EXPERIENCE §3): title + one-line subtitle, "Record a complaint" (the one filled button, only with the record key), view chips Open · Overdue · Closed · All with counts (Overdue chip in orange, the one "needs you" colour, P-473 (4)); counts are counted in the browser from one `GET /?view=all` page (`status`, `overdue`), "100+" when `next` is set. Table: Received (link) · From (`complainantName` + kind) · About · How it came · Handler · Acknowledge by (date + business days left, or "N business days late" in orange with "!", from `businessDaysLeft`) · Status (shape + word). View in the URL (`?view=overdue`), cursor paging ("Show more", 100 a page).
* **Record page: Workspace pattern**: where-line Back to Complaints; header (subject + status + handler); a next-step bar with the one filled button by status (not acknowledged → Record the acknowledgement; no step → Add a handling step; steps, no response → Record the response sent; response sent → Close with an outcome; closed → none, Add a note only). Every other act the service still allows while open is a quiet secondary action (Add a handling step, Add a note, Record the response sent until sent, Close with an outcome), each one drawer. Change handler as a link only with both keys and while open. Action buttons follow the §3 table; otherwise the read-only line. Left: Facts (Sample marks on How it came, About, the period); dates and times in the firm's zone (`firmTimeZone`), labelled once. Right/below: "What happened", newest first, every event with time, who, words (the event's own dates, no second business-day count).
* **Drawers: Side panel pattern** (520 px, pinned header/footer, Cancel left, primary right): Record a complaint (always asks for the complainant's name; the two linked kinds appear only when their id arrives in the address, otherwise "Someone else" alone with one line that linked complaints are recorded from the person's own page; handler from `GET /handlers`, defaults to you); each action (date defaults to now + note; Close adds the outcome radio and a required note; Change handler the staff picker). A step or note left at its default date sends no date (the service fills it); the other three send the default cut to the minute.
* States drawn: empty (two wordings), loading (skeleton), overdue, closed, not found, refused, 404 on an action, read-only with its reason, long content (a 4,000-character summary and note, a 200-character name: wrap in the header and record, cut with the full text on hover in the table), field errors. 375 px: the table scrolls inside its box, never the page; the facts drop above the timeline.
* Routes: `/platform/complaints` and `/platform/complaints/:id` inside PF-6 part 1's frame.

## 4b. Best in class (brief; from product knowledge, not re-read today: **Unverified**)
Service-desk tools (Zendesk, Freshdesk, Jira Service Management): saved views with live counts, an SLA badge "due in / breached", assignee column, an append-only timeline with internal notes. Copied: views with counts, one due badge, timeline. Beaten: one filled next-step button named for the act (they show a status dropdown), dates checked in order where typed, no delete at all. Saves effort: date defaults to now, handler defaults to you, kind chosen once, nothing typed twice. Nothing in the design depends on these lines.

## 4c. Scorecard
N/A as a whole: a firm-level register (P-584 (8)), not a case-side screen (§6 scope). Met in spirit: BIC-11 (one filled button named for the act), BIC-13 (errors on the field + summary), BIC-14 (tooltips on the Overdue chip and the date), BIC-18 (states), BIC-19 (orange only for needs you), BIC-20 (keyboard, 4.5:1, 375/1024/1440).

## 5. Copy
* Subtitle: "Every complaint made to the firm, how it was handled and how it ended." Handler without read: "Complaints you handle."
* Empty: "No open complaints. When someone complains to the firm, record it here: the handler is reminded to acknowledge it." / "No open complaints that you handle." / Closed: "No closed complaints yet." (No Record button in the empty state without the record key.)
* Overdue: "Needs you: this complaint was due to be acknowledged by {date} ({n} business days late)." Chip tooltip: "Open and not acknowledged by its date. Once acknowledged, a complaint is not shown as overdue."
* Closed: "Closed on {date} · outcome: {outcome}. A closed complaint is kept as it is; add a note if something more happens."
* Not found: "We can't find this complaint. It may not exist, or it may not be one you can see." + Back to Complaints.
* Read-only: "You can see this complaint but not change it: only its handler, an Owner or an Admin can."
* 404 on an action (access lost while working, e.g. the handler changed): the not-found words, nothing of the record kept on screen, back to the list.
* Refused: 409 closed → "This complaint is closed. It was closed while you were working; add it as a note instead." 409 already acknowledged/responded → the service title. 403 → "You can't change this complaint. Ask an Owner or Admin." Field errors (422 `fields`) shown on each field with a summary; what was typed is kept.
* Drawer without a linked id: "Complaints from a front-office contact or a person on a case are recorded from that person's page."
* After recording for someone else (Case Manager, not handler): toast "Complaint recorded. {Handler} handles it." and stay on the list (the record would 404 for them). `reminderScheduled: false` → toast alert "Recorded. The reminder could not be set; it still shows as overdue when its date passes."
* Labels: Email · Phone · In person · Letter · Web form · Other; Service · Fees · Communication · Conduct · Privacy · Other; Resolved · Upheld · Not upheld · Withdrawn · Referred to the College. Each list marked "Sample" quietly, once per field; "How it works" panel carries "Unconfirmed: no counsel" and BR-8's plain-Open line.

## 6. Contract and tests
Only PF-21's routes (PF-21w and PF-21v): PF-21w `POST /` · `GET /?view&cursor&limit` · `GET /:id` · `POST /:id/acknowledge|steps|response-sent|close` · `POST /:id/handler`; PF-21v (runtime, API only, under 800 lines) adds to the views and one route; plus `GET /api/platform/me` (`staffId`, `displayName`, `keys`) to decide what to show. PF-21w itself is unchanged (#1823).
* **G1 Counts:** counted in the browser from one `GET /?view=all` page; "100+" when `next` is set. A server `counts` field becomes a row only once a firm passes 100.
* **G2 `businessDaysLeft`** (PF-21v) on each view, negative when late, from one pure function beside `acknowledgeBy` in `business-days.ts`; the firm calendar read once per request; a pass and a fail case in PF-21's suite. Never computed in the browser.
* **G3 `people`** (PF-21v): id → display name (including deactivated people) on the list and on `GET /:id`.
* **G4 `GET /api/platform/complaints/handlers`** (PF-21v): active staff, id and display name only, record key, declared with `@PermissionKeys`, owned by complaints.
* **m1 `firmTimeZone`** (PF-21v) on the list response and on `GET /:id`; the screen shows the firm's zone, labelled once (acknowledge-by is a date in the firm's zone).
* **G5 closed:** there is no 30-business-day clock; the PF-21s brief and J-109's walk now read "its acknowledge-by date (2 business days, Sample)". A response-by period becomes its own row only after the College's by-laws are read and cited with page, quote and date (AGENTS rule 4).
* **Who made it:** the proof records "Someone else"; journeys seed the front-office and case-party kinds through the API. A free picker is *Not built*.

**qa journeys** (`tests/check_pf21s_complaints_browser.ts`, `PF-21s DWn`, seeded through the API on the local stand-in):
* DW1 Owner sees all four views with counts equal to the rows under each view (pass); a closed complaint absent from Open (fail case).
* DW2 a Case Manager handler sees only their own; another's id opens Not found.
* DW3 next-step button walks Record the acknowledgement → Add a handling step → Record the response sent → Close with an outcome; then only Add a note; a response dated before the acknowledgement shows the field error; a complaint closed straight after receipt as Withdrawn (secondary action, no acknowledgement or step).
* DW4 Change handler hidden for a Case Manager on their own complaint; shown for Owner, picker from `GET /handlers` lists active staff only; a forced `POST /:id/handler` as Case Manager is refused; the old handler's open drawer then saves to the not-found words and goes back to the list.
* DW5 another firm's complaint id shows Not found with the same words as a nonexistent id and someone else's.
* DW6 overdue row shows the orange "!" status and "N business days late"; acknowledged row does not.
* Keyboard-only through record → close; axe-core on every state; 375/1024/1440 with no sideways page scroll.

## 6b. Capability or scaffolding
List, record page, drawers, next step, not-found: capability, *Needed for the proof* (J-109). Subject picker for front office / case party: *Not built* (linked complaints are recorded from those pages once they exist). Platform menu entry: a one-line follow-up adds Complaints to PF-6's platform frame menu. Demo seeding: scaffolding, test only.

## 6c. Stage 2 split (P-610, < 800 lines each), build files in `web/src/modules/platform/complaints/`
* Part 1: `routes.tsx`, list, record drawer, read-only record page (facts + timeline + not-found + read-only state) — DW1, DW2, DW5, DW6. Needs PF-21w, PF-21v and PF-6 part 1. The session holder is PF-6's, not counted here.
* Part 2: action drawers, next-step bar and secondary actions, change handler, 404 on an action — DW3, DW4.
* If part 1 would still pass 800 lines, the read-only record page moves to part 2 with DW5's page half (the list half of DW2 and DW5 stays in part 1).

## PF-6
PF-21s waits on **PF-6 part 1 only**: the platform frame and staff session holder in `web/src/modules/platform/` (keeps the token, adds a fetch helper, handles 401 with "Signed in elsewhere", puts the staff member's name from `GET /api/platform/me` in the header). Lead B writes PF-6's brief with it as part 1, the first thing PF-6 builds after PF-4b (#1816). No session holder inside complaints: it would be a second identity client that PF-6 replaces.

## 7. Questions
Founder: none (the "30" was a slip in the records, not a decision; G5 closed). For Lead B: all settled (Approval).

## Definition of ready
* Acceptance test: `tests/check_pf21s_complaints_browser.ts`, DW1–DW6 + keyboard, axe-core, 375/1024/1440.
* Row text: PF-21s as in BACKLOG, with "waits on: PF-21w, PF-21v, PF-6 part 1" replacing "PF-21, PF-6".
* Decisions answered: B1, M1–M5, m1–m8 by Lead B (rev 16.28); challenge passed; Lead B approval (below). Records on `lead-b-front-office` (rev 16.28): the PF-21v row, the corrected PF-21s brief and J-109 text, the PF-6 part 1 split.
* Stage 2 starts when PF-21w, PF-21v and PF-6 part 1 are on main.

## Challenge outcome
Fresh challenge, 15 Nov 2026: Build after these changes. 1 Blocker, 5 Major, 8 Minor, all accepted by Lead B and applied above (`challenge.md`, Lead response).

## Approval
Approved by Lead B (6), row owner, on PR #1821, rev 16.28: approved for stage 2 once these changes are in; no second challenge round. Stage 2 waits on PF-21w, PF-21v and PF-6 part 1.
