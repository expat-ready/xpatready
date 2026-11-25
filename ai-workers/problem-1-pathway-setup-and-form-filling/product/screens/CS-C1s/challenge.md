# CS-C1s: fresh challenge (part 1)

Fresh challenger, 18 Nov, did not draft the concept. Read: `concept.md`, `design/board.html` (+ PNGs), the brief (`claude/build-lead-c-647b40`), AG-07 v3.12 (AG-7-33, -34, -50, -13), `STANDARDS.md`, `EXPERIENCE.md` §2-§6, `QUALITY.md`, `PRODUCT.md`, and the code named below on branch `claude/serene-newton-knjcpc` (S = `prototype/studio/`). **Freshness:** `ai-workers/tools/freshness.sh` stops at once in this cloud copy (`code/README-copies.md` missing: `sources/` and `code/` are not here), so the team's code is not checked and the requirement copy `domain/requirements-2026-11-02/` is **Unverified** as the newest snapshot. The Guide 5256 quotes in concept §5 were checked word for word in `official-sources/ircc/instructions/guide-5256.html`.

## Verdict
**Build after these changes.** The shape is right (one panel, one read, the API decides, buttons from the server's `can`). Six Majors need a line each in the concept before part 2: four are plain facts in the code the concept leans on (the sign-in card, the staff query keys, earlier-stage filings, the shared-helper promise), one breaks an [M] copy rule on a drawn state, and one is an environment point to confirm. No Blocker.

## Objections

### Major
**M1. `SignInCard` cannot be reused "as is" in a dialog.** *Needed for the proof.* Confidence: high (fact).
* What breaks: the card renders `<h1 id="fo-sign-in">Sign in to your firm</h1>` in its own framed `section` (`mx-auto mt-6 max-w-md … shadow-sm`) and has no "signed in" callback (S `web/src/modules/platform/frame.tsx:17-43`). Inside the case page's Dialog (Radix title renders an h2, `web/src/components/ui/controls.tsx:85`) the page gets a second h1 below an h2, and you get a card inside a dialog with two titles ("Sign in…" plus "Sign in to your firm"). That breaks concept §4c BIC-20 "headings in order" and BIC-19 "one heading per panel". axe's `heading-order` and the reviewer's heading count would flag it.
* Example: the no-session state → **Sign in…** → dialog "Sign in" → inside it h1 "Sign in to your firm".
* Fix: pick one and write it in §2's Session row. (a) Show the card **inline in the panel body** instead of a dialog, with a one-prop change to `SignInCard` (a heading level, and no outer frame when embedded). That puts `frame.tsx` on the touch list, so ask Build Lead C first (the brief: "widening needs a question first"). Or (b) a dialog holding only the card's form, with the dialog's own title. Either way, the panel closes or replaces the sign-in when `useStaffToken()` turns non-null, because the card itself never says it is done.

**M2. The new read's query key must sit under the staff keys, or a sign-out leaves the last person's rows and buttons on screen.** *Needed for the proof.* Confidence: high (fact).
* What breaks: `setStaffToken` drops only queries under `["fo"]` and `["pf"]`, and `useLocalSignIn` re-reads only those (`session.ts:27,36,97`, break S2). A key like `["runtime","view",id,"decisions"]` survives a sign-out or a change of person. The Case officer then sees the Representative's **Close the case…** buttons, and pressing one ends in a 401. The concept never names the key.
* Fix: §6 names the key, e.g. `["pf","case-decisions",caseId,token]`, `enabled: !!token`, used by both the panel and the header line (one request, STANDARDS §5). After each write, invalidate it together with the actor-side keys the concept already lists (`["runtime","view",caseId]`, stage strip, case list).

**M3. Filings of an earlier stage block Close, but the panel cannot name them.** *Needed for the proof.* Confidence: medium (the code is a fact; how often sample data reaches it is not checked).
* What breaks: `close` and `locked` count **every active filing of the case, all stages** (`api/src/case-close.ts:60,142`). The Submission read the concept borrows its words from lists only the **current stage's** filings (`api/src/case-prepare.ts`, `filing.findMany({ where: { caseId, stageId: c.stage.id } })`). Starting the next stage leaves the old filings active, even unrecorded ones passed with a reason (P-237, `api/src/case-stages.ts:198-200`). So on a two-stage case the panel shows "every filing has a decision", the server's `can.close` says false, and Close answers 409 NOT_DECIDED. The undecided earlier filing has no row and no words. If that filing was never recorded as submitted, it can never take a decision (NOT_SUBMITTED), and Withdraw is refused once any decision exists: a dead end with no screen path.
* Fix (screen only, no rule change): build the rows from the **new read's** filings, not from the Submission read. The read returns for each filing its stage label (`case_stage.staff_name`) and the person's label. The Submission read's words are used only where its filing id matches. A row from an earlier stage reads "{stage} · {person} · Not submitted". The dead end itself is a rule question (question 1); it is not this row's to settle.

**M4. "One helper shared with the POSTs" contradicts the brief's "no change to the four actions".** *Needed for the proof.* Confidence: high (fact).
* What breaks: every check sits inline in `decide/withdraw/close/reopen` (`case-close.ts:107-111,125-126,141-142,157`). Sharing a helper means editing all four. The brief says "`case-close.ts` is otherwise CS-C1's: one added method, no change to the four actions". The concept promises both.
* Fix: choose one in §6. (a) A pure `allowed(c)` that the four actions also call. That is a refactor of their guard lines with unchanged words and codes (`check_csc1_close.ts` proves it), recorded as a deviation from the brief. Or (b) a separate `allowed` used only by `view`, kept honest by DS1's parity cases (pass and fail per BR-2/4/5/6). Both must copy review m2: Withdraw looks at decisions on **any** filing, active or not (`case-close.ts:62`). Recommendation: (b), which keeps the brief's touch list. The parity test is already planned.

**M5. The drawn refusals show requirement numbers on the main path.** *Needed for the proof.* Confidence: high (fact, and an [M] rule).
* What breaks: EXPERIENCE §5 [M], "no hashes, IDs, decision numbers … on the main path". The concept shows "the API's own words", and those carry rule ids: "…before the case is closed (AG-7-34 rule 2)…" (`case-close.ts:142`; drawn on board frame 5), "(AG-7-33 rule 2)" (`:111`), "(AG-7-50 rules 4 and 6)" (`:126`).
* Fix: remove the bracketed ids from those three detail strings. Tests match codes, not words (`tests/check_csc1_close.ts:242`), so this is a wording change, not a rule change. It widens `case-close.ts` beyond "one added method", so name it in the PR. If that is refused, the screen shows its own copy keyed by the 409 `code` (copy, not a rule). Either way, write §5's words for NOT_DECIDED, HAS_DECISION, NOT_SUBMITTED, CASE_CLOSED, CASE_OPEN and CHANGED.

**M6. Staff sign-in on the demo depends on settings the start scripts do not set.** *Needed for the proof* (the founder's walk, D17/D20). Confidence: medium (Unverified on the Mac).
* What breaks: with `PLATFORM_IDENTITY` unset there is "no staff sign-in on this server (every platform route 401s)" (`api/src/platform/identity/port.ts:5`). Sample staff exist only with `PLATFORM_SAMPLE_SEED=on`. `start.sh` and `tools/restart-api.sh` set neither, and no env file is loaded (`api/src/main.ts`); only `deploy/compose.test.yml:43-45` and isolated copies started with them do. If the Mac's shell does not export them, every **Sign in…** on the demo fails and the panel is a dead end at :4400. qa's walk and DS3-DS5 pass on isolated copies all the same.
* Fix: §1 names the settings the screen needs and the Sample sign-in (firm key `sample-firm`, the Representative's e-mail from `seed-sample-firms.ts:47`). Build Lead C confirms the demo runs with them. The no-session state also says what to do when the server has no staff sign-in (the sign-in's own refusal words, not a generic failure).

### Minor
* **m1. Close-outcome words not marked Sample: a silent deviation from the brief.** *Needed for the proof.* The brief says the close outcomes (WITHDRAWN, COMPLETED, CLOSED_BY_STAFF) are "labelled Sample". Concept §5 calls them "the product's, not IRCC's", and the board shows "Closed by staff" and "Withdrawn" with no mark. The concept's reasoning is sound: these are AG-7-34 data values, not immigration values (AGENTS rule 4). But it must be written in §7 as a deviation for Build Lead C to rule on.
* **m2. Rules cited but not built.** *Not built.* BR-3 cites AG-7-33 r5 (the filing moves to DECISION, the case to AFTER_DECISION). The API does not do this (`case-close.ts:7-8`, D9 Q54), and AG-7-34 r2 says "in After decision". AG-7-13 r4 (reopen a withdrawn case's filings) and r5 (clocks resume) are also not built. Move all three into §3's out-of-scope list.
* **m3. "Recorded by" needs a name, not `staff:<uuid>`.** *Needed for the proof.* `recordedBy` is stored as `staff:${ctx.staffId}` (`case-close.ts:112`). The board's "recorded by Representative" needs the read to resolve `platform_staff.display_name` in the same query (one request, no lookup per row; STANDARDS §5). An id on the main path breaks EXPERIENCE §5.
* **m4. `withdrawnOn` needs the newest WITHDRAWAL row.** *Needed for the proof.* A case can be withdrawn, reopened and withdrawn again, and the rows stay (`case-close.ts:128,160`). The read takes the newest `kind='WITHDRAWAL'` row by `recordedAt`, and only while `closeOutcome='WITHDRAWN'`.
* **m5. Header without a staff session.** *Needed for the proof.* The header line and the "Withdrawn" pill come from the staff read only; the actor-side case read has `status` alone (`cases.tsx:361`). With no staff session the header can only say "Closed". Write that state ("Closed" plus "Sign in as firm staff to see how it ended", or nothing more) so it is not left to the builder.
* **m6. 404 when signed in to the other Sample firm.** *Needed for the proof.* Acting as an officer of `sample-firm` while signed in to `sample-solo` gives 404 "No such case in your firm." (board frame 6). Add the firm from `/me` (`Me.firmKey`, `sales/contract.ts:14`): "You are signed in to {firm}; this case is another firm's. Sign in to its firm."
* **m7. TERMS_PENDING (428) is not drawn.** *Needed for the proof.* PF-5t refuses every route but the terms routes while terms are pending (`platform/terms/gate.ts:22`; `guard.ts`). One state line: the 428 words plus a link to accept them.
* **m8. Late load above the Agent view.** *Needed for the proof.* The panel loads after the page and sits above `OfficerPeoplePanel` and `#agent-view`. The comment at `cases.tsx:404-405` exists because a late load moved them (`check_c69_page_browser`'s focus check; the K13 hash scroll at `:345`). Give the skeleton a fixed height, and add `check_c69_page_browser.cjs` to §6's "unchanged" list.
* **m9. DS2's fail case needs a staff member with no roles.** *Needed for the proof.* Every role has `agent/case:show` in PF-3's seed (`migration.sql:593-598`: Owner, Admin, Case manager, Case officer, Billing, Read only). So "no show key → 403" needs a test staff member whose grants are ended. Write that in §6.
* **m10. qa's 46th check is weak proof.** *Needed for the proof.* `check_r177_case_decision.ts:150` passes as soon as any web file contains `cases/${…}/decisions`, so the new GET alone satisfies it. The real proof is DS3-DS5. Say so in §6 so "46/46" is not read as the screen's evidence.
* **m11. Touch list.** *Needed for the proof.* The read's shape goes in `contracts/runtime.ts` (§6, right by STANDARDS §6), but that file is not on the brief's touch list (the brief's "`runtime.ts` untouched" means `api/src/runtime.ts`). List it, and list `frame.tsx` if M1 (a) is chosen.
* **m12. Copy drift.** *Needed for the proof.* The no-session words differ: concept "Sign in as firm staff to record decisions." against board "…to see and record decisions. The Acting as person does not record decisions." Keep one. "Acting as" is demo-only chrome (PRODUCT.md), so prefer words that do not name it.

## What is sound
* **One read beside the four POSTs** in `features/case-close.ts`, under the platform guard. Facts: core's `ConfigReadGuard` lets a `/api/runtime/` route that declares keys through (`core.ts:95`). `PlatformGuard` then requires a bearer token and the key (`guard.ts:103-112`), and sets the firm (PF-12). No other `cases/:id/decisions` GET exists (checked across `api/src`).
* **`staffApi` shares the session with the case page:** the same SPA (`App.tsx:43`), the same tab's sessionStorage, a module-level token (`session.ts:44,68`). A 401 ends the session everywhere in the tab.
* **"Without the lock"** is right: `locked` takes `for update` (`case-close.ts:55`), and a GET must not. Firm scoping stays as in `locked`: firm key plus the platform firm id check (`:55,65-66`), 404 never 403.
* **Every field the read needs exists:** the closing fields on `runtime_case`, `withdrawnOn` from the WITHDRAWAL row's `decidedOn` (`case-close.ts:128`), the stage label from `case_stage.staff_name` through `closedFromStageId` (`cases.prisma:179`), and `submittedOn` from the filing record. No schema change and no migration, as briefed.
* **Keys and roles** match PF-3's seed exactly (`migration.sql:586-593`). An Admin can close but not reopen, and the concept's words for that are right.
* **`can` from the server plus keys from `/me`:** no rule is copied into the web (STANDARDS §7). Outcomes come from the read (`DECISION_OUTCOMES`, `contracts/runtime.ts:504`), not from web constants.
* **The idempotency key per dialog** matches the API's replay and fingerprint (`case-close.ts:98-105`). Focus goes back to the opener, or to the heading, as Submission does (`submission.tsx:81`).
* **Layout:** heading order h1 → h2 panel → h3 rows; dialog titles are h2 (fine inside a modal). At most one filled button per state (Close, Reopen). Withdraw stays quiet. The date is never defaulted. Sample marks sit on every outcome word, and the Guide 5256 quote is verified.
* **Out of scope** is named and kept small. No gold-plating found.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Filing rows (all active filings, every stage) | `runtime_filing` (active), `filing_record.submitted_on`, `case_stage.staff_name`, person label | `GET /api/runtime/cases/:id/decisions` (`agent/case:show`), `CaseClose.view` with no lock: one query with includes | BR-2 (submitted = has a record); M3 | DS1: a two-filing case and a two-stage case list every active filing with its stage |
| Latest decision + history | `case_decision` kind DECISION, newest by `recorded_at`; `platform_staff.display_name` for `recorded_by` | same read | BR-3 (a correction is a new row, the first kept) | DS1: after a correction, latest = new and earlier = 1; names, not ids |
| Header line | `runtime_case.close_outcome, closed_at, closed_reason, withdrawn_at, withdraw_reason, closed_from_stage_id`; newest WITHDRAWAL `decided_on` | same read | BR-4, BR-5 | DS3/DS4 browser: the header words after close and after withdraw |
| `can.decide / withdraw / close / reopen` | as above | same read; `allowed(c)` (M4) | BR-2/4/5/6: decide = OPEN and has a record; withdraw = OPEN and no DECISION on any filing; close = OPEN, ≥1 filing, all decided; reopen = CLOSED with an outcome | DS1 parity: for each, `can` true ⇔ the POST succeeds (pass and fail each) |
| Firm and key | `platform_firm.key = runtime_case.firm_key` | the guard plus `view` | BR-7 | DS1: another firm → 404; DS2: a staff member with no grants → 403 |
| Four dialogs | unchanged | the four POSTs, unchanged (M5 words aside) | AG-7-33/34/50/13 | DS3-DS5, qa's R1.77; `check_csc1_close.ts` unchanged |
| Session | sessionStorage token | `staffApi`, `/platform/me` | PF-4 | DS5: no key → no buttons, a forced call 403; sign-out → the rows are gone (M2) |

## Questions for the founder (≤3, recommendation first)
1. **A filing of an earlier stage that was never submitted blocks Close for ever** (M3: Close needs a decision on every active filing, a decision needs a submission, and Withdraw is refused after any decision). **Recommended:** in this row the panel only shows that filing and the API's reason. A follow-up row decides the rule: either Close counts only submitted filings, or such a filing is withdrawn on its own (AG-7-50 r3, waiting on D9 Q54). Alternative: settle the rule now, which changes `close` and widens this row.
2. **Close-outcome words** (m1). **Recommended:** "Withdrawn", "Closed by staff" and "Completed" are product words from AG-7-34, not IRCC's, so they carry no Sample mark. The decision outcomes stay Sample. Alternative: follow the brief and mark them Sample too.

## Lead response
Written by the concept's author (screens lane) on 18 Nov; Build Lead C reviews it and approves. M3 checked in `case-close.ts:60,142` and M6 in `start.sh`: both confirmed. Every Major is accepted and fixed in `concept.md` r2:
* **M1** accepted: `SignInCard` gains one `embedded` prop (h3, no card frame) and sits inline in the panel, replaced by the rows when `useStaffToken` sees the token (§4 states, §2, touch list).
* **M2** accepted: the query key is `["pf", "case-decisions", caseId, token]` (§6 Screen).
* **M3** accepted: the rows come from the new read, covering every active filing of every stage with its stage name. Close is not offered, and the unsubmitted filing is named (§4, BR-5). The rule itself goes to concept question 2 (as challenge question 1).
* **M4** accepted as recommended: the check is used only by the view, the four actions are unchanged, and DS1's parity cases keep them in step (§6).
* **M5** accepted, screen side: §5 gives the screen's own words for each refusal code and drops the rule numbers. The API text stays as it is, since the brief keeps the four actions unchanged.
* **M6** accepted: it is concept question 3, for Build Lead C to confirm before part 2.
* **Minors:**
  * m1: the close words now carry the Sample mark as the brief says, with no silent deviation. Challenge question 2 is answered by the brief, which labels the close outcomes Sample.
  * m2: moved to the out-of-scope list.
  * m3: "recorded by" shows the staff name.
  * m4: the withdrawal date comes from the newest withdrawal row.
  * m5: with no session, the header shows the Pill only.
  * m6: the 404 words name the firm.
  * m7: the 428 state is specified in §4 (in words; not a board frame).
  * m8: the panel keeps a fixed-height skeleton while loading.
  * m9: DS2 uses a staff member with no roles.
  * m10: DS3 is named as the screen's proof.
  * m11: the touch list now has `contracts/runtime.ts` and `frame.tsx`.
  * m12: the no-session words are aligned between concept and board, and no longer name the demo-only Acting as switch (review minor 2).

## Agreement

## Build discoveries
