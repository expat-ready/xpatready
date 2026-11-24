# PF-21rs — our console's Privacy pages: breaches, requests to us, legal holds (concept r1, 24 Nov)

Row: `BACKLOG.md` PF-21rs (screens, our console) · capabilities R1.86 (Partial: j_86 21/28, 6 steps PF-21rs, QA-757) and R1.85 (Partial: j_85 15/19, PF-21rs among its missing parts) · Requirements: SA-11-18, -24, -27, -34 (`trace-requirements.py --brief PF-21rs`; read only that text) · Board: `design/board-r1.html` (no canvas board: tech lead's approval after a fresh challenge, P-223 (4)) · Builds inside PF-17 part 4 PR B's console (#3489, open: `web/src/modules/system/frame.tsx`, `routes.tsx`, `session.ts`); build starts only after #3489 merges.

## 1. Job and journey
**Job:** ExpatReady's Platform Owner keeps our own privacy registers in the console: records a breach, decides whether firms are told and notifies each affected firm once; logs requests made to us and works them to an outcome inside 30 days; places and releases legal holds. The Auditor reads the breach register only.
**Personas:** Platform Owner (all three), Auditor (breaches, read only), any firm user (403 everywhere). **Journey:** J-85 (requests, holds) ends where J-86 (breaches) starts; J-86 W10 continues to R1.87.

## 2. Ten layers (what exists, what is new)
| Layer | On main / open | New here |
|---|---|---|
| Data, rules, engine | `plat_breach`, `plat_breach_notice` (PF-21c), `plat_data_request` (PF-21b p3), `plat_legal_hold` (PF-21b p2); all rules server-side | none |
| Contract | `/api/system/register/breaches` (list, one, POST, PATCH, POST :id/notices, from-alert), `/requests` (list, read, POST, POST :id/status), `/holds` (list, POST, POST :id/release) | **runtime prerequisite R0** (§6): notice words (QA-757) and firm names on answers |
| Identity | PF-4s system session; console sign-in card "Work email" + "Sign in" (#3489) | menu entries by key |
| UI | console frame and Firms page (#3489) | 3 lists, 2 detail pages, 5 dialogs (`web/src/modules/system/privacy/*`) |
| AI | none (live AI off; no AI on a legal register) | none |
| Governance | `@SystemReason` / `@SystemChange` audit lines; insert-only events | each change dialog asks the reason the guard records |
Team's code: no breach/request screens in the team's newest capture (SA-11-34 calls theirs a mock console); the built firm-side hold route stays dormant with no firm screen (SA-11-18). Nothing to retrofit.

## 3. Business rules (each enforced by the API; the screen only shows them)
* BR-1 Every breach is recorded, even with little known; firms empty = "Under investigation" (SA-11-24; PF-21c BR-11).
* BR-2 A notice goes only after the record is confirmed (not a draft) and the decision is "Notify firms" with why (PF-21c 409s).
* BR-3 One notice per breach and firm, never twice; a notified firm stays on the breach; the decision is fixed once a notice is sent (409 ALREADY_NOTIFIED, NOTIFIED_FIRM_KEPT, DECISION_KEPT).
* BR-4 Breach records are kept 7 years: no delete anywhere (SA-11-24, -14).
* BR-5 A request's target is received + 30 days, our own reminder; Overdue is set only by the daily check (SA-11-27; PF-21b p3).
* BR-6 Holds: Platform Owner only; "Hold this firm" + reason first, narrower scopes (person, case, category, dates) under Advanced; place and release each need a reason (SA-11-18, -34).
* BR-7 Every change carries the person's written reason; the console never pre-fills a reason (it is the audit's "why").
* BR-8 Each page shows only with its key; without it the API's own 403 words, never an empty table.

## 4. Layout (EXPERIENCE §3: Library list for the three lists; Workspace-lite for a breach and a request; Dialog for every create/change)
* Menu: a "Privacy" group in the console's side menu (Breaches · Requests to us · Legal holds), each link by key; the phone link row carries the same.
* **Breaches** `/system/privacy/breaches`: table Discovered · What happened · Firms · Decision · Notices (n of m sent) · Status (calculated: Draft · Decision owed · Notices owed · Recorded; word + shape). Primary "Record a breach" (Platform Owner only).
* **A breach** `/system/privacy/breaches/:id`: header with calculated status and the one next action; cards What happened · Decision · Notices to firms (one row per affected firm: Sent time, recipients count, subject, "Words sent" disclosure; or "Send notice to <firm>") · History (events). "Send to every firm not yet notified" is **not built** (one firm per confirmation keeps W4's "no second send" obvious; revisit at 10+ firms).
* **Requests to us** `/system/privacy/requests` (+ `/:id`): status chips, table Received · Requester · Type · Target date (with "n days late/in n days") · Status; request page with its steps and one next action; "Hold this person" when the request names a firm and person (fills the hold dialog: no id typed).
* **Legal holds** `/system/privacy/holds`: Active/Released/All chips; table Firm · Covers · Reason · Placed · Release; "Hold a firm's data" dialog, Advanced for narrower scope.
* States: empty (teaches the first action), loading (`data-loading`), error with Retry, read-only (Auditor), field errors under fields (422 `fields`), conflict (409 words on the row + reload), long names wrap. Widths 1024 and 1440 (row W6) plus 400 (j_86 W9) and 375 (UXL-10): tables scroll inside their box.
* 4b Best in class: Stripe/Linear-style incident logs (record first, enrich later; timeline beside the record), Vanta/Drata breach registers (decision + evidence on one page), OneTrust DSR queues (target date with days-left, overdue first). Effort saved: firms picked from the list, the person filled from the request, sent notices show their words in place (no outbox digging), one next action per status. 4c BIC-01–20: N/A (console, not a case screen: §6 scope); UXL-01–14 answered by the board (one filled button per view; colour never alone; ids chunked `3f2a…c91e`; Release set apart as danger).

## 5. Copy (key lines; the rest on the board)
Empty breaches: "No breach is recorded. Record one the moment a breach of our safeguards is known: whether firms are told is decided after." · Notice confirm: "Its active Owner and Admins get ExpatReady's Security incident notice now. It cannot be withdrawn or sent twice." · Notice info: "The firm decides about its clients. Wording: Sample until counsel's (Unconfirmed: no counsel)." · Empty requests: "No request to ExpatReady is logged. A client's request to their firm is the firm's and is not here." · Empty holds: "No active hold. A hold stops deletion of what it covers until it is released." · Auditor: "Read only: you hold system/breach:read."

## 6. Contract and tests
**R0 — runtime prerequisite, its own small PR first (red test first; `register/breaches/service.ts`, no migration):** (a) QA-757: `GET …/breaches/:id` returns each notice's `subject` and `text` as sent, read from the first recipient's outbox file in that firm's scope and checked against its `rendered_hash` (`words: null, wordsNote` if the file is missing or changed: never re-rendered from today's record, whose description may have changed since); (b) firm names: breach answers carry `firms: [{id, name}]` and each notice `firmName`; hold and request answers carry `firmName` (a join in the existing reads; resolving names in the browser would call `GET /api/system/firms/:id`, which writes an OUR_STAFF read line on each firm's trail per page view, AUD-3). Tests: a notice's words equal the outbox file (pass) and a tampered file gives `words: null` (fail); names present; a firm key still 403.
**Screens use only those routes.** Shapes parsed with zod in `privacy/contract.ts` (no React, as #3489's `contract.ts`).
**`tests/check_pf21rs_browser.ts` (isolated copy, Platform Owner signed in on the card), the row's W1–W6:** W1 log a request → target = received + 30 days → In progress → Completed, each step listed (fail: Completed without "What was done" → field error). W2 a request logged 40 days ago shows Overdue with one alert row underneath (fail: no "Overdue" button exists). W3 place a person hold (from the request page) → **the app's delete check (AUD-5 `KeepPeriods.check`, as j_85 W4) answers HELD** with the hold's reason → release on screen → the same check proceeds (see Q3). W4 open a breach naming firms A and B, decide, send A then B: one notice each with time, subject and words; firm C never listed; no send button left (fail: a second send by API → 409 shown). W5 a firm Owner's token on each page's routes → 403, and the console pages show the 403 words. W6 keyboard only through record → decide → send; axe 0 serious at 1024 and 1440 (and 400, for j_86 W9).
6b. All elements are capability (*Needed for the proof*) except: the sign-in card (scaffolding, #3489's), "Send to every firm" and an alerts page's "Open a draft" (*Not built*).

## 7. Questions for the tech lead (recommendation first)
1. **Split into two PRs (recommended):** PR A Breaches (R1.86: W4, W5–W6 on its pages; the founder's focus), PR B Requests + Holds (R1.85: W1–W3, W5–W6). Three lists, two detail pages, five dialogs, contract and the browser check will not fit one PR under 800 changed lines (P-610). Alternative: one PR over 800 lines, which P-610 forbids.
2. **R0 carries firm names as well as QA-757 (recommended)**, in one runtime PR before PR A; otherwise the pages show firm ids (fails j_86 W6, which reads firm names).
3. **W3 "try to delete that person's record in a firm":** no firm screen or route deletes a person's record on main (the deleter is PF-21d, R1.85's erasure, #3234/#3235 open). Recommended: PF-21rs proves W3 through the app's delete check (as j_85 W4 does) and the on-screen firm-side refusal comes with PF-21d. Also, SA-11-18 gives the firm user only "This data is on hold and can't be deleted." — not our hold's reason (a legal matter of ours); the row's "see HELD with the reason" should read "HELD; the reason shown in our console". Reword W3 accordingly.

Noted, no question: SA-11-34's "SHALL NOT show panels for … client data requests" means clients' requests to firms; the register here is requests to ExpatReady (SA-11-27), so no conflict.

## Definition of ready
Acceptance test: `tests/check_pf21rs_browser.ts` W1–W6 exit 0 twice on an isolated copy; j_86 W1, W6, W9 and j_85's console steps green. Row text as in BACKLOG (W3 reworded per Q3 if agreed). Decisions owed: Q1–Q3 (tech lead), the challenge's Blockers and Majors answered, #3489 merged.
