# AUD-4s — the firm's Activity log page: concept draft (part 1, records only; R1.88, map row 88)

Drafter: night-queue builder lane, 16 Nov 2026 (draft, not approved). No board (P-223 (4)): layout in `design/draft-1.html`; an independent challenger writes `challenge.md`; Build Lead C approves and writes `concept.md`. Brief: `design/briefs/AUD-4s.md` part 1; routes from `design/briefs/AUD-4.md` and `AUD-1c.md` part 2 (neither on `main` yet: shapes below are the briefs', to re-check at part 2).

## 1. Job and journey
* **Job:** the firm's Owner or Admin sees who changed what in the firm, read-only, and proves it with an export (AG-16 §3.6: "The firm reviews its own log read-only (config changes, exports, connection changes, escalation and AI changes)").
* **Stories (AG-16 personas, `:467-468`):** Owner: "see in the activity log who changed what"; Admin: "when a rep leaves, I want to see in the activity log what they changed". Plus SA-2-29: every support session in the Owner's history (support person, start and end, duration, reason or ticket, changes made).
* **Persona and key:** holders of `agent/audit:read` (Owner and Admin by default; AG-16-26, SA-6-33). Everyone else sees no menu item and a plain no-access page.
* **Journey:** Settings › Security & your data › Activity log → last 7 days, newest first → narrow by person or area (or press "ExpatReady staff access") → open a line for the change in words, raw before and after under Advanced → Export CSV (confirm) → the export itself is a new line.

## 2. Ten layers
* **Data:** `audit_event` (AUD-1a: `firm_id`, `actor_type`, `support_session_id`), read only through AUD-4's `firmLog` (firm from the session). Integrity from AUD-1c's chain state. Keep period: AUD-5's keep-periods read, else one written sentence. Nothing new.
* **API:** AUD-4 `GET /api/platform/audit`, `GET /api/platform/audit/export`; AUD-1c `GET /api/platform/audit/integrity`. No new route.
* **UI (new):** `web/src/modules/platform/audit/` in PF-6's frame; one line in PF-6's `routes.tsx`; the "Security & your data" index page and menu item if this ships before PF-11s (Lead 61's ruling, comment 6900882697 on #1875).
* **Team's code:** the built read API (`audit-read.controller.ts:90,100`, AG-16-26) has no screen; team list patterns (`FilterLayout`, `EmptyState`, `NoAccessState`, `ConfirmActionDialog`) are reused by name.
* **Rules, engine, AI, governance:** no AI on this page; no write except the export's own line (AUD-4's service writes it).

## 3. Business rules (the server enforces; the page shows)
* **BR-1 firm-wide, own firm only.** Every line of the session's firm, never another firm's, never a `platform` line (AG-16-26, SA-6-33; AUD-4 DW2, DW3). Pass: Owner sees Admin's lines. Fail: firm B's line ids in the address show nothing of B.
* **BR-2 read-only.** No edit, delete or hide control anywhere (AG-16 §3.6 "read-only"; SA-11-14 "nothing in the product deletes an audit entry").
* **BR-3 date range required, at most one year, default the last 7 days** (Sample limit, AUD-4). Stopped in the form with the limit named; the API's 400 shown if forced.
* **BR-4 "ExpatReady staff access"** shows only our staff's lines (actor type ExpatReady staff, or inside a support session) (SA-11-34's shortcut, applied to the firm's page; SA-2-29).
* **BR-5 the change in words** as "field: old → new", the raw before and after under Advanced (SA-11-30). A line with no pair shows its summary only; an action no module named shows its code under Advanced (AUD-4 DW7), never a blank.
* **BR-6 export is logged and confirmed.** Confirm "This export is recorded in the activity log" once per export; the file has the filtered lines, personal data in full (AG-13-43: "no masked or unmasked variant"); the new line appears at the top afterwards. Over 100,000 lines → "Narrow the dates" (Sample limit, AUD-4).
* **BR-7 integrity shown plainly.** "Records intact — last checked N min ago"; red with plain words and the affected range on a failure; "Not checked yet" before the first check; detail on click (SA-11-34). The firm's own chain only (AUD-1c DW7).
* **BR-8 keep period stated:** "Your activity log is kept for 7 years for security." (SA-11-14, AG-16-66), from AUD-5's read when on `main`, else written once with its source.
* **BR-9 people keep their names.** A deactivated person's lines keep their name (SA-11-14); our staff show "ExpatReady support" (in a session: the session's name; AUD-4's gap); jobs show "The system".
* **BR-10 no skip, no repeat.** "Show more" by the cursor; equal times never repeat a line (AG-13-31; AUD-4 DW5). No page numbers.
* **BR-11 times in the firm's time zone** (`platform.time_zone`), named once in the summary sentence.

## 4. Layout (`design/draft-1.html`, boards 1-6)
Pattern: **Library list** (`EXPERIENCE.md` §3) without a side panel: a line opens in place (the row expands), because a line has four facts and a raw block, and a drawer would hide the list a person is scanning. Page card in PF-6's frame; trail Settings › Security & your data › Activity log; title, one muted subtitle; on the right the integrity pill and Export CSV (the only action). Filters: From, To, Person, Area, the "ExpatReady staff access" toggle; Advanced: action, record type, record reference, done by. Under the filters, **one sentence that reads the filters back** ("Showing everyone's changes in all areas from 9 Nov to 16 Nov 2026 (Toronto time)") so a filter that hides lines is never silent. Table: When · Who · Area · What happened (summary, then the change chip), 44 px rows, long text one line with the full text in the open row. "Show more" under the table; the keep sentence under it. Filter state in the URL (team rule). At 1024 px the four columns fit with no sideways scroll; Advanced wraps below.

**States (board 6):** loading (skeleton + `role=status`); nothing in range (names the dates, "Clear filters"); no lines yet (first-use wording); range over one year (on the field); no access (403: "You do not have access to the activity log", who to ask); export too large; load error with Retry; session ended elsewhere (401 → "Signed in elsewhere"); integrity broken; integrity not checked yet.

## 4b. Best in class (P-392)
Read 16 Nov 2026. Only GitHub's page was read verbatim. From this cloud copy the other vendors' help hosts did not load (proxy 403), so their lines are **Unverified** (from search summaries) and must be re-read on the Mac before the label (P-392).
| Product (source) | Does best | This page copies or beats |
|---|---|---|
| **GitHub organization audit log** (docs.github.com …/reviewing-the-audit-log-for-your-organization, from the `github/docs` source on `main`, read 16 Nov 2026; quotes verbatim) | One filter set (actor, action, verb class, date range) that **also drives the export**: "search by one or more of these supported qualifiers before using the Export dropdown". It states its limit: "events … within the last 180 days". Its weak points: "you cannot search for entries using text", actions are machine names (`team.create`), and there are no before → after values. | **Copies:** the export follows the filters; the keep period is stated in one line; owners only. **Beats:** plain filters read back as a sentence instead of typed qualifiers; plain action words, with the code only under Advanced; "field: old → new" on every line that has a pair; 7 years instead of 180 days. |
| **Clio Manage** (help.clio.com, "Does Clio have an audit trail?"; **Unverified**) | A per-record history beside the matter (Matter Timeline), the view a law-firm Owner expects. The leads say the specific edits are not shown without asking Support. | **Beats:** the change itself in words on the line ("role: Case Officer → Admin"), with no support ticket. The Advanced "Record" filter gives that record's whole history. |
| **1Password Business activity log** (support.1password.com/activity-log; **Unverified**) | Seeing the log is a grantable permission, not only the Owner's, and each event has a detail view (session, location). | **Copies:** the key `agent/audit:read` (Owner and Admin by default, grantable), and one line opening in place to its detail. |
| **Atlassian organization audit log** (support.atlassian.com, "View audit log activities" / "Export audit logs"; **Unverified**) | A 7-day default view and an honest export: a capped row count that follows the filters. | **Copies:** the 7-day default and the stated cap ("one export holds at most 100,000", Sample). **Beats:** the export is itself recorded and the confirm says so (AG-13-43). |

**Where it saves the Owner effort or prevents a wrong reading:**
* The read-back sentence means a forgotten filter never hides lines silently.
* "ExpatReady staff access" is one click to answer "did your support people touch our data?" (SA-2-29).
* The integrity pill says plainly whether the record can be trusted. None of the four products was confirmed to show this, so we make no tamper-proof claim, only "Records intact — last checked".
* The export confirm prevents a surprise line in the log.

## 4c. Scorecard
Firm-settings screen, not a case screen: `EXPERIENCE.md` §6 (BIC-01–20) is for case screens (P-407 scope), so N/A; the §1–§5 rules apply and are checked in §3–§5.

## 5. Copy
* Title "Activity log"; subtitle "Who changed what in your firm. Read-only."
* Shortcut button "ExpatReady staff access"; tooltip: "Show only changes made by ExpatReady staff, including support sessions."
* Integrity: "Records intact — last checked 12 min ago" · "Records could not be confirmed intact" + "A check on <date> found a change in the lines from <from> to <to>. ExpatReady has been told and is looking into it. Nothing you do here changes the log." · "Not checked yet" + "The first check runs within 30 minutes of the first line."
* Range error: "Pick dates at most one year apart (this range is <n>)."
* Empty: "No changes from <from> to <to>" + "Nothing matches these dates and filters. Try a wider date range or clear the filters." First use: "No activity yet" + "When your team changes settings, roles or connections, each change is listed here."
* No access: "You do not have access to the activity log" + "Ask your firm's Owner or an Admin."
* Export confirm: "Export <n> lines as CSV?" + "This export is recorded in the activity log." Buttons "Cancel" / "Export CSV". Too large: "This export is too large" + "<n> lines match; one export holds at most 100,000. Narrow the dates and export again."
* Keep: "Your activity log is kept for 7 years for security." No word on the page promises a legal duty: "for security" is the product's wording (SA-11-14); no "compliant", "legally required" or "tamper-proof".

## 6. Contract and tests
* **Read** `GET /api/platform/audit?from&to&person&area&staffAccess&action&entity&entityKey&actorType&cursor` → `{ lines: [{ id, at, who: { kind: STAFF|OUR_STAFF|SYSTEM, name, sessionId? }, area, action: { code, label|null }, summary, change: [{ field, from, to }] | null, detail (raw) }], next: cursor|null }`; 400 (range), 401, 403 `MISSING_PERMISSION` (AUD-4 brief; re-check field names at part 2).
* **Export** `GET /api/platform/audit/export?<same filters>` → CSV; 413 "Narrow the dates"; the line is committed before the data (P-607 (3)). Row count for the confirm: the page shows "<n> lines" only if AUD-4 offers a count; otherwise "Export these lines as CSV?" (question 1).
* **Integrity** `GET /api/platform/audit/integrity` → `{ state: INTACT|BROKEN|NOT_CHECKED, lastCheckedAt, range? }` (AUD-1c part 2).
* **Acceptance walk** (replayable steps for `tests/check_aud4s_activity_log_browser.ts`, keyboard only, axe-core clean, 1024 and 1440 with no sideways scroll):
  1. Sign in as the Owner of firm A; Tab to Settings › Security & your data › Activity log; Enter.
  2. See the heading "Activity log", the From and To fields at today − 7 days and today, and the sentence reading the filters back.
  3. Tab to "ExpatReady staff access"; Space; the list shows only "ExpatReady support" lines (the seeded support session's start, change, end) and no firm staff line; aria-pressed is true.
  4. Tab to a line's "Details"; Enter; see "field: old → new"; open "Advanced: raw before and after"; see the raw detail.
  5. Tab to "Export CSV"; Enter; the confirm shows "This export is recorded in the activity log"; Escape → nothing downloads, no new line; again, Enter on "Export CSV" → one file; the list's top line is now "Exported the activity log".
  6. Set From to 2 years ago → the field error names the limit; the list is unchanged.
* **Named cases** (each a pass and a fail; part 2): W1 (the walk above), DW1 (Case Officer: no menu item; the address shows the no-access page, never blank), DW2 (empty range names dates; over a year stopped, the API's 400 shown if forced), DW3 (export: one confirm, one file, one new line; cancel → nothing), DW4 (integrity green, red after a forced break, "Not checked yet" before a check), DW5 ("Show more" over 120 lines with equal times: each line once).

## 6b. Capability or scaffolding
Every element is capability (the firm's own data, the real routes); no demo chrome, no simulated-person switch (brief). Part 2 waits on AUD-4, AUD-1c part 2, PF-6 part 1.

## 7. Questions (for Build Lead C; none for the founder)
1. **Export count in the confirm.** AUD-4's routes give no count before the export. Recommendation: the confirm says "Export these lines as CSV?" (no number) unless AUD-4 adds `count` to the read; do not add a count route here.
2. **Where support sessions are listed.** Recommendation: here, through "ExpatReady staff access" (session start, each change, end with duration and changes made; SA-2-29), until AUD-3b's session screen exists; the start/end lines come from AUD-3b's session records.
3. **Time zone shown.** Recommendation: the firm's time zone named once in the read-back sentence, not on each row.

## Definition of ready (part 2)
Acceptance test `tests/check_aud4s_activity_log_browser.ts` (W1, DW1-DW5). Row text: AUD-4s as in BACKLOG with this concept. Decisions: P-223 (4) approval by Build Lead C after `challenge.md`; P-392 (§4b checked). Waits on AUD-4, AUD-1c part 2, PF-6 part 1.
