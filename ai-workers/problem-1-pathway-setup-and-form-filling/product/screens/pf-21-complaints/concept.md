# PF-21s — Complaints list and record page: concept (stage 1, draft for Lead B)

Row PF-21s (BACKLOG). Source: P-579 (complaints record: "each complaint, its handling, outcome, dates"), P-584 (8) (complaints record: platform, a firm-level register). Code SOR/2022-128 s. 24(3)(r), s. 29, s. 37 as cited in PF-21's service header; legal reading **Unconfirmed: no counsel**; every list and period **Sample** until the College's by-laws are read. No board (P-223 (4)): layout in `design/layout.html` (list, record page, record drawer, states). Lead B approves after an independent challenge.

## 1. Job and journey
* **Job:** keep the firm's complaints record: record each complaint when it arrives, see what needs acknowledging, walk it to a close with an outcome, never lose an event.
* **Personas (keys from the PF-21 migration):** Owner and Admin hold `agent/complaint:record` + `agent/complaint:read`: see every complaint, act on any, change handler. Case Manager holds record only: records, sees and handles only complaints they handle. Any staff member named handler: sees and handles their own (no key needed).
* **Journey:** Record a complaint (drawer) → the handler sees it in Open → Record the acknowledgement → Add handling steps → Record the response sent → Close with an outcome. Overdue = open, not acknowledged, past its acknowledge-by date (service `isOverdue`).
* Activity / SA-01B ids: not known (P-579: "map §0 C No card found").

## 2. Ten layers
| Layer | In the app (main) | Team's code | New here |
|---|---|---|---|
| Masters, links | `plat_complaint`, `plat_complaint_event` (insert-only, database-guarded); enums subject kind, channel, category, outcome, event kind | none found | none |
| Rules, engine | `ComplaintsService` (who sees what, order of dates, closed changes by note only, never deleted); `acknowledgeBy` = 2 business days (Sample) in the firm's calendar | none | none |
| Contract | PF-21w routes (prefix `api/platform/complaints`, in flight); `GET /api/platform/me` gives `keys` | none | gaps G1–G5 (§6) |
| Screen | nothing; `Frame` component; no Settings or platform menu in the frame | none | `web/src/modules/platform/complaints/` |

## 3. Business rules (the screen shows them; the server enforces them)
* BR-1 Read: the read key sees all; otherwise only complaints you handle (service `canRead`, `list` `mine`).
* BR-2 Act (acknowledge, step, response, close): the handler, or someone with both keys (`canAct`).
* BR-3 Change handler: both keys only, open only, an active staff member, not the same person (`changeHandler`).
* BR-4 Not found: another firm's complaint, someone else's, or a bad id all give the same 404 and the same words (`notFound`).
* BR-5 Order: acknowledge once, after received, no later than the response; response once, after the acknowledgement; close once, after all three; no date in the future.
* BR-6 Closed: only a note may be added (409 `complaint-closed` otherwise); the record keeps its facts.
* BR-7 Never deleted: no delete control; `DELETE` is refused for everyone (405 `complaint-kept`).
* BR-8 Overdue: open and not acknowledged after `acknowledgeBy` (2 business days, Sample, `business-days.ts`). Once acknowledged there is no further date in the service.
* BR-9 Who made it: Someone else needs a name and no linked id; front office or case party needs the other module's id (`RecordComplaint`).

## 4. Layout (`design/layout.html`)
* **List: Library list pattern** (EXPERIENCE §3): title + one-line subtitle, "Record a complaint" (the one filled button), view chips Open · Overdue · Closed · All with counts (Overdue chip in orange, the one "needs you" colour, P-473 (4)), table: Received (link) · From (name + kind: front-office contact / person on a case / someone else) · About · How it came · Handler · Acknowledge by (date + business days left, or "N business days late" in orange with "!") · Status (shape + word). View in the URL (`?view=overdue`), cursor paging ("Show more", 100 a page).
* **Record page: Workspace pattern**: where-line Back to Complaints; header (subject + status + handler); a next-step bar with the one filled button by status (not acknowledged → Record the acknowledgement; no step → Add a handling step; steps, no response → Record the response sent; response sent → Close with an outcome; closed → none, Add a note only); secondary Add a step / Add a note; Change handler as a link only with both keys and while open. Left: Facts (Sample marks on How it came, About, the period). Right/below: "What happened", newest first, every event with time, who, words.
* **Drawers: Side panel pattern** (520 px, pinned header/footer, Cancel left, primary right): Record a complaint; each action (date defaults to now + note; Close adds the outcome radio and a required note; Change handler the staff picker).
* States drawn: empty (two wordings), loading (skeleton), overdue, closed, not found, refused, field errors. 375 px: the table scrolls inside its box, never the page; the facts drop above the timeline.
* Frame: `Frame area="cases"` at `/platform/complaints` and `/platform/complaints/:id`; crumbs via `useWhere` (Cases › Complaints › …).

## 4b. Best in class (brief; from product knowledge, not re-read today)
Service-desk tools (Zendesk, Freshdesk, Jira Service Management): saved views with live counts, an SLA badge "due in / breached", assignee column, an append-only timeline with internal notes. Copied: views with counts, one due badge, timeline. Beaten: one filled next-step button named for the act (they show a status dropdown), dates checked in order where typed, no delete at all. Saves effort: date defaults to now, handler defaults to you, kind chosen once, nothing typed twice.

## 4c. Scorecard
N/A as a whole: a firm-level register (P-584 (8)), not a case-side screen (§6 scope). Met in spirit: BIC-11 (one filled button named for the act), BIC-13 (errors on the field + summary), BIC-14 (tooltips on the Overdue chip and the date), BIC-18 (states), BIC-19 (orange only for needs you), BIC-20 (keyboard, 4.5:1, 375/1024/1440).

## 5. Copy
* Subtitle: "Every complaint made to the firm, how it was handled and how it ended." Handler without read: "Complaints you handle."
* Empty: "No open complaints. When someone complains to the firm, record it here: the handler is reminded to acknowledge it." / "No open complaints that you handle." / Closed: "No closed complaints yet."
* Overdue: "Needs you: this complaint was due to be acknowledged by {date} ({n} business days late)."
* Closed: "Closed on {date} · outcome: {outcome}. A closed complaint is kept as it is; add a note if something more happens."
* Not found: "We can't find this complaint. It may not exist, or it may not be one you can see." + Back to Complaints.
* Refused: 409 closed → "This complaint is closed. It was closed while you were working; add it as a note instead." 409 already acknowledged/responded → the service title. 403 → "You can't change this complaint. Ask an Owner or Admin." Field errors (422 `fields`) shown on each field with a summary; what was typed is kept.
* After recording for someone else (Case Manager, not handler): toast "Complaint recorded. {Handler} handles it." and stay on the list (the record would 404 for them). `reminderScheduled: false` → toast alert "Recorded. The reminder could not be set; it still shows as overdue when its date passes."
* Labels: Email · Phone · In person · Letter · Web form · Other; Service · Fees · Communication · Conduct · Privacy · Other; Resolved · Upheld · Not upheld · Withdrawn · Referred to the College. Each list marked "Sample" quietly, once per field; "How it works" panel carries "Unconfirmed: no counsel".

## 6. Contract and tests
Only PF-21w's routes: `POST /` · `GET /?view&cursor&limit` · `GET /:id` · `POST /:id/acknowledge|steps|response-sent|close` · `POST /:id/handler`; plus existing `GET /api/platform/me` (`keys`, `staffId`) to decide what to show. **Gaps (decide before part 1; not invented):**
* **G1 Counts per view** — `GET /` returns `{items, next}`. Rec: PF-21w adds `counts: {open, overdue, closed, all}` (scoped like the list) to the list response.
* **G2 Business days left / late** — the view gives `acknowledgeBy` and `overdue`; the web cannot read the firm calendar (no settings route) and must not copy `business-days.ts` (STANDARDS §7). Rec: add `businessDaysLeft` (negative = late) to each view.
* **G3 Names** — views carry `handlerStaffId` and events `actor: "staff:<id>"`, no names. Rec: list and `GET /:id` return a `people: {id: displayName}` map.
* **G4 Handler picker** — no staff list route on main (only `GET staff/invitations`, `agent/staff:manage`). Rec: PF-21w adds `GET /handlers` (active staff id + name; record key), owned by complaints; to replace with PF-6's team list later.
* **G5 30-business-day clock** — J-109 says "its 30-business-day clock"; the service has only a 2-business-day (Sample) acknowledge-by date and no response-by date. The screen shows what the service has. Lead B to settle (response-by date in PF-21, or J-109 text corrected).
* **Subject picker:** front office / case party needs another module's id; no picker route here. Part 1 offers all three kinds; front office and case party ids arrive prefilled from those modules' pages (`?subjectKind=&subjectId=`); a free picker is *Not built*.

**qa journeys** (`tests/check_pf21s_complaints_browser.ts`, `PF-21s DWn`, seeded through the API on the local stand-in):
* DW1 Owner sees all four views with counts equal to the rows under each view (pass); a closed complaint absent from Open (fail case).
* DW2 a Case Manager handler sees only their own; another's id opens Not found.
* DW3 next-step button walks Record the acknowledgement → Add a handling step → Record the response sent → Close with an outcome; then only Add a note; a response dated before the acknowledgement shows the field error.
* DW4 Change handler hidden for a Case Manager on their own complaint; shown for Owner; a forced `POST /:id/handler` as Case Manager is refused.
* DW5 another firm's complaint id shows Not found with the same words as a nonexistent id and someone else's.
* DW6 overdue row shows the orange "!" status and "N business days late"; acknowledged row does not.
* Keyboard-only through record → close; axe-core on every state; 375/1024/1440 with no sideways page scroll.

## 6b. Capability or scaffolding
List, record page, drawers, next step, not-found: capability, *Needed for the proof* (J-109). Subject picker for front office / case party, platform menu entry: *Not built* (entry by address and a link from the cases area line until a platform frame exists). Demo seeding: scaffolding, test only.

## 6c. Stage 2 split (P-610, < 800 lines each), build files in `web/src/modules/platform/complaints/`
* Part 1: `routes.tsx`, list, record drawer, read-only record page (facts + timeline + not-found) — DW1, DW2, DW5, DW6. Needs G1–G3 and G4 (drawer's handler).
* Part 2: action drawers, next-step bar, change handler — DW3, DW4.

## PF-6
PF-21s needs nothing PF-6 builds: `Frame` exists on main and has no Settings entry for PF-6 to add; PF-6 is screens and does not bring a staff list route either. The handler picker needs G4 whatever PF-6 does. **Recommend Lead B drops the PF-6 wait**; a one-line follow-up adds Complaints to PF-6's platform frame menu when that lands.

## 7. Questions
Founder: none. For Lead B (not founder): G1–G5 above, recommendation given for each.

## Definition of ready
* Acceptance test: `tests/check_pf21s_complaints_browser.ts`, DW1–DW6 + keyboard, axe-core, 375/1024/1440.
* Row text: PF-21s as in BACKLOG, with "waits on: PF-21w (incl. G1–G4)" replacing "PF-6".
* Decisions answered: G1–G5 by Lead B; challenge passed; Lead B approval.

## Challenge outcome
_(empty)_

## Lead B approval
_(empty)_
