# CS-C1s: Decision and closing on the case page (concept, part 1)

Row CS-C1s (brief `design/build-lead-c-briefs/CS-C1s.md` on `claude/build-lead-c-647b40` 7763a67c2). Gap G3, bug QA-502, Release 1 row R1.77 (Partial: every API part merged, CS-C1a #1818, CS-C1b #2002; no screen). Requirements: AG-07 v3.12 (`domain/requirements-2026-11-02/…/AG-07-case-core-and-delivery_v3.12_2026-10-28.md`). No board for the founder (P-223 (4)): the layout is `design/board.html` (images `design/board-*.png`); fresh challenge `challenge.md`; the approval is Build Lead C's. Legal points: **Unconfirmed: no counsel**. Outcome words: **Sample** (§5).

## 1. Job and journey
* **Job:** a staff member with the key records IRCC's decision on each submitted filing (and corrects one), withdraws a case before any decision, closes a decided case with a reason, and reopens a closed case with a reason; the case header then says how and when the case ended.
* **Persona:** firm staff signed in through PF-4's local sign-in. Keys from PF-3's seed (`migrations/20261114015002_pf3_platform_tables`, lines 586-598): `agent/case:record-decision` = Owner, Admin, Case manager; `agent/case:reopen` = Owner, Case manager; `agent/case:show` = every staff role. Sample firm: the Representative (Owner + Case manager) holds all three; the Case officer (Case officer role) holds only show.
* **Journey (qa's R1.77 walk, by screens):** Record the submission (C8.2) → **Record a decision** per filing → **Close the case** with a reason → header "Closed" → **Reopen** with a reason → open again at the stage it closed from. Second case: **Withdraw the case** with a date and a reason → header "Withdrawn". Activity and SA-01B ids: not known.

## 2. Ten layers
| Layer | In the app (main) | Team's code | New here |
|---|---|---|---|
| Records | `runtime_case` closing fields; `case_decision` rows (DECISION, WITHDRAWAL) | none found for a decision | none (no schema, no migration) |
| Rules | `CaseClose.decide/withdraw/close/reopen` (`api/src/case-close.ts`); body checks in `contracts/runtime.ts:497-547` | none | none: no rule moves into the screen |
| Contract | four POSTs (`features/case-close.ts`), staff bearer only | none | one GET, §6 |
| Screen | nothing calls the four routes; the case read gives `status` only (QA-502) | none | `web/src/runtime/case-decision.tsx`, one mount and one header line in `cases.tsx` |
| Session | `staffApi`, `useMe`, `SignInCard` (`modules/platform/session.ts`, `frame.tsx`) | none | reused as they are |
Audit, outbox, count: already written by CS-C1a/b on every action; the screen adds none.

## 3. Business rules shown (the API decides; the screen shows the API's answer)
* **BR-1** (AG-7-33 r1, BR-10): decision, withdraw and close need `agent/case:record-decision`, never `agent/case:edit`.
* **BR-2** (AG-7-33 r2): a decision only on a filing recorded as submitted (C8.2); else 409 `NOT_SUBMITTED`.
* **BR-3** (AG-7-33 r3, r5, r8): outcome, decision date and an optional note (≤2,000); a second decision on a filing is a correction: a new row, the first kept; withdrawal is not an outcome.
* **BR-4** (AG-7-50 r1, r2, r4, r6): withdraw the whole case before any decision, with a date and a reason (≤1,000); after a decision 409 `HAS_DECISION`.
* **BR-5** (AG-7-34 r2, r4): close only when every active filing has a decision, with a reason; else 409 `NOT_DECIDED`; a closed case takes no decision (409 `CASE_CLOSED`).
* **BR-6** (AG-7-13 r2, r3, r7): reopen needs `agent/case:reopen` and a reason; back at the stage it closed from; closing fields cleared, the audit line keeps them.
* **BR-7** (PF-4, BR-20): another firm's case is 404 with the same words; a missing key is 403.
* **Which buttons show** comes from the read's `can` block (§6), computed on the server by the same checks the POSTs run, plus the person's keys from `GET /platform/me`. The screen holds no copy of a rule.
* **Out of scope, named:** AG-7-33 r6 (next options on a refusal), r7 (class-2 client message box); AG-7-34 r1 (auto-close `COMPLETED`, waits on AG-7-49); AG-7-50 r3 (a filing's own withdrawal, D9 Q54); FIRM_SERVICE reopen by `agent/case:edit` (BUILD-26); the other case panels on a closed case (AG-7-34 r4: they still offer their actions; follow-up row, question 2).

## 4. Layout (`design/board.html`)
* **Pattern:** a case panel (as Submission to IRCC) with **Dialogs** (EXPERIENCE §3: right first time, one step each). Panel "Decision and closing", placed directly under Submission to IRCC; one line in the case header.
* **Panel header:** heading, one-line purpose, and right-aligned "Signed in as {displayName} (firm staff)" with Sign out link to the platform's (staff actions use the staff session, not the "Acting as" person; said once in the tooltip).
* **Body, one row per active filing:** person and form words (from the Submission panel's own read, same query key, so the words agree), Submitted on {date} or "Not submitted yet", the latest decision "Approved (Sample) · decided 16 Nov 2026 · note" and "1 earlier decision" (opens the history list in place). Action per row: **Record a decision…** (submitted, no decision) or **Correct the decision…** (decided; quiet button).
* **Footer next step, one filled button at most (BIC-11):** every filing decided → **Close the case…** (filled); no decision yet → **Withdraw the case…** (quiet, never filled: it is not the expected next step); closed → **Reopen the case…** (filled). None offered → the reason in words (below).
* **Header line (closed only):** Pill "Closed" (or "Withdrawn") replaces the raw `CLOSED`; under the client line: "Closed by staff on 18 Nov 2026 · Decision: Approved (Sample) · Reason: Client moved to another firm." / "Withdrawn on 15 Nov 2026 (recorded 18 Nov) · Reason: Client no longer needs the visa." Long reasons wrap (`overflow-wrap:anywhere`).
* **Dialogs (520 px):** Record a decision: filing named in the title, Outcome (radio Approved / Refused, each marked Sample), Decision date (date input, empty: the authority's date, never defaulted), Note (optional, counter /2,000). Correct: the same, with "This records a new decision. The earlier one stays in the history." Withdraw: date (empty) + reason (counter /1,000). Close: reason. Reopen: reason, and "The case goes back to {stage}." Cancel left, the act's name right; the dialog sends one `idempotencyKey` (decision) however often it is pressed; focus returns to the opener, or to the panel heading when the opener is gone.
* **States drawn:** loading (skeleton); no staff session ("Sign in as firm staff to record decisions." + **Sign in…** opening `SignInCard` in a dialog); signed in without the key (read-only rows + "Your role does not record decisions. An Owner, Admin or Case manager can."); no filing submitted ("Decisions are recorded once a filing is recorded as submitted, above."); some decided; all decided; closed; withdrawn; reopened (toast "Reopened. The case is back at {stage}."); each 409 (the API's own words, in the dialog, nothing changed, the panel reads again); 404; 403 (the key was removed while working: the 403 words, buttons gone after the read); field errors on the field; long note and reason; 375 px (rows stack, buttons full width).

## 4b. Best in class (product knowledge, not re-read today: **Unverified**)
Case-management tools (Clio's matter close, Salesforce case close, Zendesk reopen; `reports/verify-2026-11-03/V4-best-in-class.md`) require a reason on close and keep a reopen trail; few separate "the authority decided" from "we closed". Copied: required reason, audit trail, reopen as an action. Beaten: the decision is per filing and kept with its corrections, the next act is the one filled button, refusals arrive in plain words where you acted, withdraw is offered only while it is allowed. Nothing in the design depends on these lines.

## 4c. Scorecard (BIC, EXPERIENCE §6)
01 the filing words and dates come from the existing reads, nothing typed twice · 02 N/A (no questions) · 03 N/A · 04 Note optional marked "(optional)"; required fields named · 05-07 N/A (no document values) · 08 each filing row names its person, status and decision · 09 N/A · 10 N/A (one panel, no task list) · 11 one filled button per panel, named for the act · 12 N/A (no filing step) · 13 errors on the field and in the dialog's summary, with the API's words · 14 tooltips on Sample, Signed in as, and the earlier-decisions count · 15 N/A · 16 each decision, withdrawal, close and reopen is a recorded event with who and when (audit, already) · 17 N/A · 18 every state in §4 drawn · 19 one heading, one filled button, red only for refusal errors · 20 keyboard-complete, 4.5:1, 1024/1440/375, headings in order (h2 panel, dialogs titled).

## 5. Copy
* Purpose: "Record IRCC's decision on each submitted filing, then close the case. Before any decision, the case can be withdrawn."
* Sample tooltip: "Sample words. The decision words come from the programme's pack; they become final once cited from an official IRCC source." Evidence found today: Guide 5256 (visitor visa, saved 19 Oct 2026, `official-sources/ircc/instructions/guide-5256.html`): "If your application is approved, any original documents … will be returned to you with the requested visa." and "If your application is refused, … with an explanation of why your application was refused." (question 1).
* Close-outcome words (the product's, not IRCC's): Withdrawn, Closed by staff, Completed.
* Empty reason: "Give a reason." (API). Over: "At most 1000 characters." (API). Date: "A real date as YYYY-MM-DD." (API; the date input sends that form).
* No key, reopen: "An Owner or Case manager can reopen this case."

## 6. Contract and tests
* **New read** `GET /api/runtime/cases/:id/decisions`, `@PermissionKeys("agent/case:show")`, in `features/case-close.ts`, `CaseClose.view` (firm-scoped as `locked`, without the lock): `{ case: { id, status, closeOutcome, closedAt, closedReason, withdrawnAt, withdrawnOn, withdrawReason, closedFromStage: { id, label } | null }, filings: [{ id, submitted, submittedOn, latest: Decision | null, earlier: Decision[] }], outcomes: ["APPROVED","REFUSED"], sample: true, can: { decide: filingId[], withdraw, close, reopen } }`, `Decision = { id, outcome, decidedOn, note, recordedAt, recordedBy }`. `can` is the state only (keys stay with `/me`); it uses one helper shared with the POSTs so the two cannot drift. Shape in `contracts/runtime.ts` beside the bodies.
* **Writes:** the four POSTs unchanged; after each, invalidate the new read, the case read, the stage strip and the case list.
* **Tests (brief's, P-606):** `tests/check_csc1s_view.ts` DS1-DS2 (rows, flags, `can`; another firm 404; no show key 403; `can` matches each POST's answer, pass and fail per BR-2/4/5/6); `tests/check_csc1s_decision_browser.cjs` DS3-DS5 at 1440 and 375 px with axe (record → close → header → reopen at the same stage; withdraw → header; each refusal's words; no key: no buttons, a forced call 403; double click: one row); qa's `check_r177_case_decision.ts` 46/46; the existing CS-C1, C8.2 and case-page suites unchanged.

## 6b. Capability or scaffolding
Every element is capability, *Needed for the proof* (R1.77 Works). Scaffolding: the local sign-in stand-in (PF-4's, reused). *Not built:* §3's out-of-scope list.

## 7. Questions for the tech lead (recommendation first)
1. **Outcome words:** keep every outcome marked Sample (Build Lead C's ruling) and record the Guide 5256 quote here as evidence; dropping Sample for the visitor visa needs a per-pack list (AG-7-33 r4), a later row. *Recommended.*
2. **Other panels on a closed case** (AG-7-34 r4: no moves): a follow-up row that makes the case page read-only when closed; not this row (it widens the touch list). *Recommended.*
3. **A decision date in the future:** the API accepts up to 2200-12-31. Recommended: a one-line check in `contracts/runtime.ts` ("not after today") in part 2, or a follow-up row if the touch list must stay as briefed.

## 8. Definition of ready
Acceptance tests named (§6); row text in the brief; Build Lead C rulings of 18 Nov answer the brief's three questions (session through `staffApi`, panel under Submission, Sample words); challenge answered below in `challenge.md`'s Lead response. **Approval:** pending Build Lead C ("Approved for building" goes here).
